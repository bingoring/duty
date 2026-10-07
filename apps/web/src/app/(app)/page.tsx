import { FocusClear } from '@/components/schedule/FocusClear'
import { NoticeBar } from '@/components/schedule/NoticeBar'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { ScrollToSelected } from '@/components/schedule/ScrollToSelected'
import { ScheduleHeader } from '@/components/schedule/ScheduleHeader'
import { SummaryCards } from '@/components/schedule/SummaryCards'
import { requireUser } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { loadNotices } from '@/server/notices/service'
import { pendingReceivedCount } from '@/server/swaps/service'
import { loadMonthView } from '@/server/schedule/load'
import { parseYm } from '@/server/schedule/month'
import { buildScheduleView } from '@/server/schedule/view'
import { requestToday } from '@/server/clock'

// S3 근무표 — 홈 (Build Spec 2-3). 서버 컴포넌트로 렌더링한다(클라이언트 JS는 인쇄 버튼, 2-7 바뀐 근무 안내의 「확인」, 강조 열 해제뿐)
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[]; focus?: string | string[] }>
}) {
  const session = await requireUser()
  const today = await requestToday()
  const sp = await searchParams
  const { year, month } = parseYm(sp.ym, today)
  // 바뀐 근무 안내 링크(?focus=날짜): 내 줄의 그 칸을 행·열·칸 강조로 짚는다
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const focus =
    typeof sp.focus === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.focus) && sp.focus.startsWith(ym)
      ? sp.focus
      : null
  const db = getDb()
  const data = await loadMonthView(db, { year, month, viewerId: session.user.id, today })
  const view = buildScheduleView(data)
  const notices = await loadNotices(db, session.user.id)
  const swaps = await pendingReceivedCount(db, session.user.id, today)
  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 py-[18px]">
      <h1 className="print-only text-sm font-bold">{view.title}</h1>
      <NoticeBar items={notices.items} more={notices.more} swaps={swaps} />
      <ScheduleHeader view={view} />
      {!view.empty && <SummaryCards cards={view.cards} />}
      <FocusClear focus={focus} ym={ym}>
        <ScheduleGrid
          view={view}
          {...(focus ? { ui: { selected: { userId: session.user.id, date: focus } } } : {})}
        />
      </FocusClear>
      <ScrollToSelected focus={focus} />
      <p className="text-xs text-ink-2" data-print="hide">
        {view.footer}
      </p>
    </div>
  )
}
