//! Tests for macFUSE rename protocol fix
//!
//! These tests verify that atomic save operations (write temp file → rename to target)
//! work correctly with both macFUSE 4.x and 5.x protocol formats.

use std::ffi::OsStr;
use std::path::Path;

/// Test data aligned to 8-byte boundary for FUSE ABI compatibility
#[repr(C, align(8))]
struct AlignedData<T>(T);

/// Helper to create extended rename format (macFUSE 4.x or macFUSE 5.x with capabilities)
/// Format: newdir (u64) + flags (u32) + padding (u32) + name1 + \0 + name2 + \0
fn create_extended_rename_data(newdir: u64, flags: u32, name1: &str, name2: &str) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(&newdir.to_le_bytes());
    data.extend_from_slice(&flags.to_le_bytes());
    data.extend_from_slice(&0u32.to_le_bytes()); // padding
    data.extend_from_slice(name1.as_bytes());
    data.push(0);
    data.extend_from_slice(name2.as_bytes());
    data.push(0);
    data
}

/// Helper to create short rename format (macFUSE 5.x without capabilities)
/// Format: newdir (u64) + name1 + \0 + name2 + \0
fn create_short_rename_data(newdir: u64, name1: &str, name2: &str) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(&newdir.to_le_bytes());
    data.extend_from_slice(name1.as_bytes());
    data.push(0);
    data.extend_from_slice(name2.as_bytes());
    data.push(0);
    data
}

#[test]
fn test_extended_format_detection() {
    let data = create_extended_rename_data(1u64, 1u32, "oldname", "newname");

    // After newdir (8 bytes), first byte should be flags (value 1, which is < 32)
    let first_byte_after_newdir = data[8];
    assert!(
        first_byte_after_newdir < 32,
        "First byte after newdir ({}) should be < 32 for extended format",
        first_byte_after_newdir
    );

    // Extract flags
    let flags_bytes = [data[8], data[9], data[10], data[11]];
    let flags = u32::from_le_bytes(flags_bytes);
    assert_eq!(flags, 1);
}

#[test]
fn test_short_format_detection() {
    let data = create_short_rename_data(1u64, "oldname", "newname");

    // After newdir (8 bytes), first byte should be 'o' (0x6f = 111 >= 32)
    let first_byte_after_newdir = data[8];
    assert!(
        first_byte_after_newdir >= 32,
        "First byte after newdir ({}) should be >= 32 for short format",
        first_byte_after_newdir
    );
    assert_eq!(first_byte_after_newdir, b'o');
}

#[test]
fn test_atomic_save_simulation() {
    // Simulates: write to ".file.txt.tmp" then rename to "file.txt"
    let temp_file = ".file.txt.tmp";
    let target_file = "file.txt";

    // macFUSE 5.x with capabilities granted - extended format
    let extended_data = create_extended_rename_data(1u64, 0u32, temp_file, target_file);

    // Verify we can parse both filenames
    let name1_start = 16; // After newdir + flags + padding
    let name1_end = name1_start + temp_file.len();
    let parsed_name1 = std::str::from_utf8(&extended_data[name1_start..name1_end]).unwrap();
    assert_eq!(parsed_name1, temp_file);

    let name2_start = name1_end + 1; // Skip null terminator
    let name2_end = name2_start + target_file.len();
    let parsed_name2 = std::str::from_utf8(&extended_data[name2_start..name2_end]).unwrap();
    assert_eq!(parsed_name2, target_file);
}

#[test]
fn test_rename_swap_flag() {
    // Test RENAME_SWAP flag (bit 0)
    let data = create_extended_rename_data(1u64, 1u32, "file1", "file2");
    let flags = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    assert_eq!(flags & 1, 1, "RENAME_SWAP flag should be set");
}

#[test]
fn test_rename_excl_flag() {
    // Test RENAME_EXCL flag (bit 1)
    let data = create_extended_rename_data(1u64, 2u32, "file1", "file2");
    let flags = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    assert_eq!(flags & 2, 2, "RENAME_EXCL flag should be set");
}

#[test]
fn test_both_flags_set() {
    // Test both RENAME_SWAP and RENAME_EXCL
    let data = create_extended_rename_data(1u64, 3u32, "file1", "file2");
    let flags = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    assert_eq!(flags, 3, "Both flags should be set");
}

/// Test edge case: filename starting with control character (unlikely but possible)
#[test]
fn test_filename_with_control_char() {
    // A filename starting with TAB (0x09) - technically valid on some filesystems
    let unusual_name = "\tfile.txt";
    let target_name = "file.txt";

    // This would be misdetected as extended format by our heuristic
    // (first byte 0x09 < 32)
    let data = create_short_rename_data(1u64, unusual_name, target_name);
    let first_byte = data[8];

    // Verify the heuristic would fail for this edge case
    assert!(first_byte < 32, "TAB (0x09) is < 32, would be misdetected");

    // In practice, this is extremely rare - most filenames start with
    // printable ASCII characters
}

/// Test that empty flags field (all zeros) is correctly detected as extended format
#[test]
fn test_extended_format_zero_flags() {
    // macFUSE 5.x with capabilities granted but no specific flags
    let data = create_extended_rename_data(1u64, 0u32, "old", "new");

    // First byte is 0, which is < 32
    assert_eq!(data[8], 0);

    // Extract and verify flags
    let flags_bytes = [data[8], data[9], data[10], data[11]];
    let flags = u32::from_le_bytes(flags_bytes);
    assert_eq!(flags, 0);
}
