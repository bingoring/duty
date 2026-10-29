import { MorePage } from '@/components/mobile/MorePage'
import { requireDoctor } from '@/server/auth/guards'

// 3-12 모바일 「더보기」(의사: 휴가·동료 현황 없음)
export default async function DoctorMoreRoute() {
  const session = await requireDoctor()
  return (
    <MorePage
      session={session}
      leaveBalance={null}
      links={[
        { href: '/doctor/rules', label: '규칙 안내' },
        { href: '/doctor/settings', label: '내 설정' },
      ]}
    />
  )
}
