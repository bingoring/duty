import { describe, expect, it } from 'vitest'
import { ktasStatus, ktasValidOn, ktasValidUntil } from './ktas'

describe('KTAS 자격 유효기간 (3-5)', () => {
  it('수료일부터 3년, 마지막 날은 하루 전', () => {
    expect(ktasValidUntil('2024-03-01')).toBe('2027-02-28')
    expect(ktasValidUntil('2024-02-29')).toBe('2027-02-27')
    expect(ktasValidUntil('2023-10-17')).toBe('2026-10-16')
  })
  it('만료 6개월 전부터 갱신 필요, 만료 뒤 만료', () => {
    expect(ktasStatus(true, '2024-06-01', '2026-11-29')).toEqual({ kind: 'valid', until: '2027-05-31' })
    expect(ktasStatus(true, '2024-06-01', '2026-11-30').kind).toBe('renew')
    expect(ktasStatus(true, '2024-06-01', '2027-05-31').kind).toBe('renew')
    expect(ktasStatus(true, '2024-06-01', '2027-06-01').kind).toBe('expired')
    expect(ktasStatus(true, null, '2026-10-17')).toEqual({ kind: 'missing' })
    expect(ktasStatus(false, '2024-06-01', '2026-10-17')).toEqual({ kind: 'none' })
  })
  it('만료 뒤에는 KTAS 인원으로 세지 않는다, 수료일을 모르면 센다', () => {
    expect(ktasValidOn({ kTass: true, kTassUntil: '2026-11-15' }, '2026-11-15')).toBe(true)
    expect(ktasValidOn({ kTass: true, kTassUntil: '2026-11-15' }, '2026-11-16')).toBe(false)
    expect(ktasValidOn({ kTass: true }, '2030-01-01')).toBe(true)
    expect(ktasValidOn({ kTass: false, kTassUntil: null }, '2026-01-01')).toBe(false)
  })
})
