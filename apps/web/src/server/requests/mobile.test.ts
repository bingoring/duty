import { dayOfWeek, monthDates, weekdayKo, type IsoDate } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import type { RequestCellDTO, RequestRowDTO, RequestsView } from './dto'
import { peerRequests, requestMonth, sameDayText, type ReqMonth } from './mobile'

type Mark = Partial<RequestCellDTO> & { label: string; kind: 'shift' | 'leave' }

const days = monthDates(2026, 12).map((date) => {
  const dow = dayOfWeek(date)
  return {
    date,
    day: Number(date.slice(8)),
    weekday: weekdayKo(date),
    red: dow === 0 || dow === 6 || date === '2026-12-25',
    color: (dow === 0 ? 'sun' : dow === 6 ? 'sat' : 'plain') as 'sun' | 'sat' | 'plain',
  }
})

function row(userId: string, name: string, me: boolean, set: Record<string, Mark>): RequestRowDTO {
  return {
    userId,
    name,
    me,
    head: false,
    count: 0,
    cells: days.map((d) => {
      const m = set[d.date]
      return m
        ? { date: d.date, hasComment: false, draft: false, ...m }
        : { date: d.date, kind: null, label: '', hasComment: false, draft: false }
    }),
  }
}

const dec = {
  year: 2026,
  month: 12,
  days,
  rows: [
    row('u2', '윤채원', false, {
      '2026-12-04': { label: 'D/E', kind: 'shift' },
      '2026-12-09': { label: 'O', kind: 'shift', byAdmin: true },
      '2026-12-19': { label: '연차', kind: 'leave' },
    }),
    row('u1', '정하늘', true, {
      '2026-12-04': { label: 'O', kind: 'shift', draft: true },
      '2026-12-09': { label: 'N', kind: 'shift' },
    }),
    row('u3', '배지현', false, {}),
  ],
  offCounts: { '2026-12-24': 5, '2026-12-03': 2 },
} as unknown as RequestsView

const find = (m: ReqMonth, date: IsoDate) => m.weeks.flat().find((d) => d?.date === date)

describe('3-12 모바일 신청 달력', () => {
  it('12월 1일은 화요일 → 첫 주 앞 2칸 null', () =>
    expect(requestMonth(dec).weeks[0]!.slice(0, 2)).toEqual([null, null]))
  it('내 신청 표시: 라벨·종류·관리자 표시·임시 저장', () =>
    expect(find(requestMonth(dec), '2026-12-04')?.mine).toEqual({
      label: 'O',
      kind: 'shift',
      byAdmin: false,
      draft: true,
    }))
  it('내 신청이 없는 날은 null', () => expect(find(requestMonth(dec), '2026-12-02')?.mine).toBeNull())
  it('쉼 n과 3 이상 빨강', () => {
    expect(find(requestMonth(dec), '2026-12-24')).toMatchObject({ rest: 5, hot: true })
    expect(find(requestMonth(dec), '2026-12-03')).toMatchObject({ rest: 2, hot: false })
    expect(find(requestMonth(dec), '2026-12-02')).toMatchObject({ rest: 0, hot: false })
  })
  it('그날 신청한 사람 수(나 포함)', () => expect(find(requestMonth(dec), '2026-12-04')?.count).toBe(2))
  it('일요일·평일 공휴일만 빨강', () => {
    expect(find(requestMonth(dec), '2026-12-06')?.red).toBe(true)
    expect(find(requestMonth(dec), '2026-12-05')?.red).toBe(false)
    expect(find(requestMonth(dec), '2026-12-25')?.red).toBe(true)
  })
})

describe('3-12 그날 동료 신청', () => {
  it('내 행 제외, 신청 있는 사람만', () =>
    expect(peerRequests(dec, '2026-12-04')).toEqual([
      { userId: 'u2', name: '윤채원', label: 'D/E', kind: 'shift', byAdmin: false },
    ]))
  it('관리자가 넣은 신청은 byAdmin', () => expect(peerRequests(dec, '2026-12-09')[0]?.byAdmin).toBe(true))
  it('휴가도 포함', () =>
    expect(peerRequests(dec, '2026-12-19')[0]).toMatchObject({ label: '연차', kind: 'leave' }))
  it('신청 없는 날은 빈 배열', () => expect(peerRequests(dec, '2026-12-02')).toEqual([]))
  it('데스크톱 팝오버의 같은 날 문구: 고른 사람 빼고, 임시 저장 제외', () => {
    expect(sameDayText(dec, 'u1', '2026-12-04')).toBe('윤채원 D/E')
    expect(sameDayText(dec, 'u2', '2026-12-04')).toBe('')
  })
})
