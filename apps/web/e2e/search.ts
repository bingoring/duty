import {
  applyEdits,
  checkSchedule,
  newViolations,
  swappable,
  swapToEdits,
  type CellEdit,
  type ScheduleInput,
  type SwapCode,
} from '@duty/domain'

// 근무표가 시드·생성에 따라 달라지므로, 화면이 규칙 검사를 통과시키는 편집을 도메인 검사기로 미리 찾는다(읽기만 한다)
const passes = (input: ScheduleInput, base: ReturnType<typeof checkSchedule>, edits: CellEdit[]) =>
  !newViolations(base, checkSchedule({ ...input, cells: applyEdits(input.cells, edits) })).hardViolations
    .length

const datesFrom = (input: ScheduleInput, from: string) =>
  [...new Set(input.cells.map((c) => c.date))].sort().filter((d) => d >= from)

export type SwapPair = { date: string; a: string; b: string; ca: SwapCode; cb: SwapCode }

// 두 사람이 그날 근무를 맞바꿔도 새 필수 위반이 없는 쌍 (2-8 교환 요청)
export function findSwapPair(input: ScheduleInput, userIds: string[], from: string): SwapPair {
  const base = checkSchedule(input)
  for (const date of datesFrom(input, from))
    for (const a of userIds)
      for (const b of userIds) {
        if (a >= b) continue
        const ca = input.cells.find((c) => c.userId === a && c.date === date)
        const cb = input.cells.find((c) => c.userId === b && c.date === date)
        if (!swappable(ca) || !swappable(cb) || ca!.code === cb!.code) continue
        const edits = swapToEdits(date, [
          { userId: a, before: { code: ca!.code as SwapCode }, after: { code: cb!.code as SwapCode } },
          { userId: b, before: { code: cb!.code as SwapCode }, after: { code: ca!.code as SwapCode } },
        ])
        if (passes(input, base, edits))
          return { date, a, b, ca: ca!.code as SwapCode, cb: cb!.code as SwapCode }
      }
  throw new Error('교환 쌍 없음')
}

export type SafeEdit = { userId: string; date: string; before: SwapCode; after: SwapCode }

// 칸 하나를 바꿔도 새 필수 위반이 없는 편집 (2-7 관리자 칩 클릭 = 즉시 적용)
export function findSafeEdit(input: ScheduleInput, userIds: string[], from: string): SafeEdit {
  const base = checkSchedule(input)
  for (const date of datesFrom(input, from))
    for (const userId of userIds) {
      const c = input.cells.find((x) => x.userId === userId && x.date === date)
      if (!swappable(c)) continue
      for (const after of ['D', 'E', 'N', 'OFF'] as const) {
        if (after === c!.code) continue
        const edit: CellEdit = {
          userId,
          date,
          before: { code: c!.code },
          after: { code: after },
          kind: 'manual',
        }
        if (passes(input, base, [edit])) return { userId, date, before: c!.code as SwapCode, after }
      }
    }
  throw new Error('안전한 편집 없음')
}

export const mdOf = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
export const lab = (c: string) => (c === 'OFF' ? 'off' : c)
