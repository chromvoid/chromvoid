import type {GroupTreeNode} from './group-tree'

export type GroupTreeGroupInput = {
  /** Full group path, e.g. 'Work/Jira' */
  path: string
  /** Entries directly in this group */
  entryCount: number
  /** Optional backing node id */
  nodeId?: number
  iconRef?: string
}

type MutableNode = Omit<GroupTreeNode, 'children'> & {children: MutableNode[]}

function createNode(input: GroupTreeGroupInput, expandedPaths: Set<string>): MutableNode {
  const parts = input.path.split('/').filter(Boolean)
  const name = parts.length > 0 ? parts[parts.length - 1]! : input.path
  return {
    path: input.path,
    name,
    children: [],
    entryCount: input.entryCount,
    totalEntryCount: input.entryCount,
    nodeId: input.nodeId,
    iconRef: input.iconRef,
    expanded: expandedPaths.has(input.path),
  }
}

function sortNodes(nodes: MutableNode[]): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name))
  for (const n of nodes) sortNodes(n.children)
}

function computeTotals(node: MutableNode): number {
  let sum = node.entryCount
  for (const child of node.children) sum += computeTotals(child)
  node.totalEntryCount = sum
  return sum
}

/**
 * Builds a nested group tree from a flat list of group paths.
 *
 * Assumptions:
 * - group paths are already normalized (no leading/trailing '/', segments separated by '/')
 * - callers decide how to compute entryCount (e.g. filtered vs total)
 */
export function buildGroupTreeNodes(
  groups: GroupTreeGroupInput[],
  expandedPaths: Set<string>,
): GroupTreeNode[] {
  const byPath = new Map<string, MutableNode>()
  const roots: MutableNode[] = []

  const getOrCreate = (path: string): MutableNode => {
    const existing = byPath.get(path)
    if (existing) return existing

    // Placeholder node (no direct entries); can be replaced/updated later.
    const created = createNode({path, entryCount: 0}, expandedPaths)
    byPath.set(path, created)

    const parts = path.split('/').filter(Boolean)
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''

    if (!parentPath) {
      roots.push(created)
    } else {
      const parent = getOrCreate(parentPath)
      parent.children.push(created)
    }

    return created
  }

  // Ensure all nodes exist and update leaf metadata.
  for (const g of groups) {
    if (!g?.path) continue
    const node = getOrCreate(g.path)
    node.entryCount = g.entryCount
    node.nodeId = g.nodeId
    node.iconRef = g.iconRef
    node.expanded = expandedPaths.has(g.path)
  }

  // Compute totals bottom-up.
  for (const n of roots) computeTotals(n)

  // Sort for stable UI.
  sortNodes(roots)

  return roots
}
