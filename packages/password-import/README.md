# @chromvoid/password-import

Password import library for ChromVoid — client-side migration from KeePass, Bitwarden, and CSV exports.

## Installation

```bash
pnpm add @chromvoid/password-import
```

## Features

- **Client-side parsing**: All file processing happens in the browser. Secrets never leave your device.
- **Multiple formats**:
  - KeePass (.kdbx) — encrypted password databases
  - Bitwarden JSON exports
  - CSV files (LastPass, Bitwarden, Generic format)
- **Conflict detection**: Auto-rename with suffix (2), (3), etc. for name collisions
- **OTP import**: TOTP/HOTP secrets imported into ChromVoid catalog
- **Custom fields**: Stored in `.fields.json` and duplicated to `.note` for Phase 1 visibility
- **Cancel/abort**: Import can be cancelled mid-process
- **Progress tracking**: Real-time updates (entries imported, errors, current entry)

## Usage

### Basic Import

```typescript
import {ImportDialog} from '@chromvoid/password-import'

// Register dialog custom element
ImportDialog.define()

// In your component, render the dialog
<pm-import-dialog
  @import-complete=${handleImportComplete}
  @import-close=${handleImportClose}
></pm-import-dialog>
```

### Providing Catalog Operations

The import dialog requires catalog operations to write entries to the passmanager namespace. All paths passed to `CatalogOperations` are relative to the passmanager root — the adapter is responsible for mapping them to actual catalog paths. Create an adapter from your app-layer catalog service:

```typescript
import {createCatalogOperationsAdapter} from '@chromvoid/password-import'

// In your app initialization
const catalogOps = createCatalogOperationsAdapter(window.catalog)

// Pass to dialog
const dialog = document.querySelector('pm-import-dialog')
dialog?.setCatalogOperations(catalogOps)
```

## API

### `parseKeePass(file: File, password: string): Promise<ImportResult>`

Parse a KeePass .kdbx file.

```typescript
const result = await parseKeePass(file, 'master-password')
console.log(result.entries.length, 'entries imported')
console.log(result.folders.length, 'folders')
```

### `parseCSV(file: File): Promise<ImportResult>`

Parse a CSV file (LastPass, Bitwarden, Generic format auto-detected).

```typescript
const result = await parseCSV(file)
```

### `parseBitwardenJson(file: File): Promise<ImportResult>`

Parse a Bitwarden JSON export.

```typescript
const result = await parseBitwardenJson(file)
```

### `detectConflicts(entries: ImportedEntry[], existingCatalog?: Set<string>): Conflict[]`

Find conflicts between import entries and existing catalog.

```typescript
const conflicts = detectConflicts(entries)
```

### `resolveConflictsAutoRename(entries: ImportedEntry[], existingCatalog?: Set<string>): void`

Auto-resolve name conflicts by adding suffix (2), (3), etc.

```typescript
resolveConflictsAutoRename(entries, existingCatalog)
```

### `ImportOrchestrator`

Manages the import process with progress tracking and abort support.

```typescript
const orchestrator = new ImportOrchestrator()
const result = await orchestrator.execute(catalogOps, entries, onProgress)

// Check result
if (result.success) {
  console.log('Import completed')
}
console.log(result.errors, 'errors')
```

## Types

### `ImportResult`

Result of parsing a file.

```typescript
interface ImportResult {
  entries: ImportedEntry[]      // All entries found
  folders: ImportedFolder[]     // All folders/groups found
  warnings: string[]          // Warnings during parsing
}
```

### `ImportedEntry`

A password or secure note entry.

```typescript
interface ImportedEntry {
  id: string                  // Unique ID
  type: 'login' | 'secure_note' | 'card' | 'identity'
  title: string               // Entry title
  username: string | null     // Username
  password: string | null     // Password (for client UI display only)
  url: string | null          // Primary URL
  urls: string[]             // All URLs
  notes: string | null         // Notes
  customFields: Array<{key: string; value: string}> | null
  otp: OTPData | null       // TOTP/HOTP configuration
  folder: string | null      // Folder/group path
}
```

### `ImportProgress`

Progress tracking during import.

```typescript
interface ImportProgress {
  total: number      // Total entries to import
  imported: number   // Successfully imported count
  skipped: number    // Skipped entries
  errors: number     // Error count
  currentItem?: string  // Current entry being processed
}
```

### `ImportOrchestratorResult`

Result of import execution.

```typescript
interface ImportOrchestratorResult {
  success: boolean              // Was import successful?
  progress: ImportProgress       // Final progress state
  errors: string[]             // Error messages
}
```

### `Conflict`

Conflict type and resolution.

```typescript
interface Conflict {
  type: 'name_collision' | 'possible_duplicate'
  entry: ImportedEntry
  existingName?: string
}
```

## Validation Limits

The following limits are enforced by the validation utilities:

| Limit | Value | Description |
|--------|--------|-------------|
| File size | 50 MB | Maximum import file size |
| Entries | 10,000 | Maximum entries per import |
| Field length | 10,000 | Maximum characters for text fields |
| Folder depth | 10 | Maximum folder nesting depth |

## Catalog Operations Interface

To integrate with ChromVoid's catalog, implement this interface:

```typescript
interface CatalogOperations {
  createDir(name: string, parentPath: string): Promise<{nodeId: number} | {nameExists: true}>
  prepareUpload(parentPath: string, name: string, size: number, chunkSize: number, mimeType: string): Promise<{nodeId: number}>
  upload(nodeId: number, size: number, data: Uint8Array): Promise<void>
  setOTPSecret(params: {nodeId: number; label: string; secret: string; encoding: string; algorithm: string; digits: number; period: number}): Promise<void>
  deleteNode(nodeId: number): Promise<void>
}
```

## I18n Keys

The dialog uses the following i18n keys (add these to your translation data):

```
import:dialog:title
import:dialog:drop_zone
import:dialog:supported_formats
import:password:title
import:password:description
import:password:placeholder
import:password:empty
import:preview:title
import:preview:entries
import:preview:folders
import:preview:import_button
import:progress:title
import:progress:imported
import:progress:errors
import:progress:current
import:progress:cancel
import:complete:title
import:complete:title_errors
import:complete:imported
import:complete:errors
import:button:back
import:button:decrypt
import:button:close
import:error:unsupported_format
import:notify:import:started
import:notify:import:success
import:notify:import:error
```

## Architecture

The package follows ChromVoid's architecture:

- **Dumb components**: The import dialog component only renders state and calls model methods
- **Smart models**: Import logic is in orchestrator/mapper/parser modules using reactive `state()` signals
- **Decoupled RPC**: `CatalogOperations` interface abstracts the catalog layer, allowing the app to provide the actual implementation

## Error Handling

All errors include:

- **KeePassParseError**: Raised for KeePass-specific parsing issues (invalid password, corrupt file)
  - `WRONG_PASSWORD`: Master password is incorrect
  - `CORRUPT_FILE`: File is corrupted or invalid
  - `UNSUPPORTED_VERSION`: KeePass version not supported
  - `PARSE_ERROR`: General parsing error

- **ImportValidationError**: Raised for validation failures
  - `IMPORT_FILE_TOO_LARGE`: File exceeds 50 MB limit
  - `IMPORT_TOO_MANY_ENTRIES`: More than 10,000 entries
  - `IMPORT_FIELD_TOO_LONG`: Field exceeds length limit

## License

ISC
