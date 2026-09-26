import { AppShell } from '@/components/shell/AppShell'
import { requireUser } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { loadLeaveBalance } from '@/server/schedule/load'
import { appToday } from '@/server/schedule/month'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser()
  const leaveBalance = await loadLeaveBalance(getDb(), { viewerId: session.user.id, today: appToday() })
  return (
    <AppShell session={session} leaveBalance={leaveBalance}>
      {children}
    </AppShell>
  )
}
