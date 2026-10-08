import { PeersHeader, PeersTable } from '@/components/peers/PeersTable'
import { requireUser } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { buildPeersView } from '@/server/peers/view'
import { loadMonthView } from '@/server/schedule/load'
import { parseYm } from '@/server/schedule/month'

// S6 동료 현황 (Build Spec 2-10). 근무표(S3)와 같은 계산을 쓴다
export default async function PeersPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[] }>
}) {
  const session = await requireUser()
  const today = await requestToday()
  const { year, month } = parseYm((await searchParams).ym, today)
  const data = await loadMonthView(getDb(), { year, month, viewerId: session.user.id, today })
  const view = buildPeersView(data)
  return (
    <div className="flex min-w-0 flex-col gap-4 px-7 py-6">
      <PeersHeader view={view} />
      <PeersTable view={view} />
    </div>
  )
}
