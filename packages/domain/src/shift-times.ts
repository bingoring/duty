// 요구사항 원문 §1(D/E/N), 응급실 지침 §7(S). N은 익일 07:30 종료(휴게 1시간 포함).
export const SHIFT_TIMES = {
  D: { start: '07:00', end: '15:30', endsNextDay: false },
  E: { start: '14:30', end: '23:00', endsNextDay: false },
  N: { start: '22:30', end: '07:30', endsNextDay: true },
  S: { start: '09:00', end: '18:00', endsNextDay: false },
} as const
