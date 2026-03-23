use chromvoid_core::argon2_params;

#[test]
fn test_argon2_params_match_adr_002() {
    // ADR-002: Desktop=256MiB/4/4; Mobile(iOS/Android)=64MiB/3/3
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        assert_eq!(argon2_params::MEMORY_COST, 64 * 1024);
        assert_eq!(argon2_params::TIME_COST, 3);
        assert_eq!(argon2_params::PARALLELISM, 3);
    }
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        assert_eq!(argon2_params::MEMORY_COST, 256 * 1024);
        assert_eq!(argon2_params::TIME_COST, 4);
        assert_eq!(argon2_params::PARALLELISM, 4);
    }
}
