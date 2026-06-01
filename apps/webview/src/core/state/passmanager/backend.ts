import type {PasswordsRepository} from '@project/passmanager/ports'

export interface PassmanagerBackend extends PasswordsRepository {
  getRevision(): Promise<string>
}
