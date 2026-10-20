import { shiftTimesText } from './shift-times'

// 3-11 11: 간호사 근무표 아래 「D 07:00–15:30 · E … · N … · S …」 (간호사 화면·의사 화면의 간호사 탭)
export function ShiftTimesLegend() {
  return (
    <p className="text-xs text-ink-2">
      <span className="font-semibold text-ink">근무 시간</span> {shiftTimesText()}
    </p>
  )
}
