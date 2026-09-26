import type { BalanceAccount, ShiftCode } from './allowed-sets'
import { hasWeekendPair } from './checker/person'
import { isEmployed, isRedDay, monthDates, redDaySet } from './dates'
import { isRestCode, type GridCell, type HolidayDay, type NurseProfile } from './types'

export type BalanceDelta = { account: BalanceAccount; delta: number }

export type SettlementResult = {
  baselineOff: number
  actualOff: number
  sleepingOff: number
  nightCount: number
  offCarryBefore: number
  offCarryAfter: number
  nightBankBefore: number
  nightBankAfter: number
  weekendPairAchieved: boolean
  specialUsed: number
  foundingUsed: number
  checkupUsed: number
  eduCont: number
  eduUnion: number
  annualUsed: number
  sickUsed: number
  // 0이 아닌 증감만. reason='month_settlement'는 호출자가 붙인다
  entries: BalanceDelta[]
}

// 0.5 단위 값의 부동소수 오차 정리
const round1 = (x: number) => Math.round(x * 10) / 10

// R-BASE-2: 대상 월 재직일 중 빨간 날 수
export function baselineOff(
  nurse: NurseProfile,
  year: number,
  month: number,
  holidays: readonly HolidayDay[],
) {
  const red = redDaySet(holidays)
  return monthDates(year, month).filter((d) => isEmployed(nurse, d) && isRedDay(d, red)).length
}

// 1-2 §0·§4 월 정산 (business-logic-model §2.5)
export function settleMonth(args: {
  nurse: NurseProfile
  year: number
  month: number
  cells: readonly GridCell[]
  holidays: readonly HolidayDay[]
  sleepingOffPerN: number
}): SettlementResult {
  const { nurse, cells } = args
  const off = (kind: string) => cells.filter((c) => c.code === 'OFF' && c.offKind === kind).length
  const code = (c: ShiftCode) => cells.filter((x) => x.code === c).length

  const eduCont = off('edu_cont')
  const eduUnion = off('edu_union')
  const actualOff = off('regular') + eduCont + eduUnion
  const sleepingOff = off('sleeping')
  const nightCount = code('N')
  const baseline =
    nurse.rotation === 'fixed_weekday' ? actualOff : baselineOff(nurse, args.year, args.month, args.holidays)
  const offDelta = actualOff - baseline
  const nightDelta = nightCount - args.sleepingOffPerN * sleepingOff
  const specialUsed = off('special')
  const foundingUsed = off('founding')
  const checkupUsed = round1(0.5 * cells.filter((c) => c.checkupHalf).length)
  const annualUsed = code('AL')
  const sickUsed = cells.filter((c) => c.code === 'LEAVE' && c.leaveKind === 'sick').length

  const entries = (
    [
      ['off_carry', offDelta],
      ['night_bank', nightDelta],
      ['annual_leave', -annualUsed],
      ['special_leave', -specialUsed],
      ['founding_off', -foundingUsed],
      ['checkup', -checkupUsed],
      ['sick_leave', -sickUsed],
      ['edu_cont', eduCont],
      ['edu_union', eduUnion],
    ] as const
  )
    .filter(([, delta]) => delta !== 0)
    .map(([account, delta]) => ({ account, delta }))

  const byDate = new Map(cells.map((c) => [c.date, c]))
  const isRest = (d: string) => {
    const c = byDate.get(d)
    return c !== undefined && isRestCode(c.code)
  }

  return {
    baselineOff: baseline,
    actualOff,
    sleepingOff,
    nightCount,
    offCarryBefore: nurse.offCarryBefore,
    offCarryAfter: round1(nurse.offCarryBefore + offDelta),
    nightBankBefore: nurse.nightBankBefore,
    nightBankAfter: nurse.nightBankBefore + nightDelta,
    weekendPairAchieved: hasWeekendPair(isRest, monthDates(args.year, args.month)),
    specialUsed,
    foundingUsed,
    checkupUsed,
    eduCont,
    eduUnion,
    annualUsed,
    sickUsed,
    entries,
  }
}

// R-SETTLE-6: 마감 취소
export function reverseEntries(entries: readonly BalanceDelta[]): BalanceDelta[] {
  return entries.map((e) => ({ account: e.account, delta: -e.delta }))
}

// S8 "간호사별 배정 요약"
export function summarizeNurse(cells: readonly GridCell[]): Record<ShiftCode, number> {
  const out: Record<ShiftCode, number> = { D: 0, E: 0, N: 0, S: 0, OFF: 0, AL: 0, LEAVE: 0 }
  for (const c of cells) out[c.code]++
  return out
}
