import type {TextDirection} from '@project/i18n'

export type LogicalHorizontalEdge = 'start' | 'end'
export type PhysicalHorizontalEdge = 'left' | 'right'

export const resolvePhysicalHorizontalEdge = (
  edge: LogicalHorizontalEdge,
  direction: TextDirection,
): PhysicalHorizontalEdge => {
  if (edge === 'start') return direction === 'rtl' ? 'right' : 'left'
  return direction === 'rtl' ? 'left' : 'right'
}

export const isPointWithinHorizontalEdge = (
  clientX: number,
  viewportWidth: number,
  threshold: number,
  edge: PhysicalHorizontalEdge,
): boolean => (edge === 'left' ? clientX <= threshold : clientX >= viewportWidth - threshold)

export const resolveInwardHorizontalDistance = (
  startX: number,
  currentX: number,
  edge: PhysicalHorizontalEdge,
): number => Math.max(edge === 'left' ? currentX - startX : startX - currentX, 0)

export const resolvePhysicalHorizontalOffset = (
  distance: number,
  edge: PhysicalHorizontalEdge,
): number => (edge === 'left' ? distance : -distance)
