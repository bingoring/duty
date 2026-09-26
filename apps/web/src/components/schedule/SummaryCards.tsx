import type { SummaryCards as Cards } from '@/server/schedule/view'

const card = 'flex flex-col gap-0.5 rounded-[10px] px-3.5 py-2.5'
const white = `${card} border border-line bg-surface`

// 1c 요약 카드 5열 (Build Spec 2-3 frontend-components §2, R-VIEW-10·11·14)
export function SummaryCards({ cards }: { cards: Cards | null }) {
  if (!cards)
    return (
      <div
        className="rounded-[10px] border border-line bg-surface px-3.5 py-3 text-[13px] text-ink-2"
        data-print="hide"
      >
        이 달에는 근무 기록이 없습니다
      </div>
    )
  const sub = 'text-xs font-medium text-ink-2'
  return (
    <div className="grid grid-cols-5 gap-2" data-print="hide" aria-label="내 요약">
      <div className={`${card} bg-ink text-white`}>
        <span className="text-[11px] opacity-70">{cards.todayLabel}</span>
        <span className="text-[22px] font-bold">
          {cards.todayCode}{' '}
          {cards.todayTime && <span className="text-xs font-medium opacity-75">{cards.todayTime}</span>}
        </span>
      </div>
      <div className={white}>
        <span className="text-[11px] text-ink-2">이번달 OFF</span>
        <span className="text-[22px] font-bold">
          {cards.offCount}
          <span className={sub}> / 기준 {cards.baseline}</span>
        </span>
      </div>
      <div className={white}>
        <span className="text-[11px] text-ink-2">누적 OFF (이월 포함)</span>
        <span className="text-[22px] font-bold">
          {cards.accText} <span className={sub}>{cards.accNote}</span>
        </span>
      </div>
      <div className={white}>
        <span className="text-[11px] text-ink-2">잔여 나이트</span>
        <span className="text-[22px] font-bold">
          {cards.bankBefore}{' '}
          <span className={sub}>
            + 이번달 {cards.nights} → 슬리핑오프 {cards.sleeping}
          </span>
        </span>
      </div>
      <div className={white}>
        <span className="text-[11px] text-ink-2">연차 / 특휴</span>
        <span className="text-[22px] font-bold">
          {cards.annual} <span className={sub}>/ {cards.special}</span>
        </span>
      </div>
    </div>
  )
}
