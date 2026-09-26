import { AppShell } from '@/components/shell/AppShell'
import { requireUser } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { ensureYearStart } from '@/server/balances/year-start'
import { loadLeaveBalance } from '@/server/schedule/load'
import { appToday } from '@/server/schedule/month'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser()
  const today = appToday()
  // 연초 잔여치 자동 처리(2-4 R-YEAR-1). 실패해도 화면은 계속 보여 준다
  await ensureYearStart(getDb(), today).catch((e) => console.error('연초 처리 실패', e))
  const leaveBalance = await loadLeaveBalance(getDb(), { viewerId: session.user.id, today })
  return (
    <AppShell session={session} leaveBalance={leaveBalance}>
      {children}
    </AppShell>
  )
}
