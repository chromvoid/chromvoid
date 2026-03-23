use super::*;
use tempfile::NamedTempFile;

use crate::gateway::state::{now_ms, GatewayState};
use crate::gateway::types::SiteGrant;

#[test]
fn allowed_paths() {
    assert!(helpers::is_allowed_path("/ws"));
    assert!(helpers::is_allowed_path("/pair"));
    assert!(helpers::is_allowed_path("/extension"));
    assert!(!helpers::is_allowed_path("/"));
    assert!(!helpers::is_allowed_path("/admin"));
    assert!(!helpers::is_allowed_path("/ws/extra"));
    assert!(!helpers::is_allowed_path(""));
}

#[test]
fn pin_to_psk_deterministic() {
    let a = helpers::pin_to_psk("123456");
    let b = helpers::pin_to_psk("123456");
    assert_eq!(a, b);
}

#[test]
fn pin_to_psk_different_pins() {
    assert_ne!(helpers::pin_to_psk("123456"), helpers::pin_to_psk("654321"));
}

#[test]
fn pin_to_psk_correct_length() {
    let psk = helpers::pin_to_psk("test");
    assert_eq!(psk.len(), 32);
}

#[test]
fn sensitive_command_requires_origin_when_site_grant_enabled() {
    let cfg = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(cfg.path().to_path_buf());

    let ext_id = "ext-test";
    let mut policy = st.get_or_create_policy(ext_id);
    policy.require_action_grant = false;
    policy.require_site_grant = true;
    st.set_policy(policy);

    let err =
        capability::check_capability(&mut st, ext_id, "passmanager:secret:read", None, None, None)
            .expect_err("origin should be required");

    assert_eq!(err, "origin required for sensitive command");
}

#[test]
fn sensitive_command_checks_site_grant_by_origin() {
    let cfg = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(cfg.path().to_path_buf());

    let ext_id = "ext-test";
    let mut policy = st.get_or_create_policy(ext_id);
    policy.require_action_grant = false;
    policy.require_site_grant = true;
    st.set_policy(policy);

    let origin = "https://example.com".to_string();
    let ts = now_ms();
    st.grant_store_mut(ext_id).site_grants.insert(
        origin.clone(),
        SiteGrant {
            grant_id: "sg-1".to_string(),
            extension_id: ext_id.to_string(),
            origin: origin.clone(),
            created_at_ms: ts,
            expires_at_ms: ts + 60_000,
        },
    );

    let ok = capability::check_capability(
        &mut st,
        ext_id,
        "passmanager:secret:read",
        None,
        Some(origin.as_str()),
        None,
    );

    assert!(ok.is_ok());

    let denied = capability::check_capability(
        &mut st,
        ext_id,
        "passmanager:secret:read",
        None,
        Some("https://evil.example"),
        None,
    )
    .expect_err("wrong origin must be denied");

    assert_eq!(denied, "no site grant for origin 'https://evil.example'");
}

#[test]
fn ik_msg1_is_larger_than_xx_msg1() {
    // IK msg1 contains encrypted initiator static key -> larger.
    // XX msg1 is just an ephemeral key -> smaller.
    let xx_params: snow::params::NoiseParams = helpers::NOISE_PATTERN_EXTENSION.parse().unwrap();
    let ik_params: snow::params::NoiseParams = helpers::NOISE_PATTERN_IK.parse().unwrap();

    let kp_i = snow::Builder::new(ik_params.clone())
        .generate_keypair()
        .unwrap();
    let kp_r = snow::Builder::new(ik_params.clone())
        .generate_keypair()
        .unwrap();

    // XX initiator msg1
    let kp_xx = snow::Builder::new(xx_params.clone())
        .generate_keypair()
        .unwrap();
    let mut xx_init = snow::Builder::new(xx_params)
        .local_private_key(&kp_xx.private)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut buf = vec![0u8; 65535];
    let xx_len = xx_init.write_message(&[], &mut buf).unwrap();

    // IK initiator msg1
    let mut ik_init = snow::Builder::new(ik_params)
        .local_private_key(&kp_i.private)
        .unwrap()
        .remote_public_key(&kp_r.public)
        .unwrap()
        .build_initiator()
        .unwrap();
    let ik_len = ik_init.write_message(&[], &mut buf).unwrap();

    // XX msg1 should be small (ephemeral key only, ~32 bytes)
    assert!(
        xx_len < helpers::IK_MSG1_MIN_SIZE,
        "XX msg1 ({xx_len}B) should be < {}B",
        helpers::IK_MSG1_MIN_SIZE
    );
    // IK msg1 should be large (contains encrypted static key, ~96+ bytes)
    assert!(
        ik_len >= helpers::IK_MSG1_MIN_SIZE,
        "IK msg1 ({ik_len}B) should be >= {}B",
        helpers::IK_MSG1_MIN_SIZE
    );
}

#[test]
fn ik_handshake_roundtrip_known_peer() {
    // Simulate IK handshake: initiator knows responder's public key.
    let ik_params: snow::params::NoiseParams = helpers::NOISE_PATTERN_IK.parse().unwrap();

    let kp_i = snow::Builder::new(ik_params.clone())
        .generate_keypair()
        .unwrap();
    let kp_r = snow::Builder::new(ik_params.clone())
        .generate_keypair()
        .unwrap();

    // Initiator: knows responder's public key
    let mut initiator = snow::Builder::new(ik_params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .remote_public_key(&kp_r.public)
        .unwrap()
        .build_initiator()
        .unwrap();

    // Responder: only has own private key (like gateway)
    let mut responder = snow::Builder::new(ik_params)
        .local_private_key(&kp_r.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; 65535];

    // IK msg1: -> e, es, s, ss
    let len1 = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len1].to_vec();
    assert!(
        msg1.len() >= helpers::IK_MSG1_MIN_SIZE,
        "IK msg1 should be large"
    );

    // Responder reads msg1, can identify initiator
    responder.read_message(&msg1, &mut buf).unwrap();
    let remote_static = responder.get_remote_static().unwrap();
    assert_eq!(
        remote_static, &kp_i.public,
        "responder should see initiator's pubkey"
    );

    // IK msg2: <- e, ee, se
    let len2 = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len2].to_vec();

    initiator.read_message(&msg2, &mut buf).unwrap();

    // Both transition to transport mode
    let mut transport_i = initiator.into_transport_mode().unwrap();
    let mut transport_r = responder.into_transport_mode().unwrap();

    // Verify encrypted communication works
    let plaintext = b"IK reconnect test";
    let len = transport_i.write_message(plaintext, &mut buf).unwrap();
    let ct = buf[..len].to_vec();
    let len = transport_r.read_message(&ct, &mut buf).unwrap();
    assert_eq!(&buf[..len], plaintext);
}

#[test]
fn xx_handshake_roundtrip_unknown_peer() {
    // Simulate XX handshake: neither side knows the other.
    let xx_params: snow::params::NoiseParams = helpers::NOISE_PATTERN_EXTENSION.parse().unwrap();

    let kp_i = snow::Builder::new(xx_params.clone())
        .generate_keypair()
        .unwrap();
    let kp_r = snow::Builder::new(xx_params.clone())
        .generate_keypair()
        .unwrap();

    let mut initiator = snow::Builder::new(xx_params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut responder = snow::Builder::new(xx_params)
        .local_private_key(&kp_r.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; 65535];

    // XX msg1: -> e
    let len1 = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len1].to_vec();
    assert!(
        msg1.len() < helpers::IK_MSG1_MIN_SIZE,
        "XX msg1 should be small"
    );

    responder.read_message(&msg1, &mut buf).unwrap();

    // XX msg2: <- e, ee, s, es
    let len2 = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len2].to_vec();
    initiator.read_message(&msg2, &mut buf).unwrap();

    // XX msg3: -> s, se
    let len3 = initiator.write_message(&[], &mut buf).unwrap();
    let msg3 = buf[..len3].to_vec();
    responder.read_message(&msg3, &mut buf).unwrap();

    // Responder can now identify initiator
    let remote_static = responder.get_remote_static().unwrap();
    assert_eq!(
        remote_static, &kp_i.public,
        "responder should see initiator's pubkey after XX"
    );

    // Both transition to transport mode
    let mut transport_i = initiator.into_transport_mode().unwrap();
    let mut transport_r = responder.into_transport_mode().unwrap();

    let plaintext = b"XX first-time test";
    let len = transport_i.write_message(plaintext, &mut buf).unwrap();
    let ct = buf[..len].to_vec();
    let len = transport_r.read_message(&ct, &mut buf).unwrap();
    assert_eq!(&buf[..len], plaintext);
}

#[test]
fn ik_fails_with_wrong_responder_key() {
    // If initiator uses wrong responder pubkey, IK handshake fails.
    // This simulates the anti-downgrade scenario: IK fails -> should log warning.
    let ik_params: snow::params::NoiseParams = helpers::NOISE_PATTERN_IK.parse().unwrap();

    let kp_i = snow::Builder::new(ik_params.clone())
        .generate_keypair()
        .unwrap();
    let kp_r_real = snow::Builder::new(ik_params.clone())
        .generate_keypair()
        .unwrap();
    let kp_r_wrong = snow::Builder::new(ik_params.clone())
        .generate_keypair()
        .unwrap();

    // Initiator thinks responder has kp_r_wrong's key
    let mut initiator = snow::Builder::new(ik_params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .remote_public_key(&kp_r_wrong.public)
        .unwrap()
        .build_initiator()
        .unwrap();

    // Responder actually has kp_r_real's key
    let mut responder = snow::Builder::new(ik_params)
        .local_private_key(&kp_r_real.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; 65535];

    // IK msg1 from initiator (encrypted with wrong key)
    let len1 = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len1].to_vec();

    // Responder should fail to read msg1 (decryption failure)
    let result = responder.read_message(&msg1, &mut buf);
    assert!(
        result.is_err(),
        "IK should fail when initiator uses wrong responder pubkey"
    );
}

#[test]
fn ensure_gateway_keypair_stores_only_once() {
    let cfg = NamedTempFile::new().expect("tempfile");
    let mut st = GatewayState::load_or_default(cfg.path().to_path_buf());

    assert!(st.config.gateway_privkey_hex.is_none());

    let params: snow::params::NoiseParams = helpers::NOISE_PATTERN_EXTENSION.parse().unwrap();
    let kp1 = snow::Builder::new(params.clone())
        .generate_keypair()
        .unwrap();
    let kp2 = snow::Builder::new(params).generate_keypair().unwrap();

    st.ensure_gateway_keypair(&kp1);
    let stored = st.config.gateway_privkey_hex.clone().unwrap();
    assert!(!stored.is_empty());

    // Second call should NOT overwrite
    st.ensure_gateway_keypair(&kp2);
    assert_eq!(
        st.config.gateway_privkey_hex.as_ref().unwrap(),
        &stored,
        "ensure_gateway_keypair should not overwrite existing key"
    );
}

#[test]
fn hex_decode_roundtrip() {
    use crate::gateway::state::hex_encode;
    let original = [0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x23, 0x45, 0x67];
    let encoded = hex_encode(&original);
    let decoded = helpers::hex_decode(&encoded).unwrap();
    assert_eq!(decoded, original);
}

#[test]
fn noise_pattern_constants_are_correct() {
    assert_eq!(
        helpers::NOISE_PATTERN_PAIR,
        "Noise_XXpsk0_25519_ChaChaPoly_BLAKE2s"
    );
    assert_eq!(
        helpers::NOISE_PATTERN_EXTENSION,
        "Noise_XX_25519_ChaChaPoly_BLAKE2s"
    );
    assert_eq!(
        helpers::NOISE_PATTERN_IK,
        "Noise_IK_25519_ChaChaPoly_BLAKE2s"
    );
}

#[test]
fn browser_extension_xxpsk0_msg1_is_accepted_with_matching_pin() {
    let params: snow::params::NoiseParams = helpers::NOISE_PATTERN_PAIR.parse().unwrap();
    let builder = snow::Builder::new(params);
    let kp_r = builder.generate_keypair().unwrap();
    let mut responder = builder
        .local_private_key(&kp_r.private)
        .unwrap()
        .psk(0, &helpers::pin_to_psk("123456"))
        .unwrap()
        .build_responder()
        .unwrap();

    let msg1 = helpers::hex_decode(
        "9506ebf94f145f7f027e332f1256a3dd02ff353192b6a2c10ad1012cdd92257bb9aa0dbcac4afd101972c94c16c88ce4",
    )
    .unwrap();

    let mut buf = vec![0u8; 65535];
    let result = responder.read_message(&msg1, &mut buf);
    assert!(
        result.is_ok(),
        "server should accept browser extension XXpsk0 msg1 with matching PIN-derived psk"
    );
}

#[test]
fn browser_extension_xx_msg1_is_accepted() {
    let params: snow::params::NoiseParams = helpers::NOISE_PATTERN_EXTENSION.parse().unwrap();
    let builder = snow::Builder::new(params);
    let kp_r = builder.generate_keypair().unwrap();
    let mut responder = builder
        .local_private_key(&kp_r.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let msg1 =
        helpers::hex_decode("b1fe7aebb1fe6569094dd570823db9ea1000ff42000d0bc98fa07adc0186bc6c")
            .unwrap();

    let mut buf = vec![0u8; 65535];
    let result = responder.read_message(&msg1, &mut buf);
    assert!(
        result.is_ok(),
        "server should accept browser extension XX msg1"
    );
}
