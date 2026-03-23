use super::*;
use snow::Builder;

#[test]
fn noise_xx_roundtrip_in_memory() {
    let params: snow::params::NoiseParams = NOISE_PARAMS_XX.parse().unwrap();
    let kp_i = Builder::new(params.clone()).generate_keypair().unwrap();
    let kp_r = Builder::new(params.clone()).generate_keypair().unwrap();

    let mut initiator = Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut responder = Builder::new(params.clone())
        .local_private_key(&kp_r.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len].to_vec();

    responder.read_message(&msg1, &mut buf).unwrap();
    let len = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len].to_vec();

    initiator.read_message(&msg2, &mut buf).unwrap();
    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg3 = buf[..len].to_vec();

    responder.read_message(&msg3, &mut buf).unwrap();

    let mut transport_i = initiator.into_transport_mode().unwrap();
    let mut transport_r = responder.into_transport_mode().unwrap();

    let plaintext = b"Hello Orange Pi!";
    let len = transport_i.write_message(plaintext, &mut buf).unwrap();
    let ciphertext = buf[..len].to_vec();

    let len = transport_r.read_message(&ciphertext, &mut buf).unwrap();
    assert_eq!(&buf[..len], plaintext);

    let reply = b"Hello Desktop!";
    let len = transport_r.write_message(reply, &mut buf).unwrap();
    let ciphertext = buf[..len].to_vec();

    let len = transport_i.read_message(&ciphertext, &mut buf).unwrap();
    assert_eq!(&buf[..len], reply);
}

#[test]
fn noise_xxpsk0_roundtrip_in_memory() {
    let params: snow::params::NoiseParams = NOISE_PARAMS_XXPSK0.parse().unwrap();

    let kp_i = Builder::new(params.clone()).generate_keypair().unwrap();
    let kp_r = Builder::new(params.clone()).generate_keypair().unwrap();

    let psk = [9u8; 32];

    let mut initiator = Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .psk(0, &psk)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut responder = Builder::new(params.clone())
        .local_private_key(&kp_r.private)
        .unwrap()
        .psk(0, &psk)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len].to_vec();

    responder.read_message(&msg1, &mut buf).unwrap();
    let len = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len].to_vec();

    initiator.read_message(&msg2, &mut buf).unwrap();
    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg3 = buf[..len].to_vec();

    responder.read_message(&msg3, &mut buf).unwrap();

    let mut transport_i = initiator.into_transport_mode().unwrap();
    let mut transport_r = responder.into_transport_mode().unwrap();

    let plaintext = b"Hello XXpsk0!";
    let len = transport_i.write_message(plaintext, &mut buf).unwrap();
    let ciphertext = buf[..len].to_vec();
    let len = transport_r.read_message(&ciphertext, &mut buf).unwrap();
    assert_eq!(&buf[..len], plaintext);

    let reply = b"Reply XXpsk0";
    let len = transport_r.write_message(reply, &mut buf).unwrap();
    let ciphertext = buf[..len].to_vec();
    let len = transport_i.read_message(&ciphertext, &mut buf).unwrap();
    assert_eq!(&buf[..len], reply);
}

#[test]
fn noise_ik_roundtrip_in_memory() {
    let params: snow::params::NoiseParams = NOISE_PARAMS_IK.parse().unwrap();
    let kp_i = Builder::new(params.clone()).generate_keypair().unwrap();
    let kp_r = Builder::new(params.clone()).generate_keypair().unwrap();

    let mut initiator = Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .remote_public_key(&kp_r.public)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut responder = Builder::new(params.clone())
        .local_private_key(&kp_r.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len].to_vec();

    responder.read_message(&msg1, &mut buf).unwrap();
    let len = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len].to_vec();

    initiator.read_message(&msg2, &mut buf).unwrap();

    let mut transport_i = initiator.into_transport_mode().unwrap();
    let mut transport_r = responder.into_transport_mode().unwrap();

    let plaintext = b"IK reconnect payload";
    let len = transport_i.write_message(plaintext, &mut buf).unwrap();
    let ciphertext = buf[..len].to_vec();

    let len = transport_r.read_message(&ciphertext, &mut buf).unwrap();
    assert_eq!(&buf[..len], plaintext);

    let reply = b"IK reconnect ack";
    let len = transport_r.write_message(reply, &mut buf).unwrap();
    let ciphertext = buf[..len].to_vec();

    let len = transport_i.read_message(&ciphertext, &mut buf).unwrap();
    assert_eq!(&buf[..len], reply);
}

#[test]
fn noise_transport_encrypt_decrypt() {
    let params: snow::params::NoiseParams = NOISE_PARAMS_XX.parse().unwrap();
    let kp_i = Builder::new(params.clone()).generate_keypair().unwrap();
    let kp_r = Builder::new(params.clone()).generate_keypair().unwrap();

    let mut initiator = Builder::new(params.clone())
        .local_private_key(&kp_i.private)
        .unwrap()
        .build_initiator()
        .unwrap();
    let mut responder = Builder::new(params.clone())
        .local_private_key(&kp_r.private)
        .unwrap()
        .build_responder()
        .unwrap();

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg1 = buf[..len].to_vec();

    responder.read_message(&msg1, &mut buf).unwrap();
    let len = responder.write_message(&[], &mut buf).unwrap();
    let msg2 = buf[..len].to_vec();

    initiator.read_message(&msg2, &mut buf).unwrap();
    let len = initiator.write_message(&[], &mut buf).unwrap();
    let msg3 = buf[..len].to_vec();

    responder.read_message(&msg3, &mut buf).unwrap();

    let remote_pub_i = initiator
        .get_remote_static()
        .expect("initiator should see responder pubkey")
        .to_vec();
    let remote_pub_r = responder
        .get_remote_static()
        .expect("responder should see initiator pubkey")
        .to_vec();

    let transport_i = initiator.into_transport_mode().unwrap();
    let transport_r = responder.into_transport_mode().unwrap();

    let mut nt_i = NoiseTransport::new(transport_i, remote_pub_i);
    let mut nt_r = NoiseTransport::new(transport_r, remote_pub_r);

    assert_eq!(nt_i.remote_pubkey(), &kp_r.public);
    assert_eq!(nt_r.remote_pubkey(), &kp_i.public);

    let plaintext = b"NoiseTransport encrypt/decrypt test";
    let ciphertext = nt_i.encrypt(plaintext).unwrap();
    assert_ne!(&ciphertext, &plaintext[..]);
    let decrypted = nt_r.decrypt(&ciphertext).unwrap();
    assert_eq!(decrypted, plaintext);

    let reply = b"Reply from responder";
    let ciphertext = nt_r.encrypt(reply).unwrap();
    let decrypted = nt_i.decrypt(&ciphertext).unwrap();
    assert_eq!(decrypted, reply);
}
