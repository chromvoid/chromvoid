import {PasswordManagerElement} from './components/main'
import type {ManagerSaver} from '@project/passmanager'

export {PasswordManagerElement, type ManagerSaver}

/**
 * Initialize and register all Password Manager UI components.
 * Call this once during app initialization.
 *
 * @param managerSaver - The ManagerSaver implementation for data persistence
 */
export function registerPassManagerComponents(managerSaver: ManagerSaver): void {
  PasswordManagerElement.define(managerSaver)
}
