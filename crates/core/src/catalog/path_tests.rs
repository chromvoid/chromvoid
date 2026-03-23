use super::*;

#[test]
fn test_validate_name_empty() {
    let result = validate_name("");
    assert!(result.is_err());
}

#[test]
fn test_validate_name_with_slash() {
    let result = validate_name("a/b");
    assert!(result.is_err());
}

#[test]
fn test_validate_name_dot() {
    assert!(validate_name(".").is_err());
    assert!(validate_name("..").is_err());
}

#[test]
fn test_validate_name_valid() {
    assert!(validate_name("valid_name").is_ok());
    assert!(validate_name("file.txt").is_ok());
    assert!(validate_name("My Document").is_ok());
}
