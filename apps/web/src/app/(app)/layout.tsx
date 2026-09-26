import { AppShell } from '@/components/shell/AppShell'
import { requireUser } from '@/server/auth/guards'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser()
  return <AppShell session={session}>{children}</AppShell>
}
