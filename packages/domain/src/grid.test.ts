import { describe, expect, it } from 'vitest'
import { buildGrid, patternToken, requiredTailDays } from './grid'
import { DEFAULT_RULES } from './rules-defaults'
import { input, loadPaper, nurse, row, rules } from './test-utils'
import { DomainInputError } from './types'

describe('requiredTailDays (R-SCOPE-4)', () => {
  it('기본값에서는 최대 연속 오프 15일이 결정한다', () => {
    expect(requiredTailDays(DEFAULT_RULES)).toBe(15)
  })

  it('가장 긴 항을 고른다', () => {
    const r = rules({ maxConsecutiveOff: 2, maxConsecutiveNight: 4, offAfterNight: 1 })
    expect(requiredTailDays(r)).toBe(4)
    expect(requiredTailDays({ ...r, forbiddenPatterns: ['N-OFF-OFF-OFF-OFF-D'] })).toBe(5)
    expect(requiredTailDays(rules({ maxConsecutiveOff: 1, maxConsecutiveNight: 1, offAfterNight: 3 }))).toBe(
      4,
    )
  })
})

describe('patternToken', () => {
  it('근무 칸은 코드, 쉬는 칸은 모두 OFF, 칸 없음은 ∅ (Q3)', () => {
    const [d, o, a, l] = row('a', '2026-10-01', 'D SO A L')
    expect([d, o, a, l].map(patternToken)).toEqual(['D', 'OFF', 'OFF', 'OFF'])
    expect(patternToken(undefined)).toBe('∅')
  })
})

describe('buildGrid', () => {
  it('대상 월과 전월 꼬리 칸을 함께 찾는다', () => {
    const g = buildGrid(
      input({
        nurses: [nurse('a')],
        cells: row('a', '2026-10-01', 'D E'),
        prevTail: row('a', '2026-09-30', 'N'),
      }),
    )
    expect(g.cellAt('a', '2026-09-30')?.code).toBe('N')
    expect(g.cellAt('a', '2026-10-02')?.code).toBe('E')
    expect(g.cellAt('a', '2026-10-03')).toBeUndefined()
  })

  it('타임라인은 꼬리 시작일부터 다음 달 앞쪽(같은 길이)까지다', () => {
    const g = buildGrid(input())
    expect(g.tailStart).toBe('2026-09-16')
    expect(g.timeline[0]).toBe('2026-09-16')
    expect(g.headEnd).toBe('2026-11-15')
    expect(g.timeline.at(-1)).toBe('2026-11-15')
    expect(g.monthDates.length).toBe(31)
  })

  it('같은 사람·날짜 칸이 두 개면 입력 오류다', () => {
    const cells = [...row('a', '2026-10-01', 'D'), ...row('a', '2026-10-01', 'E')]
    expect(() => buildGrid(input({ nurses: [nurse('a')], cells }))).toThrow(DomainInputError)
  })

  it('대상 월 밖 칸, 꼬리 범위 밖 칸, 없는 사람의 칸은 입력 오류다', () => {
    const n = [nurse('a')]
    expect(() => buildGrid(input({ nurses: n, cells: row('a', '2026-11-01', 'D') }))).toThrow(
      DomainInputError,
    )
    expect(() => buildGrid(input({ nurses: n, prevTail: row('a', '2026-09-15', 'D') }))).toThrow(
      DomainInputError,
    )
    expect(() => buildGrid(input({ nurses: n, cells: row('b', '2026-10-01', 'D') }))).toThrow(
      DomainInputError,
    )
  })

  it('OFF에 offKind가 없으면 입력 오류다', () => {
    const cells = [{ userId: 'a', date: '2026-10-01', code: 'OFF' as const, checkupHalf: false }]
    expect(() => buildGrid(input({ nurses: [nurse('a')], cells }))).toThrow(DomainInputError)
  })

  it('중복 간호사 id와 잘못된 트레이닝은 입력 오류다', () => {
    expect(() => buildGrid(input({ nurses: [nurse('a'), nurse('a')] }))).toThrow(DomainInputError)
    const t = {
      traineeId: 'a',
      preceptorId: 'b',
      kind: 'new_grad' as const,
      startDate: '2026-10-10',
      endDate: '2027-01-09',
      tripleStaffUntil: '2026-10-09',
      tripleNightsBefore: 0,
    }
    expect(() => buildGrid(input({ nurses: [nurse('a'), nurse('b')], trainings: [t] }))).toThrow(
      DomainInputError,
    )
  })
})

describe('종이 fixture', () => {
  it('11명, 교대 근무자 10명은 31칸, 수간호사는 평일 D만', () => {
    const { input: inp, rows } = loadPaper()
    expect(inp.nurses.length).toBe(11)
    for (const r of rows.filter((r) => r.rotation === 'rotating')) {
      expect(inp.cells.filter((c) => c.userId === r.employeeNo).length).toBe(31)
    }
    const head = inp.cells.filter((c) => c.userId === '00101')
    expect(head.every((c) => c.code === 'D')).toBe(true)
    expect(head.length).toBe(31 - 11) // 기준 OFF 11 = 빨간 날
  })

  it('슬리핑오프는 floor((이월N + 그달N)/6)개로 표시된다', () => {
    const { input: inp } = loadPaper()
    // 문가을: 이월 N 5 + 10월 N 7 = 12 → 2개
    expect(inp.cells.filter((c) => c.userId === '00111' && c.offKind === 'sleeping').length).toBe(2)
  })
})
