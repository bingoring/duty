import {
  leaveDates,
  leaveToCell,
  type CellEdit,
  type GridCell,
  type IsoDate,
  type LeaveType,
} from '@duty/domain'

// 3-10 9: 근무 조정의 「저장 전 휴가」 — 휴가 넣기 + 다시 생성 결과는 「저장 · 재배포」 전까지 브라우저에만 있다.
// 브라우저(격자 미리보기)와 서버(리롤·저장 재검사)가 같은 변환을 쓴다
export type DraftLeaveInput = {
  userId: string
  type: LeaveType
  reasonCode?: string
  startDate: IsoDate
  endDate?: IsoDate
}

export type DraftLeave = {
  userId: string
  type: LeaveType
  reasonCode?: string
  startDate: IsoDate
  endDate: IsoDate
  // 휴가로 바뀌는 이 달 칸의 넣기 전 값 (저장 시 R-ADJ-7 비교)
  cells: { date: IsoDate; before: CellEdit['before'] }[]
}

const cellKey = (userId: string, date: string) => `${userId}|${date}`

// R-APPROVE-2와 같은 변환: 휴가 종류 → 칸. 검진 날은 S + 반차 표시
export function leaveCellOf(c: GridCell, type: LeaveType): GridCell {
  const f = leaveToCell(type)!
  return { userId: c.userId, date: c.date, checkupHalf: type === 'checkup' || c.checkupHalf, ...f }
}

// 저장 전 휴가가 덮는 칸 키 (이 달 칸만)
export function draftLeaveKeys(leaves: readonly Pick<DraftLeave, 'userId' | 'cells'>[]): Set<string> {
  return new Set(leaves.flatMap((l) => l.cells.map((c) => cellKey(l.userId, c.date))))
}

// 휴가 기간 칸 키 (기간 전체 — 이 달 밖 날짜도 포함)
export function leaveRangeKeys(l: { userId: string; startDate: IsoDate; endDate: IsoDate }): Set<string> {
  return new Set(leaveDates(l.startDate, l.endDate).map((d) => cellKey(l.userId, d)))
}

export function applyDraftLeaves(
  cells: readonly GridCell[],
  leaves: readonly Pick<DraftLeave, 'userId' | 'type' | 'startDate' | 'endDate'>[],
): GridCell[] {
  if (!leaves.length) return [...cells]
  return cells.map((c) => {
    const l = leaves.find((x) => x.userId === c.userId && x.startDate <= c.date && c.date <= x.endDate)
    return l ? leaveCellOf(c, l.type) : c
  })
}

const sameBefore = (a: CellEdit['before'], b: CellEdit['before']) =>
  a.code === b.code &&
  (a.offKind ?? null) === (b.offKind ?? null) &&
  (a.leaveKind ?? null) === (b.leaveKind ?? null)

export const beforeOf = (c: {
  code: string
  offKind?: string | null
  leaveKind?: string | null
}): CellEdit['before'] => ({
  code: c.code as CellEdit['before']['code'],
  ...(c.offKind ? { offKind: c.offKind as CellEdit['before']['offKind'] } : {}),
  ...(c.leaveKind ? { leaveKind: c.leaveKind as CellEdit['before']['leaveKind'] } : {}),
})

// 다시 생성 결과를 저장 전 편집에 합친다: 이전 편집은 두고(새 휴가가 덮는 칸만 뺀다) 새 편집을 얹는다
export function mergeRerolled(
  prev: readonly CellEdit[],
  leave: DraftLeave,
  next: readonly CellEdit[],
): CellEdit[] {
  const covered = draftLeaveKeys([leave])
  const m = new Map(
    prev.filter((e) => !covered.has(cellKey(e.userId, e.date))).map((e) => [cellKey(e.userId, e.date), e]),
  )
  for (const e of next) m.set(cellKey(e.userId, e.date), e)
  return [...m.values()]
}

// 저장 전 편집의 before가 지금 칸과 같은지 (R-ADJ-7)
export function staleBefore(
  items: readonly { userId: string; date: string; before: CellEdit['before'] }[],
  at: ReadonlyMap<string, { code: string; offKind: string | null; leaveKind: string | null }>,
) {
  return items.filter((e) => {
    const c = at.get(cellKey(e.userId, e.date))
    return !c || !sameBefore(e.before, beforeOf(c))
  })
}
