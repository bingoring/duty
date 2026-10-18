import { AppShell } from '@/components/shell/AppShell'
import { requireDoctor } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { pendingDoctorSwapCount } from '@/server/doctor/swaps'

// 3-7a 의사 화면 셸. 연차 카드 없음(의사는 휴가 메뉴가 없다)
export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireDoctor()
  const swapCount = await pendingDoctorSwapCount(getDb(), session.user.id, await requestToday())
  return (
    <AppShell session={session} leaveBalance={null} swapCount={swapCount}>
      {children}
    </AppShell>
  )
}
