import { isIsoDate, type IsoDate } from '@duty/domain'

export type YearMonth = { year: number; month: number }

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

// 1-3 §6: 날짜는 Asia/Seoul 달력 기준
export function todaySeoul(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now)
}

// 앱의 "오늘". 개발·E2E에서만 DUTY_FAKE_TODAY로 고정할 수 있다(운영에서는 무시)
export function appToday(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): IsoDate {
  const fake = env.DUTY_FAKE_TODAY
  if (env.NODE_ENV !== 'production' && fake && isIsoDate(fake)) return fake
  return todaySeoul(now)
}

// R-VIEW-15: 형식이 틀리면 오늘의 달
export function parseYm(value: string | string[] | undefined, today: IsoDate): YearMonth {
  const m = typeof value === 'string' ? YM_RE.exec(value) : null
  const year = m ? Number(m[1]) : NaN
  if (m && year >= 2000 && year <= 2100) return { year, month: Number(m[2]) }
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }
}

export function shiftYm({ year, month }: YearMonth, delta: number): YearMonth {
  const i = year * 12 + (month - 1) + delta
  return { year: Math.floor(i / 12), month: (i % 12) + 1 }
}

export function ymOf({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`
}
