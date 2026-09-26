import { describe, expect, it } from 'vitest'
import { buildGrid } from './grid'
import { DEFAULT_RULES } from './rules-defaults'
import { createStaffing, defaultTripleStaffUntil } from './staffing'
import { input, nurse, row } from './test-utils'
import type { ScheduleInput, TrainingSpan } from './types'

const staffing = (inp: ScheduleInput) => createStaffing(inp, buildGrid(inp))

describe('countStaff (R-STAFF-1~4)', () => {
  it('그날 그 듀티의 교대 근무자를 센다. S는 어느 듀티에도 세지 않는다', () => {
    const inp = input({
      nurses: [nurse('a'), nurse('b', { kTass: false }), nurse('c')],
      cells: [...row('a', '2026-10-01', 'D'), ...row('b', '2026-10-01', 'D'), ...row('c', '2026-10-01', 'S')],
    })
    expect(staffing(inp).count('2026-10-01', 'D')).toMatchObject({ count: 2, kTass: 1, fallback: 0 })
    expect(staffing(inp).count('2026-10-01', 'E').count).toBe(0)
  })

  it('재직일이 아니면 세지 않는다', () => {
    const inp = input({
      nurses: [nurse('a', { employedUntil: '2026-09-30' }), nurse('b')],
      cells: [...row('b', '2026-10-01', 'D')],
    })
    expect(staffing(inp).count('2026-10-01', 'D').count).toBe(1)
  })

  it('수간호사(fixed_weekday)는 보충 인원으로만 센다', () => {
    const inp = input({
      nurses: [nurse('h', { rotation: 'fixed_weekday' }), nurse('a', { kTass: false })],
      cells: [...row('h', '2026-10-02', 'D'), ...row('a', '2026-10-02', 'D')],
    })
    expect(staffing(inp).count('2026-10-02', 'D')).toMatchObject({
      count: 1,
      kTass: 0,
      fallback: 1,
      fallbackKTass: 1,
    })
  })

  it('저연차만: 보충 포함 전원이 junior이고 1명 이상', () => {
    const j = { seniorityTier: 'junior' as const }
    const inp = input({
      nurses: [nurse('a', j), nurse('b', j), nurse('h', { rotation: 'fixed_weekday' })],
      cells: [
        ...row('a', '2026-10-01', 'D E'),
        ...row('b', '2026-10-01', 'D E'),
        ...row('h', '2026-10-01', 'D'),
      ],
    })
    const s = staffing(inp)
    expect(s.count('2026-10-01', 'D').allJunior).toBe(false)
    expect(s.count('2026-10-02', 'E').allJunior).toBe(true)
    expect(s.count('2026-10-02', 'N').allJunior).toBe(false)
  })
})

describe('신규 3인 근무 (R-STAFF-1·2·5, Q5)', () => {
  const t = (over: Partial<TrainingSpan> = {}): TrainingSpan => ({
    traineeId: 'n',
    preceptorId: 'p',
    kind: 'new_grad',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    tripleStaffUntil: '2026-10-21',
    tripleNightsBefore: 0,
    ...over,
  })
  const base = (spec: string, training: TrainingSpan, kTass = true) =>
    input({
      nurses: [nurse('n', { kTass }), nurse('p')],
      trainings: [training],
      cells: row('n', '2026-10-01', spec),
    })

  it('3인 배정 기간에는 신규를 인원에 세지 않는다', () => {
    const s = staffing(base('D', t()))
    expect(s.count('2026-10-01', 'D').count).toBe(0)
  })

  it('기간 뒤에는 인원에 세지만 트레이닝 중에는 K-tass로 세지 않는다', () => {
    const s = staffing(base('D', t({ tripleStaffUntil: '2026-09-30', startDate: '2026-09-10' })))
    expect(s.count('2026-10-01', 'D')).toMatchObject({ count: 1, kTass: 0 })
  })

  it('기간 뒤 신규가 처음 서는 N 3개는 떨어져 있어도 3인이다. 4번째부터 센다', () => {
    // 10/22부터: N O O N O O N N
    const spec = Array(21).fill('D').join(' ') + ' N O O N O O N N'
    const s = staffing(base(spec, t()))
    expect(s.count('2026-10-22', 'N').count).toBe(0)
    expect(s.count('2026-10-25', 'N').count).toBe(0)
    expect(s.count('2026-10-28', 'N').count).toBe(0)
    expect(s.count('2026-10-29', 'N').count).toBe(1)
  })

  it('3인 배정 기간 안의 N은 3개에 들어가지 않는다', () => {
    // 10/1 N(기간 안), 10/22·23·24·25 N
    const spec = 'N ' + Array(20).fill('O').join(' ') + ' N N N N'
    const s = staffing(base(spec, t()))
    expect(s.count('2026-10-01', 'N').count).toBe(0) // 기간 안이라 어차피 3인
    expect(s.count('2026-10-24', 'N').count).toBe(0)
    expect(s.count('2026-10-25', 'N').count).toBe(1)
  })

  it('전월까지 선 3인 나이트 수를 이어서 센다', () => {
    const tr = t({ startDate: '2026-08-15', tripleStaffUntil: '2026-09-04', tripleNightsBefore: 2 })
    const s = staffing(base('N N', tr))
    expect(s.count('2026-10-01', 'N').count).toBe(0)
    expect(s.count('2026-10-02', 'N').count).toBe(1)
  })

  it('트레이닝이 끝난 뒤의 N은 3인이 아니다', () => {
    const tr = t({ startDate: '2026-07-01', tripleStaffUntil: '2026-07-21', endDate: '2026-09-30' })
    const s = staffing(base('N', tr))
    expect(s.count('2026-10-01', 'N')).toMatchObject({ count: 1, kTass: 1 })
  })
})

describe('defaultTripleStaffUntil (R-STAFF-6)', () => {
  it('완전 신규 3주, 경력자 2주 (시작일 포함)', () => {
    expect(defaultTripleStaffUntil('2026-10-01', 'new_grad', DEFAULT_RULES.params)).toBe('2026-10-21')
    expect(defaultTripleStaffUntil('2026-10-01', 'experienced', DEFAULT_RULES.params)).toBe('2026-10-14')
  })
})
