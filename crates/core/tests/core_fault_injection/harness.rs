use chromvoid_core::storage::test_util::{FaultHandle, FaultRule, StorageOperation};

fn operation_count(handle: &FaultHandle, operation: StorageOperation) -> usize {
    handle
        .operations()
        .into_iter()
        .filter(|observed| *observed == operation)
        .count()
}

pub(crate) fn run_fail_on_each<F>(operation: StorageOperation, scenario: F)
where
    F: Fn(Option<FaultRule>) -> FaultHandle,
{
    let observed = operation_count(&scenario(None), operation);
    assert!(
        observed > 0,
        "scenario did not observe operation {operation:?}"
    );
    for fail_on in 1..=observed {
        scenario(Some(FaultRule { operation, fail_on }));
    }
}
