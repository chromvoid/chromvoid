use super::keygen::generate_ssh_key_material;

#[test]
fn generates_ed25519_material() {
    let result = generate_ssh_key_material("ed25519", "user@test").expect("ed25519 keygen");
    assert_eq!(result.key_type, "ed25519");
    assert!(result.public_key_openssh.starts_with("ssh-ed25519 "));
    assert!(!result.fingerprint.is_empty());
}

#[test]
fn rejects_unsupported_key_type() {
    match generate_ssh_key_material("dsa", "user@test") {
        Ok(_) => panic!("must fail"),
        Err(error) => assert!(error.contains("Unsupported key type")),
    }
}
