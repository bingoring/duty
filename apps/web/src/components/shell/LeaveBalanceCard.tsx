import { signed } from '@/server/schedule/view'
import type { LeaveBalanceSummary } from '@/server/schedule/types'

// 핸드오프 v2 공통 셸 「내 휴가 잔여」 (Build Spec 2-3 R-SHELL-2·3). 누적 OFF는 색 없이 부호로
export function LeaveBalanceCard({ b }: { b: LeaveBalanceSummary }) {
  const rows: [string, string][] = [
    ['연차', `${b.annual} / ${b.annualGranted}`],
    ['특별휴가', `${b.special} / ${b.specialGranted}`],
    ['검진 반차', String(b.checkup)],
    ['병가', String(b.sick)],
    ['누적 OFF', signed(b.offCarry)],
    ['잔여 N', String(b.nightBank)],
  ]
  return (
    <section
      aria-label="내 휴가 잔여"
      className="flex flex-col gap-[5px] rounded-[10px] border border-line-soft bg-panel px-3 py-2.5 text-xs"
    >
      <div className="text-[11px] font-semibold tracking-[.06em] text-ink-3">내 휴가 잔여</div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between">
          <span className="text-ink-2">{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </section>
  )
}
