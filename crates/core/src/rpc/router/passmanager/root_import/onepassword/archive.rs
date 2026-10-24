use super::invalid;
use crate::rpc::types::RpcResponse;
use rawzip::{CompressionMethod, ZipArchive, ZipArchiveEntryWayfinder, ZipSliceArchive};
use std::collections::BTreeMap;
use std::io::Read;
use zeroize::Zeroizing;

struct Member {
    location: ZipArchiveEntryWayfinder,
    compression: CompressionMethod,
}
pub(super) struct Archive<'a> {
    archive: ZipSliceArchive<&'a [u8]>,
    members: BTreeMap<String, Member>,
}
impl<'a> Archive<'a> {
    pub(super) fn open(bytes: &'a [u8]) -> Result<Self, RpcResponse> {
        let archive = ZipArchive::from_slice(bytes).map_err(|_| invalid("Invalid 1PUX archive"))?;
        if archive.entries_hint() > 20_000 {
            return Err(invalid("1PUX archive has too many files"));
        }
        let mut members = BTreeMap::new();
        let mut entries = archive.entries();
        let mut count = 0_u64;
        let mut ranges = Vec::new();
        while let Some(entry) = entries
            .next_entry()
            .map_err(|_| invalid("Invalid 1PUX directory"))?
        {
            count += 1;
            if count > 20_000 || entry.flags().is_encrypted() {
                return Err(invalid("Unsupported 1PUX archive"));
            }
            let name = entry
                .file_path()
                .try_normalize()
                .map_err(|_| invalid("Invalid 1PUX file path"))?
                .as_ref()
                .to_string();
            let local = archive
                .get_entry(entry.wayfinder())
                .map_err(|_| invalid("Invalid 1PUX file"))?;
            if local.local_header().flags().is_encrypted() {
                return Err(invalid("Encrypted 1PUX files are not supported"));
            }
            let range = local.compressed_data_range();
            if range.0 != range.1 {
                ranges.push(range);
            }
            if members
                .insert(
                    name,
                    Member {
                        location: entry.wayfinder(),
                        compression: entry.compression_method(),
                    },
                )
                .is_some()
            {
                return Err(invalid("1PUX archive has duplicate file names"));
            }
        }
        if count != archive.entries_hint() {
            return Err(invalid("Incomplete 1PUX archive"));
        }
        ranges.sort_unstable();
        if ranges.windows(2).any(|pair| pair[0].1 > pair[1].0) {
            return Err(invalid("1PUX files overlap"));
        }
        Ok(Self { archive, members })
    }
    pub(super) fn read(
        &self,
        name: &str,
        maximum: usize,
    ) -> Result<Zeroizing<Vec<u8>>, RpcResponse> {
        let member = self
            .members
            .get(name)
            .ok_or_else(|| invalid("A required 1PUX file is missing"))?;
        let local = self
            .archive
            .get_entry(member.location)
            .map_err(|_| invalid("Invalid 1PUX file"))?;
        let reader: Box<dyn Read + '_> = match member.compression {
            CompressionMethod::STORE => Box::new(local.verifying_reader(local.data())),
            CompressionMethod::DEFLATE => {
                Box::new(local.verifying_reader(flate2::bufread::DeflateDecoder::new(local.data())))
            }
            _ => return Err(invalid("Unsupported 1PUX compression")),
        };
        let mut bytes = Zeroizing::new(Vec::new());
        reader
            .take(maximum as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| invalid("1PUX file integrity check failed"))?;
        if bytes.len() > maximum {
            return Err(invalid("A 1PUX file exceeds its size limit"));
        }
        Ok(bytes)
    }
    pub(super) fn icon_name(&self, reference: &str) -> Option<&str> {
        let normalized = reference.trim().replace('\\', "/");
        if let Some((name, _)) = self.members.get_key_value(&normalized) {
            if name.starts_with("files/") {
                return Some(name);
            }
        }
        let base = normalized.rsplit('/').next()?;
        let mut found = self.members.keys().filter(|name| {
            if !name.starts_with("files/") {
                return false;
            }
            let candidate = name.rsplit('/').next().unwrap_or(name);
            candidate.eq_ignore_ascii_case(base)
                || candidate
                    .split("___")
                    .next()
                    .is_some_and(|id| id.eq_ignore_ascii_case(base))
        });
        let first = found.next()?;
        if found.next().is_some() {
            None
        } else {
            Some(first)
        }
    }
}
