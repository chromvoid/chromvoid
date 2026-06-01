use std::fmt;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone)]
pub(crate) struct DurableFileStore {
    root: PathBuf,
    #[cfg(test)]
    fault: Option<fault::FaultInjector>,
}

#[derive(Debug)]
pub(crate) enum DurableFileError {
    InvalidName(String),
    InvalidUtf8(std::string::FromUtf8Error),
    Io(io::Error),
}

impl fmt::Display for DurableFileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidName(name) => write!(f, "Invalid durable file name: {name}"),
            Self::InvalidUtf8(error) => error.fmt(f),
            Self::Io(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for DurableFileError {}

impl From<io::Error> for DurableFileError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<std::string::FromUtf8Error> for DurableFileError {
    fn from(error: std::string::FromUtf8Error) -> Self {
        Self::InvalidUtf8(error)
    }
}

impl DurableFileStore {
    pub(crate) fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            #[cfg(test)]
            fault: None,
        }
    }

    #[cfg(test)]
    pub(crate) fn fault_injecting_for_tests(
        root: impl Into<PathBuf>,
        rule: Option<fault::FaultRule>,
    ) -> (Self, fault::FaultHandle) {
        let (injector, handle) = fault::FaultInjector::new(rule);
        (
            Self {
                root: root.into(),
                fault: Some(injector),
            },
            handle,
        )
    }

    pub(crate) fn read(&self, name: &str) -> Result<Option<Vec<u8>>, DurableFileError> {
        let path = self.path_for(name)?;
        match fs::read(path) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    pub(crate) fn read_to_string(&self, name: &str) -> Result<Option<String>, DurableFileError> {
        let Some(bytes) = self.read(name)? else {
            return Ok(None);
        };
        Ok(Some(String::from_utf8(bytes)?))
    }

    pub(crate) fn write_atomic(&self, name: &str, bytes: &[u8]) -> Result<(), DurableFileError> {
        let final_path = self.path_for(name)?;
        let temp_path = self.temp_path_for(name)?;
        let mut renamed = false;

        let result = (|| {
            self.check_fault(fault_op::WRITE_TEMP)?;
            fs::create_dir_all(&self.root)?;
            {
                let mut file = File::create(&temp_path)?;
                file.write_all(bytes)?;

                self.check_fault(fault_op::SYNC_TEMP)?;
                file.sync_all()?;
            }

            self.check_fault(fault_op::RENAME_TEMP)?;
            fs::rename(&temp_path, &final_path)?;
            renamed = true;

            self.check_fault(fault_op::SYNC_PARENT)?;
            sync_dir(&self.root)?;
            Ok(())
        })();

        if result.is_err() && !renamed {
            let _ = fs::remove_file(&temp_path);
        }
        result
    }

    pub(crate) fn remove(&self, name: &str) -> Result<bool, DurableFileError> {
        let path = self.path_for(name)?;
        self.check_fault(fault_op::REMOVE)?;
        match fs::remove_file(&path) {
            Ok(()) => {
                self.check_fault(fault_op::SYNC_PARENT)?;
                sync_dir(&self.root)?;
                Ok(true)
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error.into()),
        }
    }

    fn path_for(&self, name: &str) -> Result<PathBuf, DurableFileError> {
        validate_name(name)?;
        Ok(self.root.join(name))
    }

    fn temp_path_for(&self, name: &str) -> Result<PathBuf, DurableFileError> {
        validate_name(name)?;
        let nonce = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        Ok(self
            .root
            .join(format!(".chromvoid-tmp.{name}.{now}.{nonce}")))
    }

    #[cfg(test)]
    fn check_fault(&self, operation: fault_op::Operation) -> Result<(), DurableFileError> {
        if let Some(fault) = &self.fault {
            fault.check(operation)?;
        }
        Ok(())
    }

    #[cfg(not(test))]
    fn check_fault(&self, _operation: fault_op::Operation) -> Result<(), DurableFileError> {
        Ok(())
    }
}

fn validate_name(name: &str) -> Result<(), DurableFileError> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || Path::new(name).components().count() != 1
    {
        return Err(DurableFileError::InvalidName(name.to_string()));
    }
    Ok(())
}

fn sync_dir(path: &Path) -> Result<(), DurableFileError> {
    File::open(path)?.sync_all()?;
    Ok(())
}

mod fault_op {
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub(crate) enum Operation {
        WriteTemp,
        SyncTemp,
        RenameTemp,
        SyncParent,
        Remove,
    }

    pub(crate) const WRITE_TEMP: Operation = Operation::WriteTemp;
    pub(crate) const SYNC_TEMP: Operation = Operation::SyncTemp;
    pub(crate) const RENAME_TEMP: Operation = Operation::RenameTemp;
    pub(crate) const SYNC_PARENT: Operation = Operation::SyncParent;
    pub(crate) const REMOVE: Operation = Operation::Remove;
}

#[cfg(test)]
pub(crate) mod fault {
    use std::sync::{Arc, Mutex};

    use super::{fault_op::Operation, DurableFileError};

    pub(crate) use super::fault_op::Operation as DurableFileOperation;

    #[derive(Debug, Clone, Copy)]
    pub(crate) struct FaultRule {
        pub(crate) operation: Operation,
        pub(crate) fail_on: usize,
    }

    #[derive(Debug, Default)]
    struct FaultState {
        rule: Option<FaultRule>,
        matching_seen: usize,
        log: Vec<Operation>,
    }

    #[derive(Clone, Debug)]
    pub(crate) struct FaultHandle {
        state: Arc<Mutex<FaultState>>,
    }

    impl FaultHandle {
        pub(crate) fn operations(&self) -> Vec<Operation> {
            self.state
                .lock()
                .expect("durable file fault state")
                .log
                .clone()
        }
    }

    #[derive(Clone, Debug)]
    pub(crate) struct FaultInjector {
        state: Arc<Mutex<FaultState>>,
    }

    impl FaultInjector {
        pub(crate) fn new(rule: Option<FaultRule>) -> (Self, FaultHandle) {
            let state = Arc::new(Mutex::new(FaultState {
                rule,
                matching_seen: 0,
                log: Vec::new(),
            }));
            (
                Self {
                    state: Arc::clone(&state),
                },
                FaultHandle { state },
            )
        }

        pub(crate) fn check(&self, operation: Operation) -> Result<(), DurableFileError> {
            let mut state = self.state.lock().expect("durable file fault state");
            state.log.push(operation);
            if let Some(rule) = state.rule {
                if rule.operation == operation {
                    state.matching_seen = state.matching_seen.saturating_add(1);
                    if state.matching_seen == rule.fail_on {
                        return Err(DurableFileError::Io(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!("injected durable file fault: {operation:?}"),
                        )));
                    }
                }
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fault::{DurableFileOperation, FaultRule};
    use super::*;

    fn temp_files(root: &Path) -> Vec<PathBuf> {
        let Ok(entries) = fs::read_dir(root) else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with(".chromvoid-tmp."))
            })
            .collect()
    }

    #[test]
    fn write_read_and_remove_roundtrip() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = DurableFileStore::new(temp.path().to_path_buf());

        store
            .write_atomic("license.cert.json", b"cert")
            .expect("write");
        assert_eq!(
            store.read("license.cert.json").expect("read"),
            Some(b"cert".to_vec())
        );
        assert!(store.remove("license.cert.json").expect("remove"));
        assert_eq!(store.read("license.cert.json").expect("read missing"), None);
        assert!(!store.remove("license.cert.json").expect("remove missing"));
    }

    #[test]
    fn rejects_escaped_file_names() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = DurableFileStore::new(temp.path().to_path_buf());

        for name in ["", ".", "..", "../cert", "nested/cert", "nested\\cert"] {
            assert!(store.write_atomic(name, b"x").is_err(), "{name}");
            assert!(store.read(name).is_err(), "{name}");
            assert!(store.remove(name).is_err(), "{name}");
        }
    }

    #[test]
    fn write_temp_fault_leaves_no_final_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let (store, handle) = DurableFileStore::fault_injecting_for_tests(
            temp.path().to_path_buf(),
            Some(FaultRule {
                operation: DurableFileOperation::WriteTemp,
                fail_on: 1,
            }),
        );

        assert!(store.write_atomic("license.cert.json", b"cert").is_err());
        assert_eq!(store.read("license.cert.json").expect("read"), None);
        assert!(temp_files(temp.path()).is_empty());
        assert_eq!(handle.operations(), vec![DurableFileOperation::WriteTemp]);
    }

    #[test]
    fn sync_temp_fault_cleans_temp_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let (store, handle) = DurableFileStore::fault_injecting_for_tests(
            temp.path().to_path_buf(),
            Some(FaultRule {
                operation: DurableFileOperation::SyncTemp,
                fail_on: 1,
            }),
        );

        assert!(store.write_atomic("license.cert.json", b"cert").is_err());
        assert_eq!(store.read("license.cert.json").expect("read"), None);
        assert!(temp_files(temp.path()).is_empty());
        assert_eq!(
            handle.operations(),
            vec![
                DurableFileOperation::WriteTemp,
                DurableFileOperation::SyncTemp
            ]
        );
    }

    #[test]
    fn rename_fault_preserves_existing_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        DurableFileStore::new(temp.path().to_path_buf())
            .write_atomic("license.cert.json", b"old")
            .expect("write old");
        let (store, _handle) = DurableFileStore::fault_injecting_for_tests(
            temp.path().to_path_buf(),
            Some(FaultRule {
                operation: DurableFileOperation::RenameTemp,
                fail_on: 1,
            }),
        );

        assert!(store.write_atomic("license.cert.json", b"new").is_err());
        assert_eq!(
            store.read("license.cert.json").expect("read"),
            Some(b"old".to_vec())
        );
        assert!(temp_files(temp.path()).is_empty());
    }

    #[test]
    fn parent_sync_fault_is_observable() {
        let temp = tempfile::tempdir().expect("tempdir");
        let (store, handle) = DurableFileStore::fault_injecting_for_tests(
            temp.path().to_path_buf(),
            Some(FaultRule {
                operation: DurableFileOperation::SyncParent,
                fail_on: 1,
            }),
        );

        assert!(store.write_atomic("license.cert.json", b"cert").is_err());
        assert!(handle
            .operations()
            .contains(&DurableFileOperation::SyncParent));
    }
}
