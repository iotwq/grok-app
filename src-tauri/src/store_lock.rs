//! Advisory file locks for App JSON store (E06 shared / multi-instance).
//!
//! CLI and a second App window may touch the same data root in `shared` mode.
//! We take an exclusive lock around read-modify-write of index files so the
//! index is not half-written, and use temp+rename for atomic replace.

use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::{Condvar, LazyLock, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use fs2::FileExt;

/// How long to wait for a lock before failing with a clear error.
const LOCK_WAIT: Duration = Duration::from_secs(3);
const LOCK_POLL: Duration = Duration::from_millis(40);

/// `fs2` locks coordinate separate processes, but some platforms treat a
/// second descriptor in the same process as re-entrant.  Keep an in-process
/// guard as well so two threads can never interleave a read-modify-write
/// transaction (the common path for stream/journal updates).
static PROCESS_STORE_LOCKS: LazyLock<(Mutex<HashSet<PathBuf>>, Condvar)> =
    LazyLock::new(|| (Mutex::new(HashSet::new()), Condvar::new()));

struct ProcessStoreLock(PathBuf);

impl ProcessStoreLock {
    fn acquire(path: PathBuf, deadline: Instant) -> Result<Self, String> {
        let (held, released) = &*PROCESS_STORE_LOCKS;
        let mut held = held.lock().unwrap_or_else(|e| e.into_inner());
        while held.contains(&path) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(format!(
                    "LOCK_BUSY: could not lock {} within {}ms",
                    path.display(),
                    LOCK_WAIT.as_millis()
                ));
            }
            (held, _) = released
                .wait_timeout(held, remaining)
                .unwrap_or_else(|e| e.into_inner());
        }
        held.insert(path.clone());
        Ok(Self(path))
    }
}

impl Drop for ProcessStoreLock {
    fn drop(&mut self) {
        let (held, released) = &*PROCESS_STORE_LOCKS;
        held.lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.0);
        released.notify_all();
    }
}

/// Sidecar lock path for `foo.json` → `foo.json.lock`.
pub fn lock_path_for(target: &Path) -> PathBuf {
    let mut s = target.as_os_str().to_os_string();
    s.push(".lock");
    PathBuf::from(s)
}

/// Holds an exclusive lock until dropped.
pub struct ExclusiveLock {
    // Serialize only this file, including platforms with process-scoped locks.
    _process_guard: ProcessStoreLock,
    _file: File,
}

impl Drop for ExclusiveLock {
    fn drop(&mut self) {
        // Best-effort unlock; File drop also releases the lock on most OSes.
        let _ = self._file.unlock();
    }
}

/// Acquire exclusive lock for `target` (creates `target.lock`).
pub fn lock_exclusive(target: &Path) -> Result<ExclusiveLock, String> {
    let deadline = Instant::now() + LOCK_WAIT;
    let path = lock_path_for(target);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("lock dir: {e}"))?;
    }
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|e| format!("open lock {}: {e}", path.display()))?;

    // Canonicalize the sidecar after creation so relative/symlink aliases share
    // a reservation. Waiting on this file never holds up unrelated journals.
    let key =
        fs::canonicalize(&path).map_err(|e| format!("resolve lock {}: {e}", path.display()))?;
    let process_guard = ProcessStoreLock::acquire(key, deadline)?;
    loop {
        match file.try_lock_exclusive() {
            Ok(()) => {
                return Ok(ExclusiveLock {
                    _process_guard: process_guard,
                    _file: file,
                });
            }
            Err(_) if Instant::now() < deadline => {
                thread::sleep(LOCK_POLL);
            }
            Err(e) => {
                return Err(format!(
                    "LOCK_BUSY: could not lock {} within {}ms ({e})",
                    path.display(),
                    LOCK_WAIT.as_millis()
                ));
            }
        }
    }
}

/// Run `body` while holding an exclusive lock on `target`.
pub fn with_exclusive_lock<T>(
    target: &Path,
    body: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let _lock = lock_exclusive(target)?;
    body()
}

/// Write bytes to `path` via temp file + rename (caller must hold the lock).
pub fn write_bytes_replace(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = {
        let mut p = path.as_os_str().to_os_string();
        p.push(".tmp");
        PathBuf::from(p)
    };
    fs::write(&tmp, bytes).map_err(|e| format!("write temp: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("rename into place: {e}")
    })?;
    Ok(())
}

/// Write bytes to `path` via temp file + rename under exclusive lock.
pub fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    with_exclusive_lock(path, || write_bytes_replace(path, bytes))
}

/// True if error string is a lock contention failure.
#[allow(dead_code)]
pub fn is_lock_busy(err: &str) -> bool {
    err.contains("LOCK_BUSY")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};
    use std::thread;

    fn tmp_file(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "grok-store-lock-{}-{}-{}",
            name,
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        p
    }

    #[test]
    fn lock_path_suffix() {
        let p = PathBuf::from("/tmp/sessions_index.json");
        assert_eq!(
            lock_path_for(&p),
            PathBuf::from("/tmp/sessions_index.json.lock")
        );
    }

    #[test]
    fn atomic_write_roundtrip() {
        let path = tmp_file("atomic.json");
        write_bytes_atomic(&path, br#"{"ok":true}"#).unwrap();
        let s = fs::read_to_string(&path).unwrap();
        assert!(s.contains("ok"));
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(lock_path_for(&path));
    }

    #[test]
    fn exclusive_blocks_second_holder() {
        let path = tmp_file("block.json");
        let barrier = Arc::new(Barrier::new(2));
        let path2 = path.clone();
        let b2 = Arc::clone(&barrier);

        let t = thread::spawn(move || {
            let _lock = lock_exclusive(&path2).expect("first lock");
            b2.wait();
            // Hold long enough for the other thread to time out path.
            thread::sleep(Duration::from_millis(200));
        });

        barrier.wait();
        // Second lock should fail quickly if we shrink wait — use direct try.
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lock_path_for(&path))
            .unwrap();
        let busy = file.try_lock_exclusive().is_err();
        assert!(busy, "second exclusive lock should be busy");
        t.join().unwrap();
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(lock_path_for(&path));
    }

    #[test]
    fn is_lock_busy_detects_prefix() {
        assert!(is_lock_busy("LOCK_BUSY: could not lock"));
        assert!(!is_lock_busy("write temp: disk full"));
    }

    #[test]
    fn an_unrelated_file_can_be_written_while_another_is_locked() {
        let first = tmp_file("held.json");
        let second = tmp_file("independent.json");
        let lock = lock_exclusive(&first).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let second_for_thread = second.clone();
        let worker = thread::spawn(move || {
            tx.send(write_bytes_atomic(&second_for_thread, b"saved"))
                .unwrap();
        });
        let result = rx.recv_timeout(Duration::from_secs(1));
        drop(lock);
        worker.join().unwrap();
        result.expect("unrelated file was blocked").unwrap();
        assert_eq!(fs::read(&second).unwrap(), b"saved");
        let _ = fs::remove_file(&second);
        let _ = fs::remove_file(lock_path_for(&first));
        let _ = fs::remove_file(lock_path_for(&second));
    }

    #[test]
    fn same_file_reservation_times_out_and_recovers_after_release() {
        let path = tmp_file("timeout.json");
        let lock = lock_exclusive(&path).unwrap();
        let started = Instant::now();
        let error = lock_exclusive(&path)
            .err()
            .expect("same file must time out");
        assert!(is_lock_busy(&error));
        assert!(started.elapsed() < LOCK_WAIT + Duration::from_secs(1));
        drop(lock);
        drop(lock_exclusive(&path).unwrap());
        let _ = fs::remove_file(lock_path_for(&path));
    }
}
