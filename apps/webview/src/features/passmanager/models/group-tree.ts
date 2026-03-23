export interface GroupTreeNode {
  /** Full group path, e.g. 'Work/Jira' */
  path: string
  /** Last segment name, e.g. 'Jira' */
  name: string
  /** Child groups */
  children: GroupTreeNode[]
  /** Entries directly in this group */
  entryCount: number
  /** Entries in this group + all descendants */
  totalEntryCount: number
  /** Optional backing node id (catalog/group id) */
  nodeId?: number
  iconRef?: string
  /** UI expanded state */
  expanded: boolean
}

export interface GroupTree<TEntry = unknown> {
  /** Root entries (groupPath === undefined), shown as '/' */
  rootEntries: TEntry[]
  /** Top-level groups */
  groups: GroupTreeNode[]
  /** Flat list (useful for search); optional */
  allEntries: TEntry[]
}
