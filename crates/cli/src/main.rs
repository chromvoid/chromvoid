//! ChromVoid CLI - Command-line interface for testing RPC
//!
//! Usage:
//!   chromvoid-cli --storage-path ./vault            # Interactive REPL mode
//!   chromvoid-cli --storage-path ./vault --stdio    # stdin/stdout JSON-RPC mode
//!   echo '{"v":1,"command":"ping","data":{}}' | chromvoid-cli --storage-path ./vault --stdio

use std::io::{self, BufRead, Write};
use std::path::PathBuf;

use chromvoid_core::rpc::{RpcRequest, RpcResponse, RpcRouter};
use chromvoid_core::storage::Storage;
use clap::Parser;
use serde_json::Value;

/// ChromVoid CLI - Test the RPC interface
#[derive(Parser, Debug)]
#[command(name = "chromvoid-cli")]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Path to the storage directory
    #[arg(short, long)]
    storage_path: PathBuf,

    /// Use stdin/stdout for JSON-RPC (one request per line)
    #[arg(long)]
    stdio: bool,

    /// Execute a single command and exit
    #[arg(short, long)]
    command: Option<String>,
}

fn main() {
    let args = Args::parse();

    // Initialize storage
    let storage = match Storage::new(&args.storage_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error initializing storage: {}", e);
            std::process::exit(1);
        }
    };

    // Create RPC router
    let mut router = RpcRouter::new(storage);

    // Handle single command mode
    if let Some(cmd) = args.command {
        match serde_json::from_str::<RpcRequest>(&cmd) {
            Ok(request) => {
                let response = router.handle(&request);
                println!("{}", serde_json::to_string(&response).unwrap());
            }
            Err(e) => {
                let response =
                    RpcResponse::error(format!("Invalid JSON: {}", e), Some("INVALID_JSON"));
                println!("{}", serde_json::to_string(&response).unwrap());
                std::process::exit(1);
            }
        }
        return;
    }

    // Stdio mode: read JSON-RPC from stdin, write responses to stdout
    if args.stdio {
        run_stdio_mode(&mut router);
        return;
    }

    // Interactive REPL mode
    run_repl_mode(&mut router);
}

/// Run in stdin/stdout mode - one JSON request per line
fn run_stdio_mode(router: &mut RpcRouter) {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdout = stdout.lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                let response = RpcResponse::error(format!("IO error: {}", e), Some("IO_ERROR"));
                writeln!(stdout, "{}", serde_json::to_string(&response).unwrap()).ok();
                continue;
            }
        };

        // Skip empty lines
        if line.trim().is_empty() {
            continue;
        }

        // Parse request
        let request: RpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let response =
                    RpcResponse::error(format!("Invalid JSON: {}", e), Some("INVALID_JSON"));
                writeln!(stdout, "{}", serde_json::to_string(&response).unwrap()).ok();
                continue;
            }
        };

        // Handle request
        let response = router.handle(&request);
        writeln!(stdout, "{}", serde_json::to_string(&response).unwrap()).ok();
        stdout.flush().ok();
    }
}

/// Run interactive REPL mode
fn run_repl_mode(router: &mut RpcRouter) {
    println!("ChromVoid CLI - Interactive Mode");
    println!("Enter JSON-RPC requests or commands:");
    println!("  ping                    - Send ping command");
    println!("  unlock <password>       - Unlock vault");
    println!("  lock                    - Lock vault");
    println!("  status                  - Get vault status");
    println!("  list [path]             - List directory");
    println!("  mkdir <name>            - Create directory");
    println!("  {{...}}                   - Raw JSON-RPC request");
    println!("  quit / exit             - Exit");
    println!();

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("> ");
        stdout.flush().ok();

        let mut line = String::new();
        if stdin.read_line(&mut line).is_err() {
            break;
        }

        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Handle special commands
        match line.to_lowercase().as_str() {
            "quit" | "exit" => break,
            "ping" => {
                let request = RpcRequest::new("ping", Value::Object(Default::default()));
                let response = router.handle(&request);
                println!("{}", serde_json::to_string_pretty(&response).unwrap());
                continue;
            }
            "lock" => {
                let request = RpcRequest::new("vault:lock", Value::Object(Default::default()));
                let response = router.handle(&request);
                println!("{}", serde_json::to_string_pretty(&response).unwrap());
                continue;
            }
            "status" => {
                let request = RpcRequest::new("vault:status", Value::Object(Default::default()));
                let response = router.handle(&request);
                println!("{}", serde_json::to_string_pretty(&response).unwrap());
                continue;
            }
            _ => {}
        }

        // Handle unlock command
        if line.starts_with("unlock ") {
            let password = line.trim_start_matches("unlock ").trim();
            let request =
                RpcRequest::new("vault:unlock", serde_json::json!({"password": password}));
            let response = router.handle(&request);
            println!("{}", serde_json::to_string_pretty(&response).unwrap());
            continue;
        }

        // Handle list command
        if line == "list" || line.starts_with("list ") {
            let path = if line == "list" {
                "/"
            } else {
                line.trim_start_matches("list ").trim()
            };
            let request = RpcRequest::new("catalog:list", serde_json::json!({"path": path}));
            let response = router.handle(&request);
            println!("{}", serde_json::to_string_pretty(&response).unwrap());
            continue;
        }

        // Handle mkdir command
        if line.starts_with("mkdir ") {
            let name = line.trim_start_matches("mkdir ").trim();
            let request = RpcRequest::new("catalog:createDir", serde_json::json!({"name": name}));
            let response = router.handle(&request);
            println!("{}", serde_json::to_string_pretty(&response).unwrap());
            continue;
        }

        // Try to parse as raw JSON
        if line.starts_with('{') {
            match serde_json::from_str::<RpcRequest>(line) {
                Ok(request) => {
                    let response = router.handle(&request);
                    println!("{}", serde_json::to_string_pretty(&response).unwrap());
                }
                Err(e) => {
                    println!("Invalid JSON: {}", e);
                }
            }
            continue;
        }

        println!("Unknown command. Type 'quit' to exit.");
    }

    println!("Goodbye!");
}
