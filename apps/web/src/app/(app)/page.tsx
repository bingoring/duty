import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { ScheduleHeader } from '@/components/schedule/ScheduleHeader'
import { SummaryCards } from '@/components/schedule/SummaryCards'
import { requireUser } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { loadMonthView } from '@/server/schedule/load'
import { parseYm, appToday } from '@/server/schedule/month'
import { buildScheduleView } from '@/server/schedule/view'

// S3 근무표 — 홈 (Build Spec 2-3). 서버 컴포넌트만으로 렌더링한다(클라이언트 JS는 인쇄 버튼뿐)
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[] }>
}) {
  const session = await requireUser()
  const today = appToday()
  const { year, month } = parseYm((await searchParams).ym, today)
  const data = await loadMonthView(getDb(), { year, month, viewerId: session.user.id, today })
  const view = buildScheduleView(data)
  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 py-[18px]">
      <h1 className="print-only text-sm font-bold">{view.title}</h1>
      <ScheduleHeader view={view} />
      {!view.empty && <SummaryCards cards={view.cards} />}
      <ScheduleGrid view={view} />
      <p className="text-xs text-ink-2" data-print="hide">
        {view.footer}
      </p>
    </div>
  )
}
