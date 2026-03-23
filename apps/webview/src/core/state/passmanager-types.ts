export interface EntryLocation {
  nodeId: number
  groupPath: string | undefined
}

export interface EntryIndexRecord {
  entryNodeId: number
  groupPath: string | undefined
  labelMap: Map<string, string>
}
