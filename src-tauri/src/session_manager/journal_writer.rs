//! One in-flight write and one cumulative pending snapshot per live session.
//! Forced boundaries serialize with that worker and invalidate older snapshots.

use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};

use parking_lot::Mutex;

use super::{PendingStreamJournalFlush, SessionManager};

#[derive(Default)]
struct WriterState {
    pending: Option<PendingStreamJournalFlush>,
    running: bool,
    committed_revision: u64,
}

#[derive(Default)]
pub(super) struct StreamJournalWriter {
    next_revision: AtomicU64,
    state: Mutex<WriterState>,
    pub(super) write_lock: Mutex<()>,
}

impl StreamJournalWriter {
    pub(super) fn revision(&self) -> u64 {
        self.next_revision.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub(super) fn commit(self: &Arc<Self>, pending: PendingStreamJournalFlush) {
        if pending.force {
            let _write = self.write_lock.lock();
            {
                let mut state = self.state.lock();
                if pending.revision <= state.committed_revision {
                    return;
                }
                state.committed_revision = pending.revision;
                if state
                    .pending
                    .as_ref()
                    .is_some_and(|p| p.revision <= pending.revision)
                {
                    state.pending = None;
                }
            }
            // Keep boundaries synchronous: no old worker can append after a
            // terminal marker, a rewind, or a following user message.
            SessionManager::write_stream_journal_flush(pending);
            return;
        }
        let mut state = self.state.lock();
        if pending.revision <= state.committed_revision
            || state
                .pending
                .as_ref()
                .is_some_and(|p| p.revision >= pending.revision)
        {
            return;
        }
        // Buffers are cumulative, so only the newest intermediate snapshot is
        // needed while disk is busy. Never create a task per token/paragraph.
        state.pending = Some(pending);
        if state.running {
            return;
        }
        state.running = true;
        let writer = Arc::clone(self);
        tauri::async_runtime::spawn_blocking(move || writer.drain());
    }

    fn drain(&self) {
        loop {
            // Take the snapshot after the write lock: a forced boundary may
            // have invalidated it while this worker was waiting.
            let _write = self.write_lock.lock();
            let pending = {
                let mut state = self.state.lock();
                let Some(pending) = state.pending.take() else {
                    state.running = false;
                    return;
                };
                state.committed_revision = pending.revision;
                pending
            };
            SessionManager::write_stream_journal_flush(pending);
        }
    }

    #[cfg(test)]
    pub(super) fn has_pending(&self) -> bool {
        self.state.lock().pending.is_some()
    }
}
