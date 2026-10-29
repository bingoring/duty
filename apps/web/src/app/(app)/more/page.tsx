import { MorePage } from '@/components/mobile/MorePage'
import { requireNurse } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { projectedLeaveBalance } from '@/server/requests/balance'

// 3-12 모바일 「더보기」(간호사)
export default async function MoreRoute() {
  const session = await requireNurse()
  const leaveBalance = await projectedLeaveBalance(getDb(), session.user.id, await requestToday())
  return (
    <MorePage
      session={session}
      leaveBalance={leaveBalance}
      links={[
        { href: '/peers', label: '동료 현황' },
        { href: '/rules', label: '규칙 안내' },
        { href: '/settings', label: '내 설정' },
      ]}
    />
  )
}
