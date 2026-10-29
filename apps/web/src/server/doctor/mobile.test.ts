import { DOCTOR_TIMES, type IsoDate } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import type { MyMonth } from '../schedule/mobile'
import { doctorMyMonth, doctorRosters, doctorTodayCard } from './mobile'
import type { DoctorScheduleView } from './schedule'
import { buildDoctorCalendar } from './view'

// 가명: 의사 셋
const doctors = [
  { id: 'a', name: '가의사' },
  { id: 'b', name: '나의사' },
  { id: 'c', name: '다의사' },
]
const TODAY = '2026-10-13'

function view(viewerId: string | null, confirmed = true): DoctorScheduleView {
  return {
    year: 2026,
    month: 10,
    title: '',
    prev: '',
    next: '',
    confirmed,
    badge: null,
    calendar: buildDoctorCalendar({
      year: 2026,
      month: 10,
      doctors,
      shifts: confirmed
        ? [
            { date: '2026-10-13', day: 'a', night: 'b' },
            { date: '2026-10-14', day: 'c', night: 'c' },
            { date: '2026-10-15', day: 'b', night: 'a' },
          ]
        : [],
      holidays: [],
      viewerId,
      today: TODAY,
    }),
    doctors,
    viewerId,
    times: DOCTOR_TIMES,
    testPeriod: false,
    hidden: false,
    colors: {},
    origins: {},
  }
}

const find = (m: MyMonth, date: IsoDate) => m.weeks.flat().find((d) => d?.date === date)

describe('3-12 모바일 의사 근무표', () => {
  it('내 달력: D·N·올데이, 다른 날은 칩 없음', () => {
    const m = doctorMyMonth(view('a'))
    expect(find(m, '2026-10-13')).toMatchObject({ chip: 'd', label: 'D', today: true })
    expect(find(m, '2026-10-15')).toMatchObject({ chip: 'n', label: 'N' })
    expect(find(m, '2026-10-14')?.chip).toBeNull()
    expect(find(doctorMyMonth(view('c')), '2026-10-14')).toMatchObject({ chip: 'allday', label: '올데이' })
    expect(m.weeks[0]!.slice(0, 4)).toEqual([null, null, null, null])
  })

  it('날짜별 명단: D·N 한 명씩, 올데이는 한 묶음, 빈 날은 []', () => {
    const r = doctorRosters(view('a'))
    expect(r['2026-10-13']).toEqual([
      {
        key: 'D',
        label: 'D',
        time: DOCTOR_TIMES.D,
        people: [{ id: 'a', name: '가의사', me: true, note: '' }],
      },
      {
        key: 'N',
        label: 'N',
        time: DOCTOR_TIMES.N,
        people: [{ id: 'b', name: '나의사', me: false, note: '' }],
      },
    ])
    expect(r['2026-10-14']).toEqual([
      {
        key: 'ALLDAY',
        label: '올데이',
        time: '10:00 – 익일 10:00',
        people: [{ id: 'c', name: '다의사', me: false, note: '' }],
      },
    ])
    expect(r['2026-10-01']).toEqual([])
  })

  it('오늘 카드: 오늘 근무와 다음 근무', () =>
    expect(doctorTodayCard(view('a'), TODAY)).toEqual({
      dateLabel: '오늘 10/13 (화)',
      code: 'D',
      time: DOCTOR_TIMES.D,
      tomorrow: '다음 근무 10/15 (목) N',
      summary: '이번 달 D 1 · N 1',
      empty: false,
    }))

  it('오늘 쉬는 날', () => expect(doctorTodayCard(view('c'), TODAY)).toMatchObject({ code: '쉼', time: '' }))

  it('확정 전 달이면 empty', () =>
    expect(doctorTodayCard(view('a', false), TODAY)).toMatchObject({
      empty: true,
      code: '—',
      tomorrow: null,
    }))
})
