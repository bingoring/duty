import type { HolidayKind } from './allowed-sets'

// 'YYYY-MM-DD' (Asia/Seoul 달력 날짜). 계산은 UTC 자정 기준으로 해서 실행 환경의 시간대에 의존하지 않는다.
export type IsoDate = string

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000
const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

function toMs(iso: IsoDate): number {
  const m = ISO_RE.exec(iso)
  if (!m) throw new RangeError(`잘못된 날짜: ${iso}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function fromMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function isIsoDate(s: string): boolean {
  return ISO_RE.test(s) && fromMs(toMs(s)) === s
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return fromMs(toMs(iso) + n * DAY_MS)
}

// b − a (일)
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS)
}

// 0=일 … 6=토
export function dayOfWeek(iso: IsoDate): number {
  return new Date(toMs(iso)).getUTCDay()
}

export function weekdayKo(iso: IsoDate): string {
  return WEEKDAYS_KO[dayOfWeek(iso)]!
}

export function isWeekend(iso: IsoDate): boolean {
  const d = dayOfWeek(iso)
  return d === 0 || d === 6
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isoOf(year: number, month: number, day: number): IsoDate {
  return fromMs(Date.UTC(year, month - 1, day))
}

export function monthDates(year: number, month: number): IsoDate[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => isoOf(year, month, i + 1))
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

export function formatMD(iso: IsoDate): string {
  const [, , m, d] = ISO_RE.exec(iso)!
  return `${Number(m)}/${Number(d)}`
}

// 빨간 날 = 토·일 ∪ 개원기념일이 아닌 공휴일 (R-BASE-1)
export function redDaySet(holidays: readonly { date: IsoDate; kind: HolidayKind }[]): Set<IsoDate> {
  return new Set(holidays.filter((h) => h.kind !== 'founding_day').map((h) => h.date))
}

export function isRedDay(iso: IsoDate, holidaySet: ReadonlySet<IsoDate>): boolean {
  return isWeekend(iso) || holidaySet.has(iso)
}

export type Employment = { employedFrom: IsoDate | null; employedUntil: IsoDate | null }

// 재직일: employedFrom ≤ d ≤ employedUntil (null은 무제한). ISO 문자열은 사전순 = 날짜순이다
export function isEmployed(e: Employment, iso: IsoDate): boolean {
  return (
    (e.employedFrom === null || e.employedFrom <= iso) && (e.employedUntil === null || iso <= e.employedUntil)
  )
}
