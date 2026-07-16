use std::path::PathBuf;

use clap::{ArgAction, ArgGroup, Args, Parser, Subcommand};

#[derive(Debug, Parser, PartialEq, Eq)]
#[command(
    name = "chromvoid",
    version,
    about = "ChromVoid Vault Env Runtime CLI",
    long_about = "A paired, approval-only CLI for running saved ChromVoid environment presets."
)]
#[command(group(
    ArgGroup::new("output")
        .args(["json", "jsonl"])
        .multiple(false)
))]
pub struct Cli {
    /// Emit one compact AgentResponseV1 object.
    #[arg(long, global = true, action = ArgAction::SetTrue)]
    pub json: bool,

    /// Emit a response followed by sequenced AgentEventV1 objects.
    #[arg(long, global = true, action = ArgAction::SetTrue)]
    pub jsonl: bool,

    #[command(subcommand)]
    pub command: TopLevelCommand,
}

#[derive(Debug, Subcommand, PartialEq, Eq)]
pub enum TopLevelCommand {
    /// Pair this CLI identity through an open desktop pairing ceremony.
    Pair,
    /// Inspect the paired desktop connection.
    Connection {
        #[command(subcommand)]
        command: ConnectionCommand,
    },
    /// Work with saved environment profiles and presets.
    Env {
        #[command(subcommand)]
        command: EnvCommand,
    },
}

#[derive(Debug, Subcommand, PartialEq, Eq)]
pub enum ConnectionCommand {
    Status,
}

#[derive(Debug, Subcommand, PartialEq, Eq)]
pub enum EnvCommand {
    /// Print the bundled CLI-only workflow and schema contract.
    AgentGuide,
    Status,
    Secrets {
        #[command(subcommand)]
        command: SecretsCommand,
    },
    Profiles {
        #[command(subcommand)]
        command: ProfilesCommand,
    },
    Presets {
        #[command(subcommand)]
        command: PresetsCommand,
    },
    Proposals {
        #[command(subcommand)]
        command: ProposalsCommand,
    },
    Run(RunArgs),
    Runs {
        #[command(subcommand)]
        command: RunsCommand,
    },
}

#[derive(Debug, Subcommand, PartialEq, Eq)]
pub enum SecretsCommand {
    List,
}

#[derive(Debug, Subcommand, PartialEq, Eq)]
pub enum ProfilesCommand {
    List,
    Get { profile: String },
    ProposeCreate(FileArgs),
    ProposeUpdate(UpdateFileArgs),
    ProposeDelete(DeleteArgs),
}

#[derive(Debug, Subcommand, PartialEq, Eq)]
pub enum PresetsCommand {
    List {
        #[arg(long)]
        profile: Option<String>,
    },
    Get {
        preset: String,
    },
    ProposeCreate(FileArgs),
    ProposeUpdate(UpdateFileArgs),
    ProposeDelete(DeleteArgs),
}

#[derive(Debug, Subcommand, PartialEq, Eq)]
pub enum ProposalsCommand {
    Wait { proposal_id: String },
}

#[derive(Debug, Args, PartialEq, Eq)]
pub struct RunArgs {
    #[arg(long)]
    pub profile: String,
    #[arg(long)]
    pub preset: String,
    #[arg(long)]
    pub reason: Option<String>,
}

#[derive(Debug, Subcommand, PartialEq, Eq)]
pub enum RunsCommand {
    List,
    #[command(group(
        ArgGroup::new("run_target")
            .args(["run_id", "all"])
            .required(true)
            .multiple(false)
    ))]
    Stop {
        /// Run id to stop. Omit when using --all.
        run_id: Option<String>,
        /// Stop every run owned by this CLI actor.
        #[arg(long, action = ArgAction::SetTrue)]
        all: bool,
    },
}

#[derive(Debug, Args, PartialEq, Eq)]
pub struct FileArgs {
    /// UTF-8 JSON object path, or '-' for stdin.
    #[arg(long, value_name = "PATH|-", required = true)]
    pub file: PathBuf,
}

#[derive(Debug, Args, PartialEq, Eq)]
pub struct UpdateFileArgs {
    pub target: String,
    #[arg(long, value_parser = clap::value_parser!(u64).range(1..))]
    pub base_revision: u64,
    /// UTF-8 JSON object path, or '-' for stdin.
    #[arg(long, value_name = "PATH|-", required = true)]
    pub file: PathBuf,
}

#[derive(Debug, Args, PartialEq, Eq)]
pub struct DeleteArgs {
    pub target: String,
    #[arg(long, value_parser = clap::value_parser!(u64).range(1..))]
    pub base_revision: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_run_and_machine_output() {
        let cli = Cli::try_parse_from([
            "chromvoid",
            "--jsonl",
            "env",
            "run",
            "--profile",
            "backend",
            "--preset",
            "tests",
            "--reason",
            "verify",
        ])
        .expect("parse run");

        assert!(cli.jsonl);
        assert_eq!(
            cli.command,
            TopLevelCommand::Env {
                command: EnvCommand::Run(RunArgs {
                    profile: "backend".into(),
                    preset: "tests".into(),
                    reason: Some("verify".into()),
                })
            }
        );
    }

    #[test]
    fn rejects_two_output_modes() {
        let error = Cli::try_parse_from(["chromvoid", "--json", "--jsonl", "env", "status"])
            .expect_err("modes conflict");
        assert_eq!(error.kind(), clap::error::ErrorKind::ArgumentConflict);
    }

    #[test]
    fn pairing_code_cannot_be_put_on_command_line() {
        let error = Cli::try_parse_from(["chromvoid", "pair", "--pin", "123456"])
            .expect_err("pair has no pin option");
        assert_eq!(error.kind(), clap::error::ErrorKind::UnknownArgument);
    }

    #[test]
    fn parses_stop_all_without_run_id() {
        let cli = Cli::try_parse_from(["chromvoid", "env", "runs", "stop", "--all"])
            .expect("parse stop all");
        assert!(matches!(
            cli.command,
            TopLevelCommand::Env {
                command: EnvCommand::Runs {
                    command: RunsCommand::Stop {
                        run_id: None,
                        all: true
                    }
                }
            }
        ));
    }
}
