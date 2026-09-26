import type { HolidayKind } from '@duty/domain'

// Build Spec 2-1 business-rules §6. 2026-10-05는 종이 근무표 정산으로 검증됨. 나머지는 달력 규칙으로 계산했으므로
// 운영 전에 관리자가 검토한다. 개원기념일·병원 지정일·노사 협의일은 관리자가 입력한다.
export type SeedHoliday = { date: string; name: string; kind: HolidayKind }

const P = 'public' as const
const S = 'substitute' as const

export const SEED_HOLIDAYS: SeedHoliday[] = [
  // 2026
  { date: '2026-01-01', name: '신정', kind: P },
  { date: '2026-02-16', name: '설날 연휴', kind: P },
  { date: '2026-02-17', name: '설날', kind: P },
  { date: '2026-02-18', name: '설날 연휴', kind: P },
  { date: '2026-03-01', name: '삼일절', kind: P },
  { date: '2026-03-02', name: '삼일절 대체공휴일', kind: S },
  { date: '2026-05-01', name: '노동절', kind: 'labor_day' },
  { date: '2026-05-05', name: '어린이날', kind: P },
  { date: '2026-05-24', name: '부처님오신날', kind: P },
  { date: '2026-05-25', name: '부처님오신날 대체공휴일', kind: S },
  { date: '2026-06-03', name: '전국동시지방선거', kind: 'election' },
  { date: '2026-06-06', name: '현충일', kind: P },
  { date: '2026-08-15', name: '광복절', kind: P },
  { date: '2026-08-17', name: '광복절 대체공휴일', kind: S },
  { date: '2026-09-24', name: '추석 연휴', kind: P },
  { date: '2026-09-25', name: '추석', kind: P },
  { date: '2026-09-26', name: '추석 연휴', kind: P },
  { date: '2026-10-03', name: '개천절', kind: P },
  { date: '2026-10-05', name: '개천절 대체공휴일', kind: S },
  { date: '2026-10-09', name: '한글날', kind: P },
  { date: '2026-12-25', name: '성탄절', kind: P },
  // 2027
  { date: '2027-01-01', name: '신정', kind: P },
  { date: '2027-02-06', name: '설날 연휴', kind: P },
  { date: '2027-02-07', name: '설날', kind: P },
  { date: '2027-02-08', name: '설날 연휴', kind: P },
  { date: '2027-02-09', name: '설날 대체공휴일', kind: S },
  { date: '2027-03-01', name: '삼일절', kind: P },
  { date: '2027-05-01', name: '노동절', kind: 'labor_day' },
  { date: '2027-05-05', name: '어린이날', kind: P },
  { date: '2027-05-13', name: '부처님오신날', kind: P },
  { date: '2027-06-06', name: '현충일', kind: P },
  { date: '2027-08-15', name: '광복절', kind: P },
  { date: '2027-08-16', name: '광복절 대체공휴일', kind: S },
  { date: '2027-09-14', name: '추석 연휴', kind: P },
  { date: '2027-09-15', name: '추석', kind: P },
  { date: '2027-09-16', name: '추석 연휴', kind: P },
  { date: '2027-10-03', name: '개천절', kind: P },
  { date: '2027-10-04', name: '개천절 대체공휴일', kind: S },
  { date: '2027-10-09', name: '한글날', kind: P },
  { date: '2027-10-11', name: '한글날 대체공휴일', kind: S },
  { date: '2027-12-25', name: '성탄절', kind: P },
  { date: '2027-12-27', name: '성탄절 대체공휴일', kind: S },
]
