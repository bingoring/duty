import { describe, expect, it } from 'vitest'
import { HOLIDAY_SOURCES } from './allowed-sets'
import { DEFAULT_RULES, type RuleSet } from './rules-defaults'
import { RULE_PARAM_LIMITS, RULE_TOGGLE_DEFS, diffRuleSets, validateRuleSet } from './rule-editing'

const withParams = (p: Partial<RuleSet['params']>): RuleSet => ({
  ...DEFAULT_RULES,
  params: { ...DEFAULT_RULES.params, ...p },
})

describe('규칙 편집 항목 (Build Spec 2-4 domain-entities §4)', () => {
  it('협의 종료일을 뺀 모든 수치 키를 한 번씩 다룬다', () => {
    const keys = RULE_PARAM_LIMITS.map((l) => l.key).sort()
    const all = Object.keys(DEFAULT_RULES.params)
      .filter((k) => k !== 'negotiationEndDay')
      .sort()
    expect(keys).toEqual(all)
  })

  it('토글 5개(D·E·N 고르게 포함)', () => {
    expect(RULE_TOGGLE_DEFS.map((t) => t.key)).toEqual([
      'weekendPairOffMonthly',
      'avoidJuniorOnly',
      'minimizeRepeatPairs',
      'nightDedicated',
      'balanceShiftTypes',
    ])
  })

  it('공휴일 출처에 공공데이터 api가 있다', () => {
    expect(HOLIDAY_SOURCES).toContain('api')
  })
})

describe('validateRuleSet (R-RULE-EDIT-1·2)', () => {
  it('기본값은 통과한다', () => {
    expect(validateRuleSet(DEFAULT_RULES)).toEqual([])
  })

  it('범위를 벗어나면 라벨·범위·단위로 알린다', () => {
    expect(validateRuleSet(withParams({ minRestHours: 7 }))).toEqual([
      { key: 'minRestHours', message: '근무 간 최소 휴식은 8~24시간 사이여야 합니다.' },
    ])
    expect(validateRuleSet(withParams({ minStaffPerShift: 0 }))[0]?.key).toBe('minStaffPerShift')
  })

  it('상호 제약: 목표 ≤ 상한, K-tass ≤ 최소 인원, 마감 < 협의 시작 ≤ 끝, 전담 값 순서', () => {
    const keys = (p: Partial<RuleSet['params']>) => validateRuleSet(withParams(p)).map((e) => e.key)
    expect(keys({ targetNightPerMonth: 8 })).toEqual(['targetNightPerMonth'])
    expect(keys({ minKTass: 3 })).toEqual(['minKTass'])
    expect(keys({ negotiationStartDay: 15 })).toEqual(['negotiationStartDay'])
    expect(keys({ negotiationEndDay: 16, negotiationStartDay: 17 })).toEqual(['negotiationStartDay'])
    expect(keys({ nightDedicatedMaxPerMonth31: 14 })).toEqual(['nightDedicatedMaxPerMonth31'])
    expect(keys({ nightDedicatedMaxMonths: 0 })).toContain('nightDedicatedMaxMonths')
  })

  it('정수가 아니면 거부', () => {
    expect(validateRuleSet(withParams({ maxNightPerMonth: 6.5 }))[0]?.message).toContain('정수')
  })

  it('금지 패턴 문법', () => {
    const bad = { ...DEFAULT_RULES, forbiddenPatterns: ['E-D', 'E-X'] }
    expect(validateRuleSet(bad)).toEqual([
      { key: 'forbiddenPatterns', message: "D·E·N·S·OFF를 '-'로 두 개 이상 이어 주세요. 예: E-D" },
    ])
  })
})

describe('diffRuleSets (R-RULE-SAVE-1)', () => {
  it('바뀐 수치·토글·금지 패턴만', () => {
    const after: RuleSet = {
      params: { ...DEFAULT_RULES.params, maxConsecutiveOff: 16 },
      toggles: { ...DEFAULT_RULES.toggles, nightDedicated: true },
      forbiddenPatterns: [...DEFAULT_RULES.forbiddenPatterns, 'N-S'],
    }
    expect(diffRuleSets(DEFAULT_RULES, after)).toEqual([
      { key: 'maxConsecutiveOff', before: 15, after: 16 },
      { key: 'nightDedicated', before: false, after: true },
      { key: 'forbiddenPatterns', before: 'E-D, N-E, N-OFF-D, E-S', after: 'E-D, N-E, N-OFF-D, E-S, N-S' },
    ])
  })

  it('금지 패턴 순서만 다르면 변경이 아니다', () => {
    const after = { ...DEFAULT_RULES, forbiddenPatterns: [...DEFAULT_RULES.forbiddenPatterns].reverse() }
    expect(diffRuleSets(DEFAULT_RULES, after)).toEqual([])
  })
})
