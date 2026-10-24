//! Generates transient passwords; never reads or writes credential storage.
use super::error::PassmanagerCommandError as Error;
use crate::rpc::types::{PassmanagerPasswordGenerateRequest, PassmanagerPasswordGenerateResponse};

pub(super) const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
pub(super) const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
pub(super) const DIGITS: &[u8] = b"0123456789";
pub(super) const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{};:,.<>/?";

pub(super) fn generate(
    request: PassmanagerPasswordGenerateRequest,
) -> Result<PassmanagerPasswordGenerateResponse, Error> {
    let mut bytes = [0; 256];
    let mut cursor = bytes.len();
    generate_with(request, &mut || {
        if cursor == bytes.len() {
            getrandom::getrandom(&mut bytes)
                .map_err(|_| Error::internal("Password generation is unavailable"))?;
            cursor = 0;
        }
        let byte = bytes[cursor];
        cursor += 1;
        Ok(byte)
    })
}

fn index(upper: usize, random: &mut impl FnMut() -> Result<u8, Error>) -> Result<usize, Error> {
    // All alphabets and the maximum password length fit within one byte.
    // Reject the incomplete bucket so each index has the same probability.
    let ceiling = 256 - 256 % upper;
    loop {
        let value = usize::from(random()?);
        if value < ceiling {
            return Ok(value % upper);
        }
    }
}

fn generate_with(
    request: PassmanagerPasswordGenerateRequest,
    random: &mut impl FnMut() -> Result<u8, Error>,
) -> Result<PassmanagerPasswordGenerateResponse, Error> {
    let sets: Vec<&[u8]> = [
        (request.lowercase, LOWERCASE),
        (request.uppercase, UPPERCASE),
        (request.digits, DIGITS),
        (request.symbols, SYMBOLS),
    ]
    .into_iter()
    .filter_map(|(enabled, alphabet)| enabled.then_some(alphabet))
    .collect();
    if !(4..=128).contains(&request.length) || sets.is_empty() {
        return Err(Error::empty_payload(
            "Choose a length from 4 to 128 and at least one character set",
        ));
    }
    let pool: Vec<u8> = sets.iter().flat_map(|set| set.iter().copied()).collect();
    let mut password = Vec::with_capacity(usize::from(request.length));
    for set in sets {
        password.push(set[index(set.len(), random)?]);
    }
    while password.len() < usize::from(request.length) {
        password.push(pool[index(pool.len(), random)?]);
    }
    for position in (1..password.len()).rev() {
        let other = index(position + 1, random)?;
        password.swap(position, other);
    }
    Ok(PassmanagerPasswordGenerateResponse {
        password: password.into_iter().map(char::from).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn incomplete_random_bucket_is_rejected() {
        let mut bytes = [255, 250, 249].into_iter();
        assert_eq!(index(10, &mut || Ok(bytes.next().unwrap())).unwrap(), 9);
        assert_eq!(bytes.next(), None);
    }

    #[test]
    fn entropy_failure_never_returns_a_partial_password() {
        let request = PassmanagerPasswordGenerateRequest {
            length: 16,
            lowercase: true,
            uppercase: true,
            digits: true,
            symbols: false,
        };
        let mut calls = 0;
        let result = generate_with(request, &mut || {
            calls += 1;
            if calls == 3 {
                Err(Error::internal("Entropy unavailable"))
            } else {
                Ok(0)
            }
        });
        assert!(result.is_err());
        assert_eq!(calls, 3);
    }
}
