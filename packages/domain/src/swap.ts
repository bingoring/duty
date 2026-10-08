import type { CellEdit } from './adjust'
import { diffDays, type IsoDate } from './dates'
import type { GridCell } from './types'

// Build Spec 2-8 domain-entities §3 — 간호사 교환 요청 (한 요청 = 한 날짜, Q2)
// 2-11 R-SWAPH-2: 수간호사 칸은 S ↔ D만
export type SwapCode = 'D' | 'E' | 'N' | 'OFF' | 'S'
export type SwapItem = { userId: string; before: { code: SwapCode }; after: { code: SwapCode } }

export const SWAP_CODES: readonly SwapCode[] = ['D', 'E', 'N', 'OFF']
export const HEAD_SWAP_CODES: readonly SwapCode[] = ['S', 'D']

// R-SWAP-3: D·E·N·일반 OFF만. 휴가·교육·슬리핑오프·S는 바꾸지 않는다
export function swappable(c: GridCell | undefined, head = false): boolean {
  if (!c) return false
  if (head) return c.code === 'S' || c.code === 'D'
  if (c.code === 'OFF') return !c.offKind || c.offKind === 'regular'
  return c.code === 'D' || c.code === 'E' || c.code === 'N'
}

// 그날 D/E/N 개수 유지 = before·after 코드 다중집합이 같다.
// 2-11 R-SWAPH-3: 수간호사의 S는 교대 인원이 아니므로 OFF와 같게 센다
export function sameCounts(items: readonly SwapItem[], heads: ReadonlySet<string> = new Set()): boolean {
  const norm = (i: SwapItem, c: SwapCode) => (heads.has(i.userId) && c === 'S' ? 'OFF' : c)
  const key = (xs: string[]) => [...xs].sort().join()
  return key(items.map((i) => norm(i, i.before.code))) === key(items.map((i) => norm(i, i.after.code)))
}

const asCell = (code: SwapCode) => (code === 'OFF' ? { code, offKind: 'regular' as const } : { code })

export function swapToEdits(date: IsoDate, items: readonly SwapItem[]): CellEdit[] {
  return items
    .filter((i) => i.before.code !== i.after.code)
    .map((i) => ({
      userId: i.userId,
      date,
      before: asCell(i.before.code),
      after: asCell(i.after.code),
      kind: 'swap',
    }))
}

type Window = { negotiationStart: IsoDate; negotiationEnd: IsoDate }

export function inNegotiation(p: Window, today: IsoDate): boolean {
  return p.negotiationStart <= today && today <= p.negotiationEnd
}

// 협의 기간 남은 날(오늘 포함). 시작 전이면 기간 전체 길이
export function daysLeft(p: Window, today: IsoDate): number {
  if (today > p.negotiationEnd) return 0
  const from = today < p.negotiationStart ? p.negotiationStart : today
  return diffDays(from, p.negotiationEnd) + 1
}
