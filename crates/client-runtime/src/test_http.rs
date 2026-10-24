//! Minimal scripted HTTP server for provider unit tests: replies with canned responses in order
//! and records every request body.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

use reqwest::Url;

pub(crate) struct TestResponse {
    status: u16,
    body: &'static str,
}

impl TestResponse {
    pub(crate) fn json(status: u16, body: &'static str) -> Self {
        Self { status, body }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct TestRequest {
    pub(crate) method: String,
    /// Request target as sent (path plus query string).
    pub(crate) path: String,
    pub(crate) body: String,
}

pub(crate) struct TestServer {
    address: std::net::SocketAddr,
    requests: Arc<Mutex<Vec<TestRequest>>>,
}

impl TestServer {
    pub(crate) fn new(responses: Vec<TestResponse>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("local addr");
        let requests = Arc::new(Mutex::new(Vec::new()));
        let log = requests.clone();
        thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().expect("accept");
                let request = read_request(&mut stream);
                log.lock().expect("requests").push(request);
                write_response(&mut stream, response);
            }
        });
        Self { address, requests }
    }

    pub(crate) fn url(&self) -> Url {
        Url::parse(&format!("http://{}/", self.address)).expect("test URL")
    }

    pub(crate) fn requests(&self) -> Vec<TestRequest> {
        self.requests.lock().expect("requests").clone()
    }

    /// JSON-RPC `method` of every recorded request, in order.
    pub(crate) fn json_rpc_methods(&self) -> Vec<String> {
        self.requests()
            .iter()
            .map(|request| {
                serde_json::from_str::<serde_json::Value>(&request.body).expect("json")["method"]
                    .as_str()
                    .expect("method")
                    .to_string()
            })
            .collect()
    }
}

fn read_request(stream: &mut TcpStream) -> TestRequest {
    let mut buffer = [0u8; 8192];
    let mut bytes = Vec::new();
    let mut content_length = 0usize;
    loop {
        let read = stream.read(&mut buffer).expect("read request");
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);
        if let Some(headers_end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..headers_end]);
            content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            if bytes.len() >= headers_end + 4 + content_length {
                break;
            }
        }
    }
    let headers_end = bytes
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("headers end");
    let head = String::from_utf8_lossy(&bytes[..headers_end]).to_string();
    let mut request_line = head.split_whitespace();
    let method = request_line.next().expect("method").to_string();
    let path = request_line.next().expect("path").to_string();
    let body_start = headers_end + 4;
    TestRequest {
        method,
        path,
        body: String::from_utf8_lossy(&bytes[body_start..body_start + content_length]).to_string(),
    }
}

fn write_response(stream: &mut TcpStream, response: TestResponse) {
    let body = response.body.as_bytes();
    write!(
        stream,
        "HTTP/1.1 {} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
        response.status,
        body.len()
    )
    .expect("write headers");
    stream.write_all(body).expect("write body");
    stream.flush().expect("flush");
}
