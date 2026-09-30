import { NoticeBar } from '@/components/schedule/NoticeBar'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { ScheduleHeader } from '@/components/schedule/ScheduleHeader'
import { SummaryCards } from '@/components/schedule/SummaryCards'
import { requireUser } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { loadNotices } from '@/server/notices/service'
import { pendingReceivedCount } from '@/server/swaps/service'
import { loadMonthView } from '@/server/schedule/load'
import { parseYm, appToday } from '@/server/schedule/month'
import { buildScheduleView } from '@/server/schedule/view'

// S3 근무표 — 홈 (Build Spec 2-3). 서버 컴포넌트로 렌더링한다(클라이언트 JS는 인쇄 버튼과 2-7 바뀐 근무 안내의 「확인」뿐)
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[] }>
}) {
  const session = await requireUser()
  const today = appToday()
  const { year, month } = parseYm((await searchParams).ym, today)
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
      <ScheduleGrid view={view} />
      <p className="text-xs text-ink-2" data-print="hide">
        {view.footer}
      </p>
    </div>
  )
}
