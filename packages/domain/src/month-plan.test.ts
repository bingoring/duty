import { describe, expect, it } from 'vitest'
import { canNurseEditRequests, defaultPlanDates, nextPlanStatus, PlanTransitionError } from './month-plan'
import { DEFAULT_RULES } from './rules-defaults'
import { rules } from './test-utils'

describe('defaultPlanDates (R-PLAN-1)', () => {
  it('전월 15일 마감, 16~20일 협의', () => {
    expect(defaultPlanDates(2026, 11, DEFAULT_RULES.params)).toEqual({
      requestDeadline: '2026-10-15',
      negotiationStart: '2026-10-16',
      negotiationEnd: '2026-10-20',
    })
    expect(defaultPlanDates(2027, 1, DEFAULT_RULES.params).requestDeadline).toBe('2026-12-15')
  })

  it('전월 말일을 넘으면 말일로 맞춘다', () => {
    const r = rules({ negotiationStartDay: 29, negotiationEndDay: 31 }).params
    expect(defaultPlanDates(2026, 3, r)).toMatchObject({
      negotiationStart: '2026-02-28',
      negotiationEnd: '2026-02-28',
    })
  })
})

describe('nextPlanStatus (1-2 §3)', () => {
  it.each([
    ['REQUESTING', 'CLOSE_REQUESTS', 'REQUEST_CLOSED'],
    ['REQUEST_CLOSED', 'GENERATE', 'DRAFTING'],
    ['DRAFTING', 'GENERATE', 'DRAFTING'],
    ['DRAFTING', 'CONFIRM', 'CONFIRMED'],
    ['CONFIRMED', 'ADJUST', 'CONFIRMED'],
    ['CONFIRMED', 'CLOSE', 'CLOSED'],
    ['CLOSED', 'REOPEN', 'CONFIRMED'],
  ] as const)('%s + %s → %s', (from, event, to) => {
    expect(nextPlanStatus(from, event, { today: '2026-11-01', year: 2026, month: 10 })).toBe(to)
  })

  it.each([
    ['REQUESTING', 'GENERATE'],
    ['REQUESTING', 'CONFIRM'],
    ['DRAFTING', 'CLOSE'],
    ['CONFIRMED', 'GENERATE'],
    ['CLOSED', 'ADJUST'],
  ] as const)('%s + %s는 거부', (from, event) => {
    expect(() => nextPlanStatus(from, event, { today: '2026-11-01', year: 2026, month: 10 })).toThrow(
      PlanTransitionError,
    )
  })

  it('월 마감은 대상 월이 끝난 뒤에만', () => {
    expect(() =>
      nextPlanStatus('CONFIRMED', 'CLOSE', { today: '2026-10-31', year: 2026, month: 10 }),
    ).toThrow(PlanTransitionError)
  })
})

describe('canNurseEditRequests', () => {
  it('신청 중이고 마감일 당일까지', () => {
    expect(canNurseEditRequests('REQUESTING', '2026-10-15', '2026-10-15')).toBe(true)
    expect(canNurseEditRequests('REQUESTING', '2026-10-15', '2026-10-16')).toBe(false)
    expect(canNurseEditRequests('REQUEST_CLOSED', '2026-10-15', '2026-10-10')).toBe(false)
  })
})
