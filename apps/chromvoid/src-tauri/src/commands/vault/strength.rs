use zxcvbn::zxcvbn;

use crate::types::{rpc_ok, PasswordStrengthFeedback, PasswordStrengthFeedbackDetails, RpcResult};

#[tauri::command]
pub(crate) fn password_strength_estimate(password: String) -> RpcResult<PasswordStrengthFeedback> {
    if password.is_empty() {
        return rpc_ok(PasswordStrengthFeedback::neutral());
    }

    let entropy = zxcvbn(&password, &[]);
    let feedback = entropy.feedback();

    rpc_ok(PasswordStrengthFeedback {
        score: u8::from(entropy.score()),
        feedback: PasswordStrengthFeedbackDetails {
            warning: feedback
                .and_then(|item| item.warning())
                .map(|item| item.to_string())
                .unwrap_or_default(),
            suggestions: feedback
                .map(|item| {
                    item.suggestions()
                        .iter()
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
        },
    })
}

#[cfg(test)]
mod tests {
    use crate::types::RpcResult;

    use super::*;

    fn unwrap_ok(result: RpcResult<PasswordStrengthFeedback>) -> PasswordStrengthFeedback {
        match result {
            RpcResult::Success { result, .. } => result,
            RpcResult::Error { error, code, .. } => {
                panic!("expected success, got error code={code:?} error={error}")
            }
        }
    }

    #[test]
    fn empty_password_returns_neutral_feedback() {
        let result = unwrap_ok(password_strength_estimate(String::new()));

        assert_eq!(result, PasswordStrengthFeedback::neutral());
    }

    #[test]
    fn weak_password_returns_low_score_with_feedback() {
        let result = unwrap_ok(password_strength_estimate("password".to_string()));

        assert!(result.score <= 2);
        assert!(
            !result.feedback.warning.is_empty() || !result.feedback.suggestions.is_empty(),
            "weak passwords should return actionable feedback"
        );
    }

    #[test]
    fn strong_password_returns_high_score_without_feedback() {
        let result = unwrap_ok(password_strength_estimate(
            "r0sebudmaelstrom11/20/91aaaa".to_string(),
        ));

        assert_eq!(result.score, 4);
        assert!(result.feedback.warning.is_empty());
        assert!(result.feedback.suggestions.is_empty());
    }
}
