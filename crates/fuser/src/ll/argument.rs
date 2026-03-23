//! Argument decomposition for FUSE operation requests.
//!
//! Helper to decompose a slice of binary data (incoming FUSE request) into multiple data
//! structures (request arguments).

use std::ffi::OsStr;
use std::os::unix::ffi::OsStrExt;
use zerocopy::{FromBytes, Immutable, KnownLayout};

/// An iterator that can be used to fetch typed arguments from a byte slice.
pub struct ArgumentIterator<'a> {
    data: &'a [u8],
}

impl<'a> ArgumentIterator<'a> {
    /// Create a new argument iterator for the given byte slice.
    pub fn new(data: &'a [u8]) -> ArgumentIterator<'a> {
        ArgumentIterator { data }
    }

    /// Returns the size of the remaining data.
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Fetch a slice of all remaining bytes.
    pub fn fetch_all(&mut self) -> &'a [u8] {
        let bytes = self.data;
        self.data = &[];
        bytes
    }

    /// Fetch a typed argument. Returns `None` if there's not enough data left.
    pub fn fetch<T: FromBytes + KnownLayout + Immutable>(&mut self) -> Option<&'a T> {
        match zerocopy::Ref::<_, T>::from_prefix(self.data) {
            Err(_err) => {
                // TODO: do something with _err
                if self.data.as_ptr() as usize % core::mem::align_of::<T>() != 0 {
                    // Panic on alignment errors as this is under the control
                    // of the programmer, we can still return None for size
                    // failures as this may be caused by insufficient external
                    // data.
                    panic!("Data unaligned");
                } else {
                    None
                }
            }
            Ok((x, rest)) => {
                self.data = rest;
                Some(zerocopy::Ref::<&[u8], T>::into_ref(x))
            }
        }
    }

    /// Fetch a slice of typed of arguments. Returns `None` if there's not enough data left.
    pub fn fetch_slice<T: FromBytes + Immutable>(&mut self, count: usize) -> Option<&'a [T]> {
        match zerocopy::Ref::<_, [T]>::from_prefix_with_elems(self.data, count) {
            Err(_err) => {
                // TODO: do something with _err
                if self.data.as_ptr() as usize % core::mem::align_of::<T>() != 0 {
                    // Panic on alignment errors as this is under the control
                    // of the programmer, we can still return None for size
                    // failures as this may be caused by insufficient external
                    // data.
                    panic!("Data unaligned");
                } else {
                    None
                }
            }
            Ok((x, rest)) => {
                self.data = rest;
                Some(zerocopy::Ref::<&[u8], [T]>::into_ref(x))
            }
        }
    }

    /// Fetch a (zero-terminated) string (can be non-utf8). Returns `None` if there's not enough
    /// data left or no zero-termination could be found.
    pub fn fetch_str(&mut self) -> Option<&'a OsStr> {
        let len = memchr::memchr(0, self.data)?;
        let (out, rest) = self.data.split_at(len);
        self.data = &rest[1..];
        Some(OsStr::from_bytes(out))
    }

    /// Skip a fixed number of bytes. Returns `true` if successful, `false` if not enough data.
    ///
    /// This is useful for runtime protocol detection where we need to skip optional
    /// fields based on the actual kernel protocol version.
    pub(crate) fn skip_bytes(&mut self, count: usize) -> bool {
        if self.data.len() >= count {
            self.data = &self.data[count..];
            true
        } else {
            false
        }
    }

    /// Peek at the byte at the given offset without consuming it.
    /// Returns `None` if the offset is beyond the remaining data.
    ///
    /// This is useful for runtime detection of protocol variants by inspecting
    /// upcoming bytes before deciding how to parse.
    pub(crate) fn peek_byte(&self, offset: usize) -> Option<u8> {
        self.data.get(offset).copied()
    }
}

#[cfg(test)]
pub mod tests {
    use std::ops::Deref;

    use super::super::test::AlignedData;
    use super::*;
    use zerocopy::FromBytes;

    const TEST_DATA: AlignedData<[u8; 10]> =
        AlignedData([0x66, 0x6f, 0x6f, 0x00, 0x62, 0x61, 0x72, 0x00, 0x62, 0x61]);

    #[repr(C)]
    #[derive(FromBytes, KnownLayout, Immutable)]
    struct TestArgument {
        p1: u8,
        p2: u8,
        p3: u16,
    }

    #[test]
    fn all_data() {
        let mut it = ArgumentIterator::new(TEST_DATA.deref());
        it.fetch_str().unwrap();
        let arg = it.fetch_all();
        assert_eq!(arg, [0x62, 0x61, 0x72, 0x00, 0x62, 0x61]);
    }

    #[test]
    fn generic_argument() {
        let mut it = ArgumentIterator::new(TEST_DATA.deref());
        let arg: &TestArgument = it.fetch().unwrap();
        assert_eq!(arg.p1, 0x66);
        assert_eq!(arg.p2, 0x6f);
        assert_eq!(arg.p3, 0x006f);
        let arg: &TestArgument = it.fetch().unwrap();
        assert_eq!(arg.p1, 0x62);
        assert_eq!(arg.p2, 0x61);
        assert_eq!(arg.p3, 0x0072);
        assert_eq!(it.len(), 2);
    }

    #[test]
    fn string_argument() {
        let mut it = ArgumentIterator::new(TEST_DATA.deref());
        let arg = it.fetch_str().unwrap();
        assert_eq!(arg, "foo");
        let arg = it.fetch_str().unwrap();
        assert_eq!(arg, "bar");
        assert_eq!(it.len(), 2);
    }

    #[test]
    fn mixed_arguments() {
        let mut it = ArgumentIterator::new(TEST_DATA.deref());
        let arg: &TestArgument = it.fetch().unwrap();
        assert_eq!(arg.p1, 0x66);
        assert_eq!(arg.p2, 0x6f);
        assert_eq!(arg.p3, 0x006f);
        let arg = it.fetch_str().unwrap();
        assert_eq!(arg, "bar");
        let arg = it.fetch_all();
        assert_eq!(arg, [0x62, 0x61]);
    }

    #[test]
    fn out_of_data() {
        let mut it = ArgumentIterator::new(TEST_DATA.deref());
        it.fetch::<u64>().unwrap();
        let arg: Option<&TestArgument> = it.fetch();
        assert!(arg.is_none());
        assert_eq!(it.len(), 2);
        let arg = it.fetch_str();
        assert!(arg.is_none());
        assert_eq!(it.len(), 2);
    }

    #[test]
    fn peek_byte_basic() {
        let data = AlignedData([0x01, 0x02, 0x03, 0x04, 0x00]);
        let it = ArgumentIterator::new(data.deref());
        assert_eq!(it.peek_byte(0), Some(0x01));
        assert_eq!(it.peek_byte(1), Some(0x02));
        assert_eq!(it.peek_byte(2), Some(0x03));
        assert_eq!(it.peek_byte(3), Some(0x04));
        assert_eq!(it.peek_byte(4), Some(0x00));
        assert_eq!(it.peek_byte(5), None);
        // Peeking should not consume data
        assert_eq!(it.len(), 5);
    }

    #[test]
    fn skip_bytes_basic() {
        let data = AlignedData([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
        let mut it = ArgumentIterator::new(data.deref());
        assert!(it.skip_bytes(4));
        assert_eq!(it.len(), 4);
        assert_eq!(it.peek_byte(0), Some(0x05));
        assert!(it.skip_bytes(4));
        assert_eq!(it.len(), 0);
        assert!(!it.skip_bytes(1)); // Should fail, not enough data
    }

    #[test]
    fn peek_and_skip_combined() {
        // Simulates macFUSE extended rename format detection
        // newdir (u64) + flags (u32) + padding (u32) + name
        let data = AlignedData([
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // newdir = 1 (little-endian u64)
            0x01, 0x00, 0x00, 0x00, // flags = 1 (RENAME_SWAP)
            0x00, 0x00, 0x00, 0x00, // padding
            0x66, 0x6f, 0x6f, 0x00, // "foo\0"
            0x62, 0x61, 0x72, 0x00, // "bar\0"
        ]);
        let mut it = ArgumentIterator::new(data.deref());

        // Fetch newdir (8 bytes)
        let newdir: &u64 = it.fetch().unwrap();
        assert_eq!(*newdir, 1u64.to_le());

        // Check if next byte indicates extended format (flags field)
        let first_byte = it.peek_byte(0).unwrap();
        assert!(
            first_byte < 32,
            "First byte after newdir should be < 32 for extended format"
        );

        // Extract flags
        let flags_bytes = [
            it.peek_byte(0).unwrap_or(0),
            it.peek_byte(1).unwrap_or(0),
            it.peek_byte(2).unwrap_or(0),
            it.peek_byte(3).unwrap_or(0),
        ];
        let flags = u32::from_le_bytes(flags_bytes);
        assert_eq!(flags, 1); // RENAME_SWAP

        // Skip flags + padding
        assert!(it.skip_bytes(8));

        // Now read the filenames
        let name1 = it.fetch_str().unwrap();
        assert_eq!(name1, "foo");
        let name2 = it.fetch_str().unwrap();
        assert_eq!(name2, "bar");
    }

    #[test]
    fn short_rename_format() {
        // Simulates macFUSE 5.x short format (no flags)
        // newdir (u64) + name immediately
        let data = AlignedData([
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // newdir = 1
            0x66, 0x6f, 0x6f, 0x00, // "foo\0" - starts with 'f' (0x66 >= 32)
            0x62, 0x61, 0x72, 0x00, // "bar\0"
        ]);
        let mut it = ArgumentIterator::new(data.deref());

        let _newdir: &u64 = it.fetch().unwrap();

        // Check first byte - should be >= 32 (printable ASCII)
        let first_byte = it.peek_byte(0).unwrap();
        assert!(
            first_byte >= 32,
            "First byte should be >= 32 for short format (filename)"
        );

        // Read filename directly
        let name = it.fetch_str().unwrap();
        assert_eq!(name, "foo");
    }
}
