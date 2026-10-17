import type { CellSource, LeaveType, RequestOption, RequestSpecial } from './allowed-sets'
import type { GridCell, RequestEntry } from './types'

// 1-2 §5 만족 조건: 근무 코드가 옵션에 있거나, OFF 옵션이면 모든 offKind의 OFF 칸
export function optionsSatisfied(cell: GridCell, options: readonly RequestOption[]): boolean {
  if (cell.code === 'OFF') return options.includes('OFF')
  return (options as readonly string[]).includes(cell.code)
}

export function specialSatisfied(cell: GridCell, special: RequestSpecial): boolean {
  switch (special) {
    case 'AL':
      return cell.code === 'AL'
    case 'EDU_CONT':
      return cell.code === 'OFF' && cell.offKind === 'edu_cont'
    case 'EDU_UNION':
      return cell.code === 'OFF' && cell.offKind === 'edu_union'
  }
}

// R-SOURCE-1: admin > requested > auto. 연차·휴가 칸은 승인 휴가이므로 requested
export function resolveCellSource(
  cell: GridCell,
  request: RequestEntry | undefined,
  adminEdited: boolean,
): CellSource {
  if (adminEdited) return 'admin'
  if (cell.code === 'AL' || cell.code === 'LEAVE') return 'requested'
  if (!request) return 'auto'
  const ok = request.special
    ? specialSatisfied(cell, request.special)
    : optionsSatisfied(cell, request.options)
  return ok ? 'requested' : 'auto'
}

// 3-6: 휴가 칸은 「휴」가 아니라 종류로 보인다(사용자 2026-10-18 — 전체 이름)
export const LEAVE_TYPE_SHORT: Record<LeaveType, string> = {
  annual: '연차',
  family: '경조',
  sick: '병가',
  official: '공가',
  special: '특휴',
  checkup: '검진',
  founding: '개원',
}

// 근무표 칸의 휴가 이름. 휴가 칸이 아니면 null
export function leaveCellLabel(c: {
  code?: string | null
  offKind?: string | null
  leaveKind?: string | null
}): string | null {
  if (c.code === 'AL') return LEAVE_TYPE_SHORT.annual
  if (c.code === 'LEAVE') return LEAVE_TYPE_SHORT[(c.leaveKind ?? '') as LeaveType] ?? '휴가'
  if (c.code === 'OFF' && (c.offKind === 'special' || c.offKind === 'founding'))
    return LEAVE_TYPE_SHORT[c.offKind]
  return null
}
