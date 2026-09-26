import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, MAIN_NAV, isActive } from './nav-items'

describe('사이드바 메뉴', () => {
  it('핸드오프 순서: 근무표·근무 신청·휴가 신청·동료 현황·규칙 안내', () => {
    expect(MAIN_NAV.map((n) => n.label)).toEqual([
      '근무표',
      '근무 신청',
      '휴가 신청',
      '동료 현황',
      '규칙 안내',
    ])
  })
  it('관리자 메뉴 4개', () => {
    expect(ADMIN_NAV.map((n) => n.label)).toEqual(['듀티 생성', '근무 조정', '간호사 관리', '규칙 설정'])
  })
  it('근무표(/)는 정확히 일치할 때만 활성', () => {
    expect(isActive('/', '/')).toBe(true)
    expect(isActive('/requests', '/')).toBe(false)
  })
  it('하위 경로도 활성으로 본다', () => {
    expect(isActive('/admin/staff/new', '/admin/staff')).toBe(true)
    expect(isActive('/admin/staffing', '/admin/staff')).toBe(false)
  })
})
