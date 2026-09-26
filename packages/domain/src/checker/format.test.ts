import { describe, expect, it } from 'vitest'
import { formatViolation } from './format'
import { HARD_RULE_IDS, SOFT_RULE_IDS, violation } from './rules'

const names: Record<string, string> = { a: '정하늘', b: '강도윤', n: '문가을', p: '서예린' }
const ctx = { nameOf: (id: string) => names[id] ?? id, month: 10 }
const f = (...args: Parameters<typeof violation>) => formatViolation(violation(...args), ctx)

describe('formatViolation (business-logic-model §2.6)', () => {
  it('휴식·금지 패턴은 핸드오프 S9 문구 형식', () => {
    expect(
      f('H-REST', ['a'], ['2026-10-12', '2026-10-13'], { from: 'E', to: 'D', restHours: 8, min: 16 }),
    ).toEqual({
      title: '정하늘 · 휴식 8시간',
      detail: '10/12 E → 10/13 D (16시간 미만)',
    })
    expect(f('H-PATTERN', ['a'], ['2026-10-12', '2026-10-13'], { pattern: 'E-D' })).toEqual({
      title: '정하늘 · E-D 금지 패턴',
      detail: '10/12~10/13',
    })
  })

  it('인원 규칙은 날짜(요일)와 듀티', () => {
    expect(f('H-STAFF', ['a'], ['2026-10-13'], { count: 1, min: 2 }, 'E')).toEqual({
      title: '10/13 (화) E 인원 1명',
      detail: '최소 2명',
    })
    expect(f('S-HEAD-FILL', ['b'], ['2026-10-02'], { count: 1, kTass: 0 }, 'D')).toEqual({
      title: '10/2 (금) D 수간호사로 인원 충족',
      detail: '교대 근무자 1명 · K-tass 0명 (최후의 수단)',
    })
  })

  it('N 후 OFF와 주말 통 OFF는 핸드오프 S8 문구 형식', () => {
    expect(
      f('S-OFF-AFTER-N', ['n'], ['2026-10-09', '2026-10-10', '2026-10-11'], { rest: 1, next: 'E' }),
    ).toEqual({
      title: '문가을 · N-OFF-E 1회',
      detail: '10/9~10/11',
    })
    expect(f('S-WEEKEND-PAIR', ['a'], [], { consecutive: true })).toEqual({
      title: '정하늘 · 주말 연휴 OFF 미배정',
      detail: '9월도 미배정 → 11월 최우선',
    })
    expect(f('S-WEEKEND-PAIR', ['a'], [], { consecutive: false }).detail).toBe('11월 우선 대상')
  })

  it('트레이닝은 신규·프리셉터 순, 12월 다음 달은 1월', () => {
    expect(f('H-TRAINING', ['n', 'p'], ['2026-10-05'], { traineeCode: 'D', preceptorCode: 'E' })).toEqual({
      title: '문가을 · 프리셉터와 다른 근무',
      detail: '10/5 문가을 D / 서예린 E',
    })
    const dec = formatViolation(violation('S-WEEKEND-PAIR', ['a'], [], { consecutive: false }), {
      ...ctx,
      month: 12,
    })
    expect(dec.detail).toBe('1월 우선 대상')
  })

  it('신청 문구: 연차·교육 이름과 신청 옵션', () => {
    expect(f('H-SPECIAL-REQ', ['a'], ['2026-10-01'], { special: 'EDU_UNION', code: 'D' }).title).toBe(
      '정하늘 · 노조교육 신청 미반영',
    )
    expect(f('S-REQUEST', ['a'], ['2026-10-01'], { options: 'OFF/D', code: 'E' })).toEqual({
      title: '정하늘 · 신청 불충족',
      detail: '10/1 신청 O/D → 배정 E',
    })
  })

  it('모든 규칙 ID가 빈 문구 없이 표시된다', () => {
    for (const id of [...HARD_RULE_IDS, ...SOFT_RULE_IDS]) {
      const r = f(id, ['a', 'b'], ['2026-10-01', '2026-10-02'], {}, 'D')
      // 규칙별 data 모양은 위 개별 테스트가 본다. 여기서는 모든 ID가 처리되는지만 (switch 완전성은 tsc가 보장)
      expect(r.title.length, id).toBeGreaterThan(0)
    }
  })
})
