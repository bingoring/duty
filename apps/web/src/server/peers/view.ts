import { addDays, formatMD, weekendPairs } from '@duty/domain'
import { shiftYm, ymOf } from '../schedule/month'
import type { MonthViewData, RowBalance } from '../schedule/types'
import { num, signed } from '../schedule/view'

// Build Spec 2-10 business-rules §1 — S6 동료 현황
export type PeerRow = {
  userId: string
  name: string
  me: boolean
  off: string
  acc: string
  nights: string
  nLeft: string
  sleeping: string
  weekend: string
}

export type PeersView = {
  title: string
  prevYm: string
  nextYm: string
  rows: PeerRow[]
  empty: string | null
}

export function buildPeersView(d: MonthViewData): PeersView {
  const ym = { year: d.year, month: d.month }
  const next = shiftYm(ym, 1)
  const base = {
    title: `동료 현황 · ${d.year}년 ${d.month}월`,
    prevYm: ymOf(shiftYm(ym, -1)),
    nextYm: ymOf(next),
  }
  // R-PEER-3
  if (!(d.plan && (d.plan.status === 'CONFIRMED' || d.plan.status === 'CLOSED')))
    return { ...base, rows: [], empty: `${d.month}월 근무표가 아직 확정되지 않았습니다.` }

  // R-PEER-7
  const weekend = (userId: string) => {
    const pairs = weekendPairs(
      d.cells.filter((c) => c.userId === userId),
      d.year,
      d.month,
    )
    if (!pairs.length)
      return d.rules.toggles.weekendPairOffMonthly ? `미배정 → ${next.month}월 우선` : '미배정'
    const sat = pairs[0]!.saturday
    const sun = addDays(sat, 1)
    const text =
      sun.slice(0, 7) === sat.slice(0, 7)
        ? `${formatMD(sat)}–${Number(sun.slice(8))}`
        : `${formatMD(sat)}–${formatMD(sun)}`
    return `${text}${pairs[0]!.pending ? ' 예정' : ''}${pairs.length > 1 ? ` 외 ${pairs.length - 1}` : ''}`
  }

  // R-PEER-4·8: 교대 근무자만, 누적 OFF ↑ → 잔여 N ↓ → 연차 순
  const rows = d.users
    .filter((u) => u.rotation !== 'fixed_weekday' && d.balances.has(u.id))
    .map((u) => ({ u, b: d.balances.get(u.id) as RowBalance }))
    .sort(
      (x, y) =>
        x.b.offCarryAfter - y.b.offCarryAfter ||
        y.b.nightBankAfter - x.b.nightBankAfter ||
        x.u.seniorityRank - y.u.seniorityRank,
    )
    .map(({ u, b }) => ({
      userId: u.id,
      name: u.name,
      me: u.id === d.viewerId,
      off: num(b.actualOff),
      acc: signed(b.offCarryAfter),
      nights: num(b.nightCount),
      nLeft: num(b.nightBankAfter),
      sleeping: num(b.sleepingOff),
      weekend: weekend(u.id),
    }))
  return { ...base, rows, empty: null }
}
