import { describe, expect, it } from 'vitest'
import { checkSchedule, formatViolation, type RuleId } from './index'
import { loadPaper } from './test-utils'

// Build Spec 2-2 §5 종이 fixture 통합 테스트 · business-rules §6
describe('종이 근무표 2026-10 검사', () => {
  const { input: paper, names } = loadPaper()
  // 3-9의 최대 인원(기본 2)·누적 OFF 범위(기본 ±3)는 종이 근무표 뒤에 생긴 규칙이라 여기서는 끈다
  // (종이 10월은 3인 듀티 19번, 범위 밖 1명 — 아래 따로 확인)
  const input = {
    ...paper,
    rules: {
      ...paper.rules,
      params: { ...paper.rules.params, maxStaffPerShift: 10, offCarryMin: -31, offCarryMax: 31 },
    },
  }
  const r = checkSchedule(input)
  const count = (id: RuleId) => r.softWarnings.filter((v) => v.ruleId === id).length
  const titles = (id: RuleId) =>
    r.softWarnings
      .filter((v) => v.ruleId === id)
      .map((v) => formatViolation(v, { nameOf: (x) => names.get(x) ?? x, month: 10 }).title)

  it('하드 위반이 없다', () => {
    expect(r.hardViolations).toEqual([])
  })

  it('3-9 기본 규칙이면 3인 듀티 19번은 최대 인원 권고, 누적 OFF 범위 밖 1명은 필수 위반', () => {
    const r = checkSchedule(paper)
    expect(r.softWarnings.filter((v) => v.ruleId === 'H-STAFF-MAX')).toHaveLength(19)
    expect(r.hardViolations.filter((v) => v.ruleId === 'H-OFF-CARRY')).toHaveLength(1)
  })

  it('10/2 D는 수간호사 보충(최후의 수단)이다', () => {
    expect(titles('S-HEAD-FILL')).toEqual(['10/2 (금) D 수간호사로 인원 충족'])
  })

  // 3-10 12: 나이트 7개 2명(월 나이트 목표 6 초과) 경고는 규칙을 없애 더 나오지 않는다
  it('N-OFF-E 2회', () => {
    expect(titles('S-OFF-AFTER-N')).toEqual(['배지현 · N-OFF-E 1회', '문가을 · N-OFF-E 1회'])
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
