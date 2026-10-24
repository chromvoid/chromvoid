import type {CredentialImportService} from '../credential-import-service.js'

let service: CredentialImportService | null = null

/** The application replaces this service whenever the vault or active host changes. */
export function setCredentialImportService(next: CredentialImportService | null): void {
  if (service === next) return
  service?.dispose()
  service = next
}

export function getCredentialImportService(): CredentialImportService | null {
  return service
}
