import { AppShell } from '@/components/shell/AppShell'
import { requireNurse } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { ensureYearStart } from '@/server/balances/year-start'
import { projectedLeaveBalance } from '@/server/requests/balance'
import { KtasReminder } from '@/components/shell/KtasReminder'
import { ktasReminder } from '@/server/ktas/reminder'
import { pendingProposalCount } from '@/server/requests/proposals'
import { pendingReceivedCount } from '@/server/swaps/service'
import { requestToday } from '@/server/clock'
import { pendingLeaveCount } from '@/server/requests/approvals'
import { requestDevice } from '@/server/request-device'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireNurse()
  const today = await requestToday()
  // 연초 잔여치 자동 처리(2-4 R-YEAR-1). 실패해도 화면은 계속 보여 준다
  await ensureYearStart(getDb(), today).catch((e) => console.error('연초 처리 실패', e))
  const leaveBalance = await projectedLeaveBalance(getDb(), session.user.id, today)
  // 2-8 R-SWAP-12: 받은 교환 요청 수 → 근무 조정 메뉴 배지
  const swapCount = await pendingReceivedCount(getDb(), session.user.id, today)
  // 3-5: 받은 휴가 변경 요청 수 → 근무 신청 메뉴 배지
  const proposalCount = await pendingProposalCount(getDb(), session.user.id)
  // 3-8: KTAS 갱신 신청 시기 안내
  const ktas = await ktasReminder(getDb(), session.user.id, today)
  return (
    <AppShell
      session={session}
      device={await requestDevice()}
      leaveBalance={leaveBalance}
      swapCount={swapCount}
      proposalCount={proposalCount}
      approvalCount={session.user.role === 'admin' ? await pendingLeaveCount(getDb()) : 0}
    >
      {ktas && <KtasReminder until={ktas.until} />}
      {children}
    </AppShell>
  )
}
