import { describe, expect, it } from 'vitest'
import { input, nurse, req, row, rules } from '../test-utils'
import type { GridCell, ScheduleInput, TrainingSpan } from '../types'
import { checkSchedule } from './index'
import type { RuleId, Violation } from './rules'

const OCT1 = '2026-10-01'

function all(inp: ScheduleInput): Violation[] {
  const r = checkSchedule(inp)
  return [...r.hardViolations, ...r.softWarnings]
}

function only(inp: ScheduleInput, id: RuleId): Violation[] {
  return all(inp).filter((v) => v.ruleId === id)
}

// 한 사람의 칸만 두고 그 사람 규칙을 본다
function solo(spec: string, over: Partial<ScheduleInput> = {}, start = OCT1): ScheduleInput {
  return input({ nurses: [nurse('a')], cells: row('a', start, spec), ...over })
}

describe('H-CELL', () => {
  it('재직일에 칸이 없으면 날짜를 모아 한 건으로 보고한다', () => {
    const v = only(solo('D E'), 'H-CELL')
    expect(v).toHaveLength(1)
    expect(v[0]!.dates).toHaveLength(29)
    expect(v[0]!.data).toEqual({ kind: 'missing' })
  })

  it('재직일이 아닌 날의 칸도 위반이다', () => {
    const inp = input({ nurses: [nurse('a', { employedUntil: OCT1 })], cells: row('a', OCT1, 'D E') })
    expect(only(inp, 'H-CELL')).toMatchObject([{ dates: ['2026-10-02'], data: { kind: 'outside' } }])
  })

  it('수간호사는 검사하지 않는다 (R-SCOPE-1)', () => {
    const inp = input({ nurses: [nurse('h', { rotation: 'fixed_weekday' })], cells: row('h', OCT1, 'D') })
    expect(only(inp, 'H-CELL')).toEqual([])
  })
})

describe('H-PATTERN', () => {
  it('E-D를 잡는다', () => {
    expect(only(solo('E D'), 'H-PATTERN')).toMatchObject([
      { userIds: ['a'], dates: ['2026-10-01', '2026-10-02'], data: { pattern: 'E-D' } },
    ])
  })

  it('전월 꼬리와 이어진 패턴도 잡는다', () => {
    const inp = solo('D', { prevTail: row('a', '2026-09-30', 'E') })
    expect(only(inp, 'H-PATTERN')).toMatchObject([{ dates: ['2026-09-30', '2026-10-01'] }])
  })

  it('꼬리만으로 이뤄진 패턴은 전월의 몫이다 (R-SCOPE-3)', () => {
    const inp = solo('O', { prevTail: row('a', '2026-09-29', 'E D') })
    expect(only(inp, 'H-PATTERN')).toEqual([])
  })

  it('N-연차-D, N-병가-D도 N-OFF-D다 (Q3)', () => {
    expect(only(solo('N A D'), 'H-PATTERN').map((v) => v.data.pattern)).toEqual(['N-OFF-D'])
    expect(only(solo('N L D'), 'H-PATTERN').map((v) => v.data.pattern)).toEqual(['N-OFF-D'])
  })

  it('N-OFF-OFF-D와 칸 없음(∅)은 패턴이 아니다', () => {
    expect(only(solo('N O O D'), 'H-PATTERN')).toEqual([])
    const inp = input({ nurses: [nurse('a', { employedUntil: OCT1 })], cells: row('a', OCT1, 'E') })
    expect(only(inp, 'H-PATTERN')).toEqual([])
  })
})

describe('H-REST', () => {
  it('서로 다른 근무 사이 휴식이 16시간 미만이면 위반이다', () => {
    expect(only(solo('E D'), 'H-REST')).toMatchObject([
      { dates: ['2026-10-01', '2026-10-02'], data: { from: 'E', to: 'D', restHours: 8, min: 16 } },
    ])
    expect(only(solo('S D'), 'H-REST').map((v) => v.data.restHours)).toEqual([13])
    expect(only(solo('N S'), 'H-REST').map((v) => v.data.restHours)).toEqual([1.5])
  })

  it('같은 근무 연속과 정방향 교대는 대상이 아니다', () => {
    expect(only(solo('D D E E N N'), 'H-REST')).toEqual([])
    expect(only(solo('D S E O N'), 'H-REST')).toEqual([])
  })
})

describe('나이트 개수·연속', () => {
  const nights = (n: number) => Array(n).fill('N O O').join(' ')

  it('월 N 8개는 하드(상한 7), 7개는 소프트(목표 6)', () => {
    expect(only(solo(nights(8)), 'H-NIGHT-MAX')).toMatchObject([{ data: { count: 8, max: 7 } }])
    expect(only(solo(nights(7)), 'H-NIGHT-MAX')).toEqual([])
    expect(only(solo(nights(7)), 'S-NIGHT-TARGET')).toMatchObject([{ data: { count: 7, target: 6 } }])
    expect(only(solo(nights(8)), 'S-NIGHT-TARGET')).toEqual([])
  })

  it('야간 전담(토글 + 기간)이면 31일 달 상한은 16', () => {
    const inp = solo(nights(8), {
      nurses: [nurse('a', { nightDedicated: { from: '2026-09-01', to: '2026-10-10' } })],
      rules: rules({}, { nightDedicated: true }),
    })
    expect(only(inp, 'H-NIGHT-MAX')).toEqual([])
    const off = solo(nights(8), {
      nurses: [nurse('a', { nightDedicated: { from: '2026-09-01', to: '2026-10-10' } })],
    })
    expect(only(off, 'H-NIGHT-MAX')).toHaveLength(1)
  })

  it('연속 N 4일은 위반, 전월 꼬리와 이어진 것도 센다', () => {
    expect(only(solo('N N N O'), 'H-NIGHT-CONSEC')).toEqual([])
    expect(only(solo('N N N N'), 'H-NIGHT-CONSEC')).toMatchObject([{ data: { count: 4, max: 3 } }])
    const inp = solo('N N O', { prevTail: row('a', '2026-09-29', 'N N') })
    expect(only(inp, 'H-NIGHT-CONSEC')).toMatchObject([
      { dates: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'], data: { count: 4 } },
    ])
  })
})

describe('H-OFF-CONSEC (기본 15일, Q2)', () => {
  const offs = (n: number) => Array(n).fill('O').join(' ')

  it('16일 연속 오프는 위반, 15일은 통과', () => {
    expect(only(solo(`D ${offs(16)} D`), 'H-OFF-CONSEC')).toMatchObject([{ data: { count: 16, max: 15 } }])
    expect(only(solo(`D ${offs(15)} D`), 'H-OFF-CONSEC')).toEqual([])
  })

  it('연차는 세고, 휴가(LEAVE)는 세지 않되 연속을 끊지 않는다', () => {
    expect(only(solo(`D ${offs(8)} A A A A A A A A D`), 'H-OFF-CONSEC')).toHaveLength(1)
    expect(only(solo(`D ${offs(7)} L L L L L ${offs(8)} D`), 'H-OFF-CONSEC')).toEqual([])
    expect(only(solo(`D ${offs(8)} L L L L L ${offs(8)} D`), 'H-OFF-CONSEC')).toMatchObject([
      { data: { count: 16 } },
    ])
  })
})

describe('인원·K-tass·수간호사 보충', () => {
  const day = (
    cells: GridCell[],
    nurses = [nurse('a'), nurse('b', { kTass: false }), nurse('h', { rotation: 'fixed_weekday' as const })],
  ) => input({ nurses, cells })
  const onD = (ids: string[]) => ids.flatMap((id) => row(id, OCT1, 'D'))
  const dOnly = (vs: Violation[]) => vs.filter((v) => v.dates[0] === OCT1 && v.shift === 'D')

  it('최소 인원 2명, K-tass 1명', () => {
    expect(dOnly(only(day(onD(['a', 'b'])), 'H-STAFF'))).toEqual([])
    expect(dOnly(only(day(onD(['b'])), 'H-STAFF'))).toMatchObject([{ data: { count: 1, min: 2 } }])
    expect(dOnly(only(day(onD(['b'])), 'H-KTASS'))).toMatchObject([{ data: { count: 0, min: 1 } }])
  })

  it('교대 근무자만으로 모자라면 수간호사 D로 채우고 소프트 경고 (Q1)', () => {
    const inp = day(onD(['b', 'h']))
    expect(dOnly(only(inp, 'H-STAFF'))).toEqual([])
    expect(dOnly(only(inp, 'H-KTASS'))).toEqual([])
    expect(dOnly(only(inp, 'S-HEAD-FILL'))).toMatchObject([{ data: { count: 1, kTass: 0 } }])
  })

  it('교대 근무자만으로 충분하면 수간호사가 있어도 경고하지 않는다', () => {
    expect(dOnly(only(day(onD(['a', 'b', 'h'])), 'S-HEAD-FILL'))).toEqual([])
  })

  it('수간호사를 더해도 모자라면 하드', () => {
    const inp = day(onD(['h']))
    expect(dOnly(only(inp, 'H-STAFF'))).toHaveLength(1)
    expect(dOnly(only(inp, 'S-HEAD-FILL'))).toEqual([])
  })

  it('저연차만 배정 (토글)', () => {
    const j = { seniorityTier: 'junior' as const, kTass: true }
    const nurses = [nurse('a', j), nurse('b', j)]
    expect(dOnly(only(day(onD(['a', 'b']), nurses), 'S-JUNIOR-ONLY'))).toHaveLength(1)
    const off = input({ nurses, cells: onD(['a', 'b']), rules: rules({}, { avoidJuniorOnly: false }) })
    expect(dOnly(only(off, 'S-JUNIOR-ONLY'))).toEqual([])
  })
})

describe('H-TRAINING (Q4)', () => {
  const t: TrainingSpan = {
    traineeId: 'n',
    preceptorId: 'p',
    kind: 'new_grad',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    tripleStaffUntil: '2026-10-02',
    tripleNightsBefore: 0,
  }
  const pair = (n: string, p: string) =>
    input({
      nurses: [nurse('n'), nurse('p')],
      trainings: [t],
      cells: [...row('n', OCT1, n), ...row('p', OCT1, p)],
    })

  it('같은 근무 코드이거나 둘 다 쉬면 통과', () => {
    expect(only(pair('D O E', 'D O E'), 'H-TRAINING')).toEqual([])
    expect(only(pair('D SO E', 'D A E'), 'H-TRAINING')).toEqual([])
  })

  it('다른 근무이거나 한쪽만 근무하면 위반', () => {
    expect(only(pair('D O E', 'E O E'), 'H-TRAINING')).toMatchObject([
      { userIds: ['n', 'p'], dates: [OCT1], data: { traineeCode: 'D', preceptorCode: 'E' } },
    ])
    expect(only(pair('D O E', 'D D E'), 'H-TRAINING')).toHaveLength(1)
  })

  it('둘 중 한 명이 연차·휴가인 날은 예외, 트레이닝 기간 밖은 검사하지 않는다', () => {
    expect(only(pair('D O E N', 'A O L D'), 'H-TRAINING')).toEqual([])
  })
})

describe('신청', () => {
  it('연차·교육 신청 미반영은 하드', () => {
    const inp = solo('D O', { requests: [req('a', OCT1, [], 'AL'), req('a', '2026-10-02', [], 'EDU_CONT')] })
    expect(only(inp, 'H-SPECIAL-REQ').map((v) => v.data)).toEqual([
      { special: 'AL', code: 'D' },
      { special: 'EDU_CONT', code: 'OFF' },
    ])
  })

  it('근무 옵션 불충족은 소프트, 연차·휴가 칸은 불충족이 아니다', () => {
    const inp = solo('E D A', {
      requests: [
        req('a', OCT1, ['OFF', 'D']),
        req('a', '2026-10-02', ['D']),
        req('a', '2026-10-03', ['OFF']),
      ],
    })
    expect(only(inp, 'S-REQUEST')).toMatchObject([{ dates: [OCT1], data: { options: 'OFF/D', code: 'E' } }])
  })
})

describe('H-SLEEPING', () => {
  it('부여 가능 수를 넘는 슬리핑오프는 위반', () => {
    const five = 'N N O O N N O O N SO'
    expect(only(solo(five), 'H-SLEEPING')).toMatchObject([
      { data: { count: 1, allowed: 0, bank: 0, nights: 5 } },
    ])
    const inp = solo(five, { nurses: [nurse('a', { nightBankBefore: 1 })] })
    expect(only(inp, 'H-SLEEPING')).toEqual([])
  })
})

describe('H-EDU-UNION', () => {
  it('주말·빨간 날이거나 노조원이 아니면 위반', () => {
    const member = [nurse('a', { unionMember: true })]
    expect(only(solo('EU', { nurses: member }), 'H-EDU-UNION')).toEqual([])
    expect(only(solo('D D EU', { nurses: member }), 'H-EDU-UNION')).toMatchObject([
      { data: { reason: 'red_day' } },
    ])
    const hol = solo('D D D D EU', { nurses: member, holidays: [{ date: '2026-10-05', kind: 'substitute' }] })
    expect(only(hol, 'H-EDU-UNION')).toHaveLength(1)
    expect(only(solo('EU'), 'H-EDU-UNION')).toMatchObject([{ data: { reason: 'not_member' } }])
  })
})

describe('S-OFF-AFTER-N', () => {
  it('N 뒤 쉬는 날이 2일 미만이고 다음 근무가 있으면 경고', () => {
    expect(only(solo('N N O E'), 'S-OFF-AFTER-N')).toMatchObject([
      { dates: ['2026-10-02', '2026-10-03', '2026-10-04'], data: { rest: 1, next: 'E' } },
    ])
    expect(only(solo('N O O E'), 'S-OFF-AFTER-N')).toEqual([])
  })

  it('다음 근무가 월 밖이면 판단하지 않는다', () => {
    const tail = Array(29).fill('D').join(' ')
    expect(only(solo(`${tail} N O`), 'S-OFF-AFTER-N')).toEqual([])
  })
})

describe('S-WEEKEND-PAIR (토글)', () => {
  // 2026-10: 토 3·10·17·24·31, 일 4·11·18·25
  const month = (o: string) => {
    const t = Array(31).fill('D')
    for (const d of o.split(' ').filter(Boolean)) t[Number(d) - 1] = 'O'
    return t.join(' ')
  }

  it('월 안에 토·일 둘 다 쉬는 주말이 없으면 경고', () => {
    expect(only(solo(month('3 11 17')), 'S-WEEKEND-PAIR')).toMatchObject([{ data: { consecutive: false } }])
    expect(only(solo(month('17 18')), 'S-WEEKEND-PAIR')).toEqual([])
  })

  it('월 경계에 걸친 주말(10/31 토)은 세지 않는다', () => {
    expect(only(solo(month('31')), 'S-WEEKEND-PAIR')).toHaveLength(1)
  })

  it('전달도 미배정이면 consecutive, 토글이 꺼지면 검사하지 않는다', () => {
    const inp = solo(month(''), { nurses: [nurse('a', { weekendPairMissedLastMonth: true })] })
    expect(only(inp, 'S-WEEKEND-PAIR')).toMatchObject([{ data: { consecutive: true } }])
    expect(
      only(solo(month(''), { rules: rules({}, { weekendPairOffMonthly: false }) }), 'S-WEEKEND-PAIR'),
    ).toEqual([])
  })
})

describe('S-REPEAT-PAIR (토글)', () => {
  const ten = (c: string) => Array(10).fill(c).join(' ')
  const three = (training: TrainingSpan[] = []) =>
    input({
      nurses: [nurse('a'), nurse('b'), nurse('c')],
      trainings: training,
      cells: [...row('a', OCT1, ten('D')), ...row('b', OCT1, ten('D')), ...row('c', OCT1, ten('E'))],
    })

  it('함께 선 횟수가 max(4, ceil(2 × 평균)) 이상인 쌍을 경고한다', () => {
    // a–b 10회, 평균 10/3 → 기준 7
    expect(only(three(), 'S-REPEAT-PAIR')).toMatchObject([
      { userIds: ['a', 'b'], data: { count: 10, threshold: 7 } },
    ])
  })

  it('트레이닝 중 신규–프리셉터 쌍은 세지 않는다', () => {
    const t: TrainingSpan = {
      traineeId: 'b',
      preceptorId: 'a',
      kind: 'new_grad',
      startDate: '2026-09-01',
      endDate: '2026-12-01',
      tripleStaffUntil: '2026-09-21',
      tripleNightsBefore: 3,
    }
    expect(only(three([t]), 'S-REPEAT-PAIR')).toEqual([])
  })

  it('토글이 꺼지면 검사하지 않는다', () => {
    expect(only({ ...three(), rules: rules({}, { minimizeRepeatPairs: false }) }, 'S-REPEAT-PAIR')).toEqual(
      [],
    )
  })
})

describe('checkSchedule 계약', () => {
  it('하드와 소프트를 severity로 나눈다', () => {
    const r = checkSchedule(solo('E D'))
    expect(r.hardViolations.every((v) => v.severity === 'hard')).toBe(true)
    expect(r.softWarnings.every((v) => v.severity === 'soft')).toBe(true)
  })

  it('입력 순서를 섞어도 결과가 같다 (INV1·INV5)', () => {
    const inp = input({
      nurses: [nurse('a'), nurse('b', { kTass: false }), nurse('c', { seniorityTier: 'junior' })],
      cells: [...row('a', OCT1, 'E D N N N N'), ...row('b', OCT1, 'D D O E'), ...row('c', OCT1, 'N O E D')],
      requests: [req('b', OCT1, ['OFF']), req('c', '2026-10-02', [], 'AL')],
    })
    const rev = {
      ...inp,
      nurses: [...inp.nurses].reverse(),
      cells: [...inp.cells].reverse(),
      requests: [...inp.requests].reverse(),
    }
    expect(checkSchedule(rev)).toEqual(checkSchedule(inp))
  })
})
