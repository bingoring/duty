import { describe, expect, it } from 'vitest'
import { mobileTabs } from './mobile-tabs'

describe('3-12 모바일 아래 탭', () => {
  it('간호사', () =>
    expect(mobileTabs('nurse', false).map((t) => t.href)).toEqual(['/', '/requests', '/adjust', '/more']))
  it('간호사 관리자: 교환 대신 관리', () =>
    expect(mobileTabs('nurse', true).map((t) => t.label)).toEqual(['근무표', '신청', '관리', '더보기']))
  it('의사', () =>
    expect(mobileTabs('doctor', false).map((t) => t.href)).toEqual([
      '/doctor',
      '/doctor/requests',
      '/doctor/adjust',
      '/doctor/more',
    ]))
  it('의사 관리자', () =>
    expect(mobileTabs('doctor', true).map((t) => t.href)).toEqual([
      '/doctor',
      '/doctor/requests',
      '/doctor/manage',
      '/doctor/more',
    ]))
  it('배지: 교환 = swap, 간호사 신청 = proposal', () => {
    expect(mobileTabs('nurse', false).find((t) => t.label === '교환')?.badge).toBe('swap')
    expect(mobileTabs('nurse', false).find((t) => t.label === '신청')?.badge).toBe('proposal')
    expect(mobileTabs('doctor', false).find((t) => t.label === '신청')?.badge).toBeUndefined()
    // 3-12 3차: 간호사 관리자의 관리 탭 = 승인 대기 휴가 수
    expect(mobileTabs('nurse', true).find((t) => t.label === '관리')?.badge).toBe('approval')
    expect(mobileTabs('doctor', true).find((t) => t.label === '관리')?.badge).toBeUndefined()
  })
})
