/** Final transaction counts retained for the import-complete UI event. */
export interface ImportProgress {
  total: number
  imported: number
  updated: number
  skipped: number
  errors: number
}
