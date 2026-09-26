import Link from 'next/link'
import { AppShell } from '@/components/shell/AppShell'
import { getSession } from '@/server/auth/session'
import { getDb } from '@/server/db/client'
import { loadLeaveBalance } from '@/server/schedule/load'
import { appToday } from '@/server/schedule/month'

// forbidden 파일은 앱 루트에만 둘 수 있어 셸 레이아웃 밖에서 렌더링된다 → 세션을 읽어 셸을 직접 그린다.
export default async function Forbidden() {
  const body = (
    <div className="flex flex-col gap-3 px-7 py-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">권한이 없습니다</h1>
      <p className="text-[13px] text-ink-2">관리자만 볼 수 있는 화면입니다.</p>
      <Link
        href="/"
        className="inline-flex h-9 w-fit items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-semibold"
      >
        근무표로 돌아가기
      </Link>
    </div>
  )
  const session = await getSession()
  if (!session) return body
  const leaveBalance = await loadLeaveBalance(getDb(), { viewerId: session.user.id, today: appToday() })
  return (
    <AppShell session={session} leaveBalance={leaveBalance}>
      {body}
    </AppShell>
  )
}
