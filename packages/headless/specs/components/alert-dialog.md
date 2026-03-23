# Alert Dialog Component Contract

## Purpose

`AlertDialog` is a specialized modal dialog for critical confirmations or alerts that require immediate user attention. It differs from a standard dialog by its role and focus behavior, specifically prioritizing the least destructive action.

## Component Files

- `src/alert-dialog/index.ts` - model and public `createAlertDialog` API
- `src/alert-dialog/alert-dialog.test.ts` - unit behavior tests

## Public API

- `createAlertDialog(options)`
- `state` (signal-backed):
  - `isOpen()`
- `actions`:
  - `open`, `close`
  - `handleKeyDown`
- `contracts`:
  - `getDialogProps()`
  - `getOverlayProps()`
  - `getTitleProps()`
  - `getDescriptionProps()`
  - `getCancelButtonProps()`
  - `getActionButtonProps()`

## APG and A11y Contract

- content role: `alertdialog`
- required attributes:
  - content: `aria-modal="true"`, `aria-labelledby`, `aria-describedby`
- focus management:
  - initial focus MUST be on the least destructive element (e.g., "Cancel" button)
  - focus trap within the dialog while open
  - focus restore to the trigger on close

## Behavior Contract

- `Escape` key closes the dialog (if appropriate for the context)
- focus management: specifically prioritizes the "Cancel" or "No" action to prevent accidental destructive actions
- scroll lock on the body when open
- focus trap: `Tab` and `Shift+Tab` cycle through focusable elements inside the dialog

## Invariants

- `isOpen` is a boolean
- `aria-describedby` is mandatory for `alertdialog` to ensure the alert message is announced
- focus is always trapped while open
- initial focus is placed on the cancel/least-destructive action by default

## Minimum Test Matrix

- open/close state transitions
- initial focus on the "Cancel" button by default
- focus trap behavior (Tab/Shift+Tab wrapping)
- focus restore on close
- `Escape` key dismissal
- mandatory `aria-describedby` presence check

## ADR-001 Compliance

- **Runtime Policy**: Reatom v1000 only; no @statx/* in headless core.
- **Layering**: core -> interactions -> a11y-contracts -> adapters; adapters remain thin mappings.
- **Independence**: No imports from @project/*, apps/*, or other out-of-package modules.
- **Verification**: Mandatory adapter integration tests and standalone package test execution.

## Out of Scope (Current)

- non-modal alerts (use `alert` component)
- complex multi-step confirmation flows
- custom focus trap logic (uses shared dialog primitive)
