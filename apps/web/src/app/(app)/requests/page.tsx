import { RequestsScreen } from '@/components/requests/RequestsScreen'
import { requireUser } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { buildRequestsView } from '@/server/requests/dto'
import { loadRequestsRaw } from '@/server/requests/load'
import { parseYm, shiftYm, ymOf } from '@/server/schedule/month'
import { requestToday } from '@/server/clock'

// S4 근무 신청 + S5 휴가 팝오버 + S4-A 휴가 승인 (Build Spec 2-5). 기본 대상 월 = 오늘의 다음 달
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[] }>
}) {
  const session = await requireUser()
  const today = await requestToday()
  const raw = (await searchParams).ym
  const ym = raw ? parseYm(raw, today) : shiftYm(parseYm(undefined, today), 1)
  const viewer = {
    id: session.user.id,
    role: session.user.role === 'admin' ? ('admin' as const) : ('nurse' as const),
  }
  const view = buildRequestsView(await loadRequestsRaw(getDb(), { ym, viewer, today }), viewer)
  return (
    <RequestsScreen
      view={view}
      viewerId={viewer.id}
      today={today}
      prev={ymOf(shiftYm(ym, -1))}
      next={ymOf(shiftYm(ym, 1))}
    />
  )
}
