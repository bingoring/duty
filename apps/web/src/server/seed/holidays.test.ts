import { HOLIDAY_KINDS } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import { SEED_HOLIDAYS } from './holidays'

const byYear = (y: number) => SEED_HOLIDAYS.filter((h) => h.date.startsWith(`${y}-`))

describe('공휴일 시드 (business-rules R-HOL-1, §6)', () => {
  it('연도별 개수: 2026 = 21, 2027 = 21', () => {
    expect(byYear(2026)).toHaveLength(21)
    expect(byYear(2027)).toHaveLength(21)
  })
  it('날짜가 중복되지 않는다', () => {
    const dates = SEED_HOLIDAYS.map((h) => h.date)
    expect(new Set(dates).size).toBe(dates.length)
  })
  it('모든 날짜가 실제 달력 날짜다', () => {
    for (const h of SEED_HOLIDAYS) {
      const d = new Date(`${h.date}T00:00:00Z`)
      expect(d.toISOString().slice(0, 10)).toBe(h.date)
    }
  })
  it('종류는 allowed-set 안이고 개원기념일·병원 지정일은 없다', () => {
    for (const h of SEED_HOLIDAYS) {
      expect(HOLIDAY_KINDS).toContain(h.kind)
      expect(['founding_day', 'hospital', 'union_agreed']).not.toContain(h.kind)
    }
  })
  it('종이 근무표로 검증된 2026-10-05 대체공휴일과 10-09 한글날을 포함한다', () => {
    const find = (date: string) => SEED_HOLIDAYS.find((h) => h.date === date)
    expect(find('2026-10-05')?.kind).toBe('substitute')
    expect(find('2026-10-09')?.kind).toBe('public')
  })
  it('토요일과만 겹친 2026 추석에는 대체공휴일이 없다', () => {
    expect(SEED_HOLIDAYS.find((h) => h.date === '2026-09-28')).toBeUndefined()
  })
})
