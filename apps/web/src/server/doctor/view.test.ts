import { describe, expect, it } from 'vitest'
import { buildDoctorCalendar, originalOwners, originPeople } from './view'

// 3-11 5: 바뀐 칸의 원래 사람
describe('originalOwners', () => {
  it('그 칸이 처음 바뀐 기록의 before, 안 바뀐 칸은 없다', () => {
    const logs = [
      { date: '2026-10-05', before: { day: 'a', night: 'b' }, after: { day: 'c', night: 'b' } },
      { date: '2026-10-05', before: { day: 'c', night: 'b' }, after: { day: 'd', night: 'a' } },
    ]
    expect(originalOwners(logs)).toEqual({ '2026-10-05:D': 'a', '2026-10-05:N': 'b' })
  })
})

describe('originPeople', () => {
  const doctors = [
    { id: 'a', name: '가' },
    { id: 'b', name: '나' },
    { id: 'c', name: '다' },
  ]
  const cal = buildDoctorCalendar({
    year: 2026,
    month: 10,
    doctors,
    shifts: [{ date: '2026-10-05', day: 'c', night: 'b' }],
    holidays: [],
    viewerId: null,
    today: '2026-10-01',
  })
  it('이름을 붙이고, 되돌려 지금 사람과 같은 칸은 뺀다', () => {
    expect(originPeople({ '2026-10-05:D': 'a', '2026-10-05:N': 'b' }, cal.weeks, doctors)).toEqual({
      '2026-10-05:D': { id: 'a', name: '가' },
    })
  })
})
