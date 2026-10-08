import { describe, expect, it } from 'vitest'
import { LEAVE_STATUSES, LEAVE_TYPES } from './allowed-sets'
import {
  OFFICIAL_LEAVE_REASONS,
  leaveAccount,
  leaveDays,
  leaveEnd,
  offTarget,
  requestLabel,
} from './requests'

describe('allowed-set (Build Spec 2-5 domain-entities §2)', () => {
  it('휴가 종류에 연차, 상태에 임시', () => {
    expect(LEAVE_TYPES).toContain('annual')
    expect(LEAVE_STATUSES).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'])
  })
  it('공가 사유 4종', () => {
    expect(Object.keys(OFFICIAL_LEAVE_REASONS)).toEqual(['reserve', 'court', 'vote', 'disaster'])
  })
})

describe('requestLabel (R-REQ-VIEW-2)', () => {
  it('단일·복수·교육', () => {
    expect(requestLabel(['OFF'])).toBe('O')
    expect(requestLabel(['OFF', 'D'])).toBe('O/D')
    expect(requestLabel(['D', 'OFF', 'E'])).toBe('O/D/E') // 표시 순서는 OFF·D·E·N
    expect(requestLabel(['E', 'N'])).toBe('E/N')
    expect(requestLabel([], 'EDU_CONT')).toBe('교')
    expect(requestLabel([], 'EDU_UNION')).toBe('교')
  })
})

describe('휴가 종료일·일수 (R-LEAVE-2·3)', () => {
  it('경조사는 사유 일수로 자동, 검진은 시작일 0.5일', () => {
    expect(leaveEnd('family', '2026-11-19', 'parent_death')).toBe('2026-11-25')
    expect(leaveDays('family', '2026-11-19', '2026-11-25', 'parent_death')).toBe(7)
    expect(leaveEnd('checkup', '2026-11-19', undefined, '2026-11-30')).toBe('2026-11-19')
    expect(leaveDays('checkup', '2026-11-19', '2026-11-19')).toBe(0.5)
  })
  it('그 외는 입력한 종료일, 달력 일수', () => {
    expect(leaveEnd('annual', '2026-11-19', undefined, '2026-11-21')).toBe('2026-11-21')
    expect(leaveDays('annual', '2026-11-19', '2026-11-21')).toBe(3)
    expect(leaveEnd('sick', '2026-11-19')).toBe('2026-11-19')
  })
  it('종료일이 시작일보다 앞이거나 31일 넘게 길면 null', () => {
    expect(leaveEnd('annual', '2026-11-19', undefined, '2026-11-18')).toBeNull()
    expect(leaveEnd('sick', '2026-11-01', undefined, '2026-12-02')).toBeNull()
    expect(leaveEnd('family', '2026-11-19', 'nope')).toBeNull()
  })
})

describe('leaveAccount', () => {
  it('한도가 있는 종류만 원장 계정', () => {
    expect(leaveAccount('annual')).toBe('annual_leave')
    expect(leaveAccount('special')).toBe('special_leave')
    expect(leaveAccount('checkup')).toBe('checkup')
    expect(leaveAccount('sick')).toBe('sick_leave')
    expect(leaveAccount('family')).toBeNull()
    expect(leaveAccount('official')).toBeNull()
  })
})

describe('offTarget (Q3)', () => {
  it('기준 − 누적 + floor(잔여 N / 기준 N)', () => {
    expect(offTarget({ baseline: 9, offCarry: 4, nightBank: 7, sleepingOffPerN: 6 })).toBe(6)
    expect(offTarget({ baseline: 9, offCarry: -2, nightBank: 3, sleepingOffPerN: 6 })).toBe(11)
    expect(offTarget({ baseline: 9, offCarry: 0.5, nightBank: 0, sleepingOffPerN: 6 })).toBe(8.5)
  })
})

describe('개원기념 OFF 휴가 (R-1)', () => {
  it('하루짜리이고 개원오프 잔여를 쓴다', () => {
    expect(leaveEnd('founding', '2026-11-03', undefined, '2026-11-05')).toBe('2026-11-03')
    expect(leaveDays('founding', '2026-11-03', '2026-11-03')).toBe(1)
    expect(leaveAccount('founding')).toBe('founding_off')
  })
})
