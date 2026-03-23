/// Adapter that turns a `std::sync::mpsc::Receiver<Vec<u8>>` into a
/// synchronous `std::io::Read`, used for download-stream decoding.
pub(crate) struct ChunkReceiverReader {
    rx: std::sync::mpsc::Receiver<Vec<u8>>,
    buf: Vec<u8>,
    pos: usize,
    closed: bool,
}

impl ChunkReceiverReader {
    pub fn new(rx: std::sync::mpsc::Receiver<Vec<u8>>) -> Self {
        Self {
            rx,
            buf: Vec::new(),
            pos: 0,
            closed: false,
        }
    }
}

impl std::io::Read for ChunkReceiverReader {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        if out.is_empty() {
            return Ok(0);
        }

        loop {
            if self.pos < self.buf.len() {
                let n = std::cmp::min(out.len(), self.buf.len() - self.pos);
                out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
                self.pos += n;
                return Ok(n);
            }

            if self.closed {
                return Ok(0);
            }

            match self.rx.recv() {
                Ok(chunk) => {
                    self.buf = chunk;
                    self.pos = 0;
                }
                Err(_) => {
                    self.closed = true;
                }
            }
        }
    }
}
