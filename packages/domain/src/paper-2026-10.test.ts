import { describe, expect, it } from 'vitest'
import { checkSchedule, formatViolation, type RuleId } from './index'
import { loadPaper } from './test-utils'

// Build Spec 2-2 §5 종이 fixture 통합 테스트 · business-rules §6
describe('종이 근무표 2026-10 검사', () => {
  const { input, names } = loadPaper()
  const r = checkSchedule(input)
  const count = (id: RuleId) => r.softWarnings.filter((v) => v.ruleId === id).length
  const titles = (id: RuleId) =>
    r.softWarnings
      .filter((v) => v.ruleId === id)
      .map((v) => formatViolation(v, { nameOf: (x) => names.get(x) ?? x, month: 10 }).title)

  it('하드 위반이 없다', () => {
    expect(r.hardViolations).toEqual([])
  })

  it('10/2 D는 수간호사 보충(최후의 수단)이다', () => {
    expect(titles('S-HEAD-FILL')).toEqual(['10/2 (금) D 수간호사로 인원 충족'])
  })

  it('N-OFF-E 2회, 나이트 7개 2명', () => {
    expect(titles('S-OFF-AFTER-N')).toEqual(['배지현 · N-OFF-E 1회', '문가을 · N-OFF-E 1회'])
    expect(titles('S-NIGHT-TARGET').sort()).toEqual(['문가을 · 나이트 7개', '홍다은 · 나이트 7개'])
  })

  // 10/31(토) OFF인 오민지·강도윤·홍다은은 11월 칸이 없어 달성 예정으로 본다
  it('주말 통 OFF 미배정 2명', () => {
    expect(
      titles('S-WEEKEND-PAIR')
        .map((t) => t.split(' · ')[0])
        .sort(),
    ).toEqual(['문가을', '배지현'])
  })

  it('반복 겹침: 경고 기준 5회, 5쌍', () => {
    const pairs = r.softWarnings.filter((v) => v.ruleId === 'S-REPEAT-PAIR')
    expect(pairs.map((v) => v.data.threshold)).toEqual(Array(5).fill(5))
    expect(pairs.map((v) => v.data.count).sort()).toEqual([5, 5, 6, 7, 7])
  })

  it('D·E·N 분포: 강도윤(D 4 · E 7 · N 6)만 차이 3', () => {
    expect(titles('S-SHIFT-BALANCE')).toEqual(['강도윤 · D 4 · E 7 · N 6'])
  })

  it('신청이 없으므로 신청 경고도 없다', () => {
    expect(count('S-REQUEST')).toBe(0)
  })
})
