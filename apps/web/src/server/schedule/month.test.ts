import { describe, expect, it } from 'vitest'
import { appToday, parseYm, shiftYm, todaySeoul, ymOf } from './month'

describe('todaySeoul', () => {
  it('서울 기준 날짜: UTC 15시 이후는 다음 날', () => {
    expect(todaySeoul(new Date('2026-09-30T14:59:00Z'))).toBe('2026-09-30')
    expect(todaySeoul(new Date('2026-09-30T15:00:00Z'))).toBe('2026-10-01')
  })
})

describe('parseYm (R-VIEW-15)', () => {
  const today = '2026-09-27'
  it('YYYY-MM이면 그 달', () => {
    expect(parseYm('2026-10', today)).toEqual({ year: 2026, month: 10 })
    expect(parseYm('2027-01', today)).toEqual({ year: 2027, month: 1 })
  })
  it('없거나 형식이 틀리면 오늘의 달', () => {
    for (const v of [undefined, '', '2026-13', '2026-1', '26-10', '1999-12', '2101-01', ['2026-10']])
      expect(parseYm(v as string | undefined, today), String(v)).toEqual({ year: 2026, month: 9 })
  })
})

describe('shiftYm · ymOf', () => {
  it('앞뒤 달과 연 경계', () => {
    expect(shiftYm({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftYm({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(ymOf({ year: 2026, month: 3 })).toBe('2026-03')
  })
})

describe('appToday — 개발·E2E용 날짜 고정', () => {
  const now = new Date('2026-09-27T03:00:00Z')
  it('DUTY_FAKE_TODAY가 올바른 날짜이고 운영이 아니면 그 날짜', () => {
    expect(appToday({ DUTY_FAKE_TODAY: '2026-10-13', NODE_ENV: 'development' }, now)).toBe('2026-10-13')
  })
  it('운영이거나 값이 없거나 형식이 틀리면 서울 기준 오늘', () => {
    expect(appToday({ DUTY_FAKE_TODAY: '2026-10-13', NODE_ENV: 'production' }, now)).toBe('2026-09-27')
    expect(appToday({ NODE_ENV: 'development' }, now)).toBe('2026-09-27')
    expect(appToday({ DUTY_FAKE_TODAY: '2026-02-30', NODE_ENV: 'test' }, now)).toBe('2026-09-27')
  })
})
