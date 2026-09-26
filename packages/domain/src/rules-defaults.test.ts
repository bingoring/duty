import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, RuleSetSchema, normalizePattern, PATTERN_REGEX } from './index'

describe('DEFAULT_RULES', () => {
  // 핸드오프 README S11 「항목/기본값」과 1:1
  // 최대 연속 오프만 15: 10일은 구두 합의, 규정상 한도는 15일 (DECISIONS 2026-09-27 Q2)
  it('핸드오프 S11 기본값과 일치한다', () => {
    const p = DEFAULT_RULES.params
    expect([p.minRestHours, p.maxConsecutiveOff, p.workDaysPerWeek, p.maxNightPerMonth]).toEqual([
      16, 15, 5, 7,
    ])
    expect([p.maxConsecutiveNight, p.offAfterNight, p.minStaffPerShift, p.minKTass]).toEqual([3, 2, 2, 1])
    expect([p.newbieTripleWeeks, p.sleepingOffPerN, p.requestDeadlineDay]).toEqual([3, 6, 15])
    expect([p.negotiationStartDay, p.negotiationEndDay]).toEqual([16, 20])
  })

  it('원문에서 추가한 수치를 포함한다', () => {
    const p = DEFAULT_RULES.params
    expect([p.targetNightPerMonth, p.trainingMonths]).toEqual([6, 3])
    expect([p.nightDedicatedMaxPerMonth, p.nightDedicatedMaxPerMonth31]).toEqual([15, 16])
    expect([p.nightDedicatedMinMonths, p.nightDedicatedMaxMonths]).toEqual([1, 6])
  })

  it('신규 3인 근무: 경력자 2주, 기간 뒤 3인 나이트 3개 (DECISIONS 2026-09-27 Q5)', () => {
    const p = DEFAULT_RULES.params
    expect([p.newbieTripleWeeks, p.experiencedTripleWeeks, p.tripleNightCount]).toEqual([3, 2, 3])
  })

  it('새 수치가 없는 예전 규칙 버전도 기본값으로 채워 읽는다', () => {
    const { experiencedTripleWeeks: _a, tripleNightCount: _b, ...old } = DEFAULT_RULES.params
    const parsed = RuleSetSchema.parse({ ...DEFAULT_RULES, params: old })
    expect(parsed.params.experiencedTripleWeeks).toBe(2)
    expect(parsed.params.tripleNightCount).toBe(3)
  })

  it('토글 기본값: 주말 통 OFF·저연차 방지·반복 겹침 최소화·D/E/N 고르게 켜짐, 야간 전담 꺼짐', () => {
    expect(DEFAULT_RULES.toggles).toEqual({
      weekendPairOffMonthly: true,
      avoidJuniorOnly: true,
      minimizeRepeatPairs: true,
      nightDedicated: false,
      balanceShiftTypes: true,
    })
    expect(DEFAULT_RULES.params.shiftBalanceTolerance).toBe(2)
    expect(DEFAULT_RULES.params.shiftBalanceWindowMonths).toBe(3)
    expect([DEFAULT_RULES.params.eduContPerYear, DEFAULT_RULES.params.eduUnionPerYear]).toEqual([1, 2])
  })

  it('D/E/N 분포 항목이 없는 예전 규칙 버전도 기본값으로 읽는다', () => {
    const { balanceShiftTypes: _t, ...oldToggles } = DEFAULT_RULES.toggles
    const { shiftBalanceTolerance: _p, ...oldParams } = DEFAULT_RULES.params
    const parsed = RuleSetSchema.parse({ ...DEFAULT_RULES, toggles: oldToggles, params: oldParams })
    expect([parsed.toggles.balanceShiftTypes, parsed.params.shiftBalanceTolerance]).toEqual([true, 2])
  })

  it('금지 패턴은 대문자 OFF로 정규화된 4개다', () => {
    expect(DEFAULT_RULES.forbiddenPatterns).toEqual(['E-D', 'N-E', 'N-OFF-D', 'E-S'])
  })

  it('스키마 검증을 통과한다', () => {
    expect(RuleSetSchema.safeParse(DEFAULT_RULES).success).toBe(true)
  })
})

describe('금지 패턴', () => {
  it('소문자 off를 OFF로 정규화한다', () => {
    expect(normalizePattern('N-off-D')).toBe('N-OFF-D')
  })

  it('두 칸 이상 근무 코드 연결만 허용한다', () => {
    expect(PATTERN_REGEX.test('E-D')).toBe(true)
    expect(PATTERN_REGEX.test('N-OFF-D')).toBe(true)
    expect(PATTERN_REGEX.test('D')).toBe(false)
    expect(PATTERN_REGEX.test('E-X')).toBe(false)
    expect(PATTERN_REGEX.test('E--D')).toBe(false)
  })

  it('잘못된 패턴이 있으면 규칙 세트 검증에 실패한다', () => {
    const bad = { ...DEFAULT_RULES, forbiddenPatterns: ['E-D', 'AL-D'] }
    expect(RuleSetSchema.safeParse(bad).success).toBe(false)
  })
})
