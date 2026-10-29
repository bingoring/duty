import { dayOfWeek, monthDates, weekdayKo, type IsoDate } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import { dayRosters, myMonth, todayCard, type MyMonth } from './mobile'
import type { DayHead, GridCellView, GridRow, ScheduleView, SummaryCards } from './view'

type Chip = GridCellView['chip']

function heads(year: number, month: number, today: IsoDate | null): DayHead[] {
  return monthDates(year, month).map((date) => {
    const dow = dayOfWeek(date)
    return {
      date,
      day: Number(date.slice(8)),
      weekday: weekdayKo(date),
      // 실제 DayHead처럼 주말(토·일)이 red
      red: dow === 0 || dow === 6,
      color: dow === 0 ? 'sun' : dow === 6 ? 'sat' : 'plain',
      today: date === today,
    }
  })
}

function row(
  userId: string,
  name: string,
  kind: GridRow['kind'],
  days: DayHead[],
  set: Record<string, [string, Chip]>,
): GridRow {
  return {
    userId,
    name,
    kind,
    carryOff: '0',
    carryN: '0',
    accOff: '0',
    nLeft: '0',
    special: '0',
    checkup: '0',
    bo: '0',
    cells: days.map((d) => {
      const [label, chip] = set[d.date] ?? ['', null]
      return {
        date: d.date,
        label,
        chip,
        outline: null,
        checkupHalf: false,
        weekend: d.red,
        today: d.today,
        title: '',
      }
    }),
  }
}

const CARDS: SummaryCards = {
  todayLabel: '오늘 10/28 (수)',
  todayCode: 'E',
  todayTime: '14:30–23:00',
  offCount: 9,
  baseline: 9,
  accText: '+4',
  accNote: '',
  bankBefore: 0,
  nights: 0,
  sleeping: 0,
  annual: 0,
  special: 0,
}

function view(days: DayHead[], rows: GridRow[], cards: SummaryCards | null): ScheduleView {
  return {
    title: '',
    prev: '',
    next: '',
    badge: null,
    nextMonthLink: null,
    empty: rows.length ? null : { text: '근무표가 없습니다' },
    days,
    rows,
    cards,
    footer: '',
    gridTemplate: '',
  }
}

const octDays = heads(2026, 10, '2026-10-28')
const oct = view(
  octDays,
  [
    row('u2', '윤채원', 'other', octDays, {
      '2026-10-28': ['D', 'd'],
      '2026-10-29': ['연차', 'leave'],
    }),
    row('u1', '정하늘', 'me', octDays, {
      '2026-10-28': ['E', 'e'],
      '2026-10-29': ['N', 'n'],
      '2026-10-31': ['D', 'd'],
    }),
    row('u3', '배지현', 'other', octDays, { '2026-10-28': ['off', 'off'], '2026-10-29': ['N', 'n'] }),
  ],
  CARDS,
)
const novDays = heads(2026, 11, null)
const nov = view(novDays, [row('u1', '정하늘', 'me', novDays, { '2026-11-01': ['off', 'off'] })], null)
const withoutMe = view(
  octDays,
  oct.rows.filter((r) => r.kind !== 'me'),
  null,
)
const emptyView = view(octDays, [], null)

const find = (m: MyMonth, date: IsoDate) => m.weeks.flat().find((d) => d?.date === date)

describe('3-12 모바일 근무표: 내 달력', () => {
  it('10월 1일은 목요일 → 첫 주 앞 4칸 null', () => {
    const w = myMonth(oct).weeks
    expect(w[0]!.slice(0, 4)).toEqual([null, null, null, null])
    expect(w[0]![4]?.date).toBe('2026-10-01')
    expect(w.every((wk) => wk.length === 7)).toBe(true)
  })
  it('내 칸 chip·label, 오늘 표시는 DayHead.today', () =>
    expect(find(myMonth(oct), '2026-10-28')).toMatchObject({ chip: 'e', label: 'E', today: true, day: 28 }))
  it('일요일은 red, 토요일은 아니다(시안)', () => {
    expect(find(myMonth(oct), '2026-10-25')?.red).toBe(true)
    expect(find(myMonth(oct), '2026-10-24')?.red).toBe(false)
  })
  it('평일 공휴일은 red', () => {
    const days = octDays.map((d) => (d.date === '2026-10-09' ? { ...d, red: true } : d))
    expect(find(myMonth(view(days, oct.rows, CARDS)), '2026-10-09')?.red).toBe(true)
  })
  it('내 행이 없으면 chip null', () => expect(find(myMonth(withoutMe), '2026-10-28')?.chip).toBeNull())
})

describe('3-12 모바일 근무표: 날짜별 명단', () => {
  it('D·E·N·OFF 묶음과 나 표시, 빈 묶음은 뺀다', () =>
    expect(dayRosters(oct)['2026-10-28']).toEqual([
      {
        key: 'D',
        label: 'D',
        time: '07:00–15:30',
        people: [{ id: 'u2', name: '윤채원', me: false, note: '' }],
      },
      {
        key: 'E',
        label: 'E',
        time: '14:30–23:00',
        people: [{ id: 'u1', name: '정하늘', me: true, note: '' }],
      },
      {
        key: 'OFF',
        label: '쉬는 사람',
        time: '',
        people: [{ id: 'u3', name: '배지현', me: false, note: '' }],
      },
    ]))
  it('휴가는 LEAVE 묶음에 휴가 이름, OFF보다 앞', () => {
    const g = dayRosters(oct)['2026-10-29']!
    expect(g.map((x) => x.key)).toEqual(['N', 'LEAVE'])
    expect(g[1]!.people[0]).toMatchObject({ name: '윤채원', note: '연차' })
  })
  it('칸이 없는 날은 빈 배열', () => expect(dayRosters(oct)['2026-10-02']).toEqual([]))
})

describe('3-12 모바일 근무표: 오늘 카드', () => {
  it('오늘·내일·이번 달 요약', () =>
    expect(todayCard({ cur: oct, next: null, today: '2026-10-28' })).toEqual({
      dateLabel: '오늘 10/28 (수)',
      code: 'E',
      time: '14:30–23:00',
      tomorrow: '내일 N 22:30–',
      summary: '이번 달 OFF 9 · 누적 OFF +4',
      empty: false,
    }))
  it('월말 내일은 다음 달에서', () =>
    expect(todayCard({ cur: oct, next: nov, today: '2026-10-31' }).tomorrow).toBe('내일 off'))
  it('월말인데 다음 달 근무표가 없으면 내일 없음', () =>
    expect(todayCard({ cur: oct, next: null, today: '2026-10-31' }).tomorrow).toBeNull())
  it('내일 휴가는 이름만', () =>
    expect(todayCard({ cur: withLeaveTomorrow(), next: null, today: '2026-10-28' }).tomorrow).toBe(
      '내일 연차',
    ))
  it('근무표가 없으면 empty', () =>
    expect(todayCard({ cur: emptyView, next: null, today: '2026-10-28' })).toEqual({
      dateLabel: '오늘 10/28 (수)',
      code: '—',
      time: '',
      tomorrow: null,
      summary: null,
      empty: true,
    }))
})

function withLeaveTomorrow(): ScheduleView {
  return view(octDays, [row('u1', '정하늘', 'me', octDays, { '2026-10-29': ['연차', 'leave'] })], CARDS)
}
