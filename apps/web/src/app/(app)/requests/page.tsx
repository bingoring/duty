import { RequestsScreen } from '@/components/requests/RequestsScreen'
import { requireNurse } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { buildRequestsView } from '@/server/requests/dto'
import { loadRequestsRaw } from '@/server/requests/load'
import { listLeaveProposals } from '@/server/requests/proposals'
import { parseYm, shiftYm, ymOf } from '@/server/schedule/month'
import { requestToday } from '@/server/clock'
import { MobileRequests } from '@/components/mobile/MobileRequests'
import { requestDevice } from '@/server/request-device'

// S4 근무 신청 + S5 휴가 팝오버 + S4-A 휴가 승인 (Build Spec 2-5). 기본 대상 월 = 오늘의 다음 달
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[] }>
}) {
  const session = await requireNurse()
  const today = await requestToday()
  const raw = (await searchParams).ym
  const ym = raw ? parseYm(raw, today) : shiftYm(parseYm(undefined, today), 1)
  const viewer = {
    id: session.user.id,
    role: session.user.role === 'admin' ? ('admin' as const) : ('nurse' as const),
  }
  const view = buildRequestsView(await loadRequestsRaw(getDb(), { ym, viewer, today }), viewer)
  // 3-5: 휴가 변경 요청(간호사: 받은 요청, 관리자: 보낸 요청)
  const proposals = await listLeaveProposals(getDb(), viewer)
  // 3-12 모바일: 달력 + 날짜 시트(저장은 데스크톱 신청 팝오버 그대로)
  if ((await requestDevice()) === 'mobile')
    return (
      <MobileRequests
        key={ymOf(ym)}
        view={view}
        viewerId={viewer.id}
        today={today}
        prevHref={`/requests?ym=${ymOf(shiftYm(ym, -1))}`}
        nextHref={`/requests?ym=${ymOf(shiftYm(ym, 1))}`}
        proposals={proposals}
      />
    )
  return (
    <RequestsScreen
      view={view}
      viewerId={viewer.id}
      today={today}
      prev={ymOf(shiftYm(ym, -1))}
      next={ymOf(shiftYm(ym, 1))}
      proposals={proposals}
    />
  )
}
