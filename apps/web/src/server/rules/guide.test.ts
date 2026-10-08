import { DEFAULT_RULES, type RuleSet } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import { buildRulesGuide } from './guide'

// Build Spec 2-10 business-rules §2·§3 (R-GUIDE-*)
const item = (rules: RuleSet, text: RegExp) =>
  buildRulesGuide(rules, 3)
    .sections.flatMap((s) => s.items)
    .find((i) => text.test(i.text))

const withParams = (p: Partial<RuleSet['params']>): RuleSet => ({
  ...DEFAULT_RULES,
  params: { ...DEFAULT_RULES.params, ...p },
})
const withToggles = (t: Partial<RuleSet['toggles']>): RuleSet => ({
  ...DEFAULT_RULES,
  toggles: { ...DEFAULT_RULES.toggles, ...t },
})

describe('buildRulesGuide', () => {
  it('목차 7개 = 섹션 7개, 버전 표시 (R-GUIDE-1·2)', () => {
    const g = buildRulesGuide(DEFAULT_RULES, 3)
    expect(g.sections.map((s) => s.title)).toEqual([
      '근무 형태 · 순환',
      '휴식 · 금지 패턴',
      '유급휴일 · 특별휴가',
      '경조 · 병가 · 공가',
      '오프 정산 · 슬리핑오프',
      '응급실 야간 운영',
      '응급실 지침',
    ])
    expect(g.version).toBe('규칙 버전 v3')
    expect(buildRulesGuide(DEFAULT_RULES, null).version).toBe('기본 규칙')
    expect(g.sections.every((s) => s.items.length > 0)).toBe(true)
  })

  it('근무 카드는 SHIFT_TIMES에서 (R-GUIDE-5)', () => {
    expect(buildRulesGuide(DEFAULT_RULES, 1).shifts).toEqual([
      { code: 'D', time: '07:00 – 15:30', desc: 'Day' },
      { code: 'E', time: '14:30 – 23:00', desc: 'Evening' },
      { code: 'N', time: '22:30 – 익일 07:30', desc: '휴게 1시간 포함' },
      { code: 'S', time: '09:00 – 18:00', desc: 'K-tass 교육' },
    ])
  })

  it('수치·금지 패턴은 현재 규칙 값에서 렌더링한다 (하드코딩 금지)', () => {
    expect(item(DEFAULT_RULES, /휴식을 보장/)).toMatchObject({
      text: '서로 다른 근무 사이에는 최소 16시간의 휴식을 보장합니다.',
      tag: 'auto',
    })
    expect(item(withParams({ minRestHours: 12 }), /휴식을 보장/)!.text).toContain('최소 12시간')
    expect(item(DEFAULT_RULES, /패턴은 편성하지/)!.text).toBe(
      'E-D, N-E, N-off-D, E-S 패턴은 편성하지 않습니다.',
    )
    expect(item(withParams({ maxNightPerMonth: 8, targetNightPerMonth: 5 }), /나이트는 월/)!.text).toBe(
      '나이트는 월 5개 이하를 목표로, 최대 8개로 제한합니다.',
    )
  })

  it('강제하지 않는 지침은 "안내", 켜고 끄는 규칙이 꺼지면 "사용 안 함" (R-GUIDE-3)', () => {
    expect(item(DEFAULT_RULES, /순환/)!.tag).toBe('info')
    expect(item(DEFAULT_RULES, /주말 이틀/)!.tag).toBe('rec')
    expect(item(withToggles({ weekendPairOffMonthly: false }), /주말 이틀/)!.tag).toBe('off')
  })

  it('야간 전담: 꺼지면 응급실은 없음, 켜지면 상한과 기간', () => {
    expect(item(DEFAULT_RULES, /야간 전담/)).toMatchObject({
      text: '응급실은 야간 전담이 없습니다.',
      tag: 'off',
    })
    expect(item(withToggles({ nightDedicated: true }), /야간 전담/)).toMatchObject({
      text: '야간 전담은 월 15일(31일 달 16일) 이내, 1~6개월 연속으로 운영합니다.',
      tag: 'auto',
    })
  })

  it('경조휴가는 사유·일수 표를 함께 준다', () => {
    const fam = item(DEFAULT_RULES, /경조휴가/)!
    expect(fam.table).toHaveLength(11)
    expect(fam.table![0]).toEqual(['본인 결혼', '6일'])
  })
})
