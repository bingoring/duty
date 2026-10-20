// 3-11 11: 간호사 근무표 아래 근무 시간 안내 — SHIFT_TIMES에서 만든다 (값을 따로 적지 않는다)
import { SHIFT_TIMES } from '@duty/domain'

type Times = Readonly<Record<string, { start: string; end: string }>>

export function shiftTimesText(times: Times = SHIFT_TIMES): string {
  return Object.entries(times)
    .map(([code, t]) => `${code} ${t.start}–${t.end}`)
    .join(' · ')
}
