/**
 * Device state types (OrangePI/ChromVoid hardware)
 *
 * These types describe the physical device state from chromvoidfs API.
 * NOT part of Rust core — maintained as TypeScript-only.
 */
export type FullChromVoidState = {
  /** User initialization required */
  NeedUserInitialization?: boolean
  /** Free space in MB */
  PhysicalFreeSpaceMB?: number
  /** Total space in MB */
  PhysicalTotalSpaceMB?: number
  /** Device serial number */
  SerialNum?: string
  /** Storage is unlocked */
  StorageOpened?: boolean
  /** ChromVoid version */
  ChromVoidVersion?: string
  /** Storage path */
  StorePath?: string
}
