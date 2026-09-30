import type { CellEdit } from './adjust'
import { diffDays, type IsoDate } from './dates'
import type { GridCell } from './types'

// Build Spec 2-8 domain-entities §3 — 간호사 교환 요청 (한 요청 = 한 날짜, Q2)
export type SwapCode = 'D' | 'E' | 'N' | 'OFF'
export type SwapItem = { userId: string; before: { code: SwapCode }; after: { code: SwapCode } }

export const SWAP_CODES: readonly SwapCode[] = ['D', 'E', 'N', 'OFF']

// R-SWAP-3: D·E·N·일반 OFF만. 휴가·교육·슬리핑오프·S는 바꾸지 않는다
export function swappable(c: GridCell | undefined): boolean {
  if (!c) return false
  if (c.code === 'OFF') return !c.offKind || c.offKind === 'regular'
  return c.code === 'D' || c.code === 'E' || c.code === 'N'
}

// 그날 D/E/N 개수 유지 = before·after 코드 다중집합이 같다
export function sameCounts(items: readonly SwapItem[]): boolean {
  const key = (xs: string[]) => [...xs].sort().join()
  return key(items.map((i) => i.before.code)) === key(items.map((i) => i.after.code))
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
