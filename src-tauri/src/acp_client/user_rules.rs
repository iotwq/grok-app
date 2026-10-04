//! Keep the real user's global instructions available to isolated agent homes.
//! Grok Build loads `$GROK_HOME/rules/*.md` alongside its own AGENTS.md.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

const MANAGED_FILE: &str = "grok-app-user-agents.md";
const HEADER: &str = "<!-- Managed by Grok App from ~/.grok/AGENTS.md; edit the source file. -->\n\n# User instructions from ~/.grok/AGENTS.md\n\n";

/// Shared mode already loads these instructions natively. For an isolated
/// profile, refresh only our managed rules file before opening a session.
/// Never modify the source, profile AGENTS.md, or project rules.
pub(super) fn sync(user_home: &Path, grok_home: &Path) -> Result<(), String> {
    let shared_home = user_home.join(".grok");
    if grok_home == shared_home
        || fs::canonicalize(grok_home)
            .ok()
            .is_some_and(|home| fs::canonicalize(&shared_home).ok().as_ref() == Some(&home))
    {
        return Ok(());
    }

    let source = shared_home.join("AGENTS.md");
    let target = grok_home.join("rules").join(MANAGED_FILE);
    // No rules is normal. Do not create an empty profile just to remove a
    // file that never existed; stale generated rules must still be removed.
    if !source
        .try_exists()
        .map_err(|e| format!("{}: {e}", source.display()))?
        && !target
            .try_exists()
            .map_err(|e| format!("{}: {e}", target.display()))?
    {
        return Ok(());
    }
    crate::store_lock::with_exclusive_lock(&target, || {
        let contents = read_optional(&source)?;
        let previous = read_optional(&target)?;
        if previous
            .as_ref()
            .is_some_and(|text| !text.starts_with(HEADER))
        {
            return Err(format!(
                "User rules sync will not overwrite {}: not an App-managed file",
                target.display()
            ));
        }
        let updated = contents
            .filter(|text| !text.trim().is_empty())
            .map(|text| format!("{HEADER}{text}"));
        if updated == previous {
            return Ok(());
        }
        match updated {
            Some(text) => crate::store_lock::write_bytes_replace(&target, text.as_bytes()),
            None if previous.is_some() => {
                fs::remove_file(&target).map_err(|e| format!("remove {}: {e}", target.display()))
            }
            None => Ok(()),
        }
    })
}

fn read_optional(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("read {}: {error}", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct Fixture {
        root: PathBuf,
        user: PathBuf,
        profile: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("grok-user-rules-{}", uuid::Uuid::new_v4()));
            let user = root.join("user");
            let profile = root.join("app/agent-home");
            fs::create_dir_all(user.join(".grok")).unwrap();
            Self {
                root,
                user,
                profile,
            }
        }
        fn source(&self) -> PathBuf {
            self.user.join(".grok/AGENTS.md")
        }
        fn target(&self) -> PathBuf {
            self.profile.join("rules").join(MANAGED_FILE)
        }
        fn sync(&self) -> Result<(), String> {
            sync(&self.user, &self.profile)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn missing_source_does_not_create_profile() {
        let f = Fixture::new();
        f.sync().unwrap();
        assert!(!f.profile.exists());
    }

    #[test]
    fn isolated_profile_receives_full_utf8_rules_without_replacing_existing_rules() {
        let f = Fixture::new();
        let text = format!("请使用中文。\r\n{}\r\n最后一条规则", "规则".repeat(20_000));
        fs::write(f.source(), &text).unwrap();
        fs::create_dir_all(f.profile.join("rules")).unwrap();
        fs::write(f.profile.join("AGENTS.md"), "Profile instructions").unwrap();
        fs::write(f.profile.join("rules/custom.md"), "Other instructions").unwrap();
        f.sync().unwrap();
        assert_eq!(
            fs::read_to_string(f.target()).unwrap(),
            format!("{HEADER}{text}")
        );
        assert_eq!(fs::read_to_string(f.source()).unwrap(), text);
        assert_eq!(
            fs::read_to_string(f.profile.join("AGENTS.md")).unwrap(),
            "Profile instructions"
        );
        assert_eq!(
            fs::read_to_string(f.profile.join("rules/custom.md")).unwrap(),
            "Other instructions"
        );
    }

    #[test]
    fn changes_refresh_and_unchanged_rules_do_not_rewrite() {
        let f = Fixture::new();
        fs::write(f.source(), "First rule").unwrap();
        f.sync().unwrap();
        let modified = fs::metadata(f.target()).unwrap().modified().unwrap();
        f.sync().unwrap();
        assert_eq!(
            fs::metadata(f.target()).unwrap().modified().unwrap(),
            modified
        );
        fs::write(f.source(), "Changed rule").unwrap();
        f.sync().unwrap();
        assert_eq!(
            fs::read_to_string(f.target()).unwrap(),
            format!("{HEADER}Changed rule")
        );
    }

    #[test]
    fn empty_or_deleted_source_removes_only_managed_copy() {
        let f = Fixture::new();
        for empty in [false, true] {
            fs::write(f.source(), "Initial rule").unwrap();
            f.sync().unwrap();
            fs::write(f.profile.join("rules/custom.md"), "Keep me").unwrap();
            if empty {
                fs::write(f.source(), " \r\n\t").unwrap();
            } else {
                fs::remove_file(f.source()).unwrap();
            }
            f.sync().unwrap();
            assert!(!f.target().exists());
            assert_eq!(
                fs::read_to_string(f.profile.join("rules/custom.md")).unwrap(),
                "Keep me"
            );
        }
    }

    #[test]
    fn shared_home_leaves_native_loader_as_only_source() {
        let f = Fixture::new();
        fs::write(f.source(), "Native global instructions").unwrap();
        sync(&f.user, &f.user.join(".grok")).unwrap();
        assert!(!f.user.join(".grok/rules").exists());
        assert_eq!(
            fs::read_to_string(f.source()).unwrap(),
            "Native global instructions"
        );
    }

    #[cfg(unix)]
    #[test]
    fn shared_home_symlink_does_not_duplicate_native_rules() {
        let f = Fixture::new();
        fs::write(f.source(), "Native global instructions").unwrap();
        let alias = f.root.join("home-alias");
        std::os::unix::fs::symlink(f.user.join(".grok"), &alias).unwrap();
        sync(&f.user, &alias).unwrap();
        assert!(!f.user.join(".grok/rules").exists());
    }

    #[test]
    fn unreadable_source_reports_path_without_removing_previous_rules() {
        let f = Fixture::new();
        fs::write(f.source(), "Original instructions").unwrap();
        f.sync().unwrap();
        fs::write(f.source(), [0xff, 0xfe]).unwrap();
        let error = f.sync().unwrap_err();
        assert!(error.contains("AGENTS.md"));
        assert_eq!(
            fs::read_to_string(f.target()).unwrap(),
            format!("{HEADER}Original instructions")
        );
    }

    #[test]
    fn refuses_to_replace_or_delete_unmanaged_file() {
        let f = Fixture::new();
        fs::create_dir_all(f.profile.join("rules")).unwrap();
        fs::write(f.target(), "User-owned contents").unwrap();
        assert!(f.sync().unwrap_err().contains("not an App-managed file"));
        fs::write(f.source(), "New global instructions").unwrap();
        assert!(f.sync().unwrap_err().contains("not an App-managed file"));
        assert_eq!(
            fs::read_to_string(f.target()).unwrap(),
            "User-owned contents"
        );
    }
}
