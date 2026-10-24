//! ChromVoid's opt-in bounds for importing a user-selected database.
use std::io::{Error, ErrorKind, Result};

pub(crate) const MAX_INPUT_BYTES: usize = 50 * 1024 * 1024;
pub(crate) const MAX_EXPANDED_BYTES: usize = 32 * 1024 * 1024;

pub(crate) fn check_bytes(actual: usize, maximum: usize) -> Result<()> {
    if actual > maximum {
        return Err(Error::new(
            ErrorKind::InvalidData,
            "KDBX exceeds import limits",
        ));
    }
    Ok(())
}

pub(crate) fn check_xml(data: &[u8]) -> Result<()> {
    use quick_xml::events::Event;
    check_bytes(data.len(), MAX_EXPANDED_BYTES)?;
    let mut reader = quick_xml::Reader::from_reader(data);
    let mut depth = 0_usize;
    let mut nodes = 0_usize;
    loop {
        match reader
            .read_event()
            .map_err(|error| Error::new(ErrorKind::InvalidData, error))?
        {
            Event::Start(_) => {
                depth += 1;
                nodes += 1;
            }
            Event::Empty(_) => nodes += 1,
            Event::End(_) => depth = depth.saturating_sub(1),
            Event::DocType(_) => {
                return Err(Error::new(
                    ErrorKind::InvalidData,
                    "KDBX DTD is not supported",
                ))
            }
            Event::Eof => break,
            _ => {}
        }
        check_bytes(depth, 64)?;
        check_bytes(nodes, 500_000)?;
    }
    Ok(())
}
