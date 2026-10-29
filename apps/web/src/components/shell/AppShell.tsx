import { logoutAction } from '@/server/auth/actions'
import type { ValidSession } from '@/server/auth/service'
import type { Device } from '@/server/device'
import type { LeaveBalanceSummary } from '@/server/schedule/types'
import { LeaveBalanceCard } from './LeaveBalanceCard'
import { MobileShell } from './MobileShell'
import { NavList } from './NavList'
import { SessionKeeper } from './SessionKeeper'
import { ViewportSync } from './ViewportSync'

// 핸드오프 v2 「공통 셸」: grid 184px 1fr, 좌측 nav 흰 배경·우측 보더, 하단 「내 휴가 잔여」.
// 3-12: 휴대폰이면 사이드바 대신 아래 탭 셸(둘 중 하나만 그린다)
export function AppShell({
  session,
  device,
  leaveBalance,
  swapCount = 0,
  proposalCount = 0,
  children,
}: {
  session: ValidSession
  device: Device
  leaveBalance: LeaveBalanceSummary | null
  swapCount?: number
  proposalCount?: number
  children: React.ReactNode
}) {
  const { user } = session
  const isAdmin = user.role === 'admin'
  const doctor = user.roleGroup === 'doctor'
  if (device === 'mobile')
    return (
      <MobileShell
        group={doctor ? 'doctor' : 'nurse'}
        isAdmin={isAdmin}
        persistent={session.persistent}
        badges={{ swap: swapCount, proposal: proposalCount }}
      >
        {children}
      </MobileShell>
    )
  return (
    <div className="grid min-h-screen min-w-[1280px] grid-cols-[184px_1fr] bg-app">
      {session.persistent && <SessionKeeper />}
      <ViewportSync device="desktop" />
      <nav className="sticky top-0 flex h-screen flex-col gap-0.5 border-r border-line-nav bg-surface px-3 py-5">
        <div className="px-2.5 pt-1 pb-4 text-[15px] leading-[1.3] font-extrabold tracking-[-0.02em]">
          벌써 근무표
          <br />짤 때가 됐어?
        </div>
        <NavList
          isAdmin={isAdmin}
          group={doctor ? 'doctor' : 'nurse'}
          badges={{
            '/adjust': { count: swapCount, label: '받은 교환 요청' },
            '/requests': { count: proposalCount, label: '받은 휴가 변경 요청' },
            '/doctor/adjust': { count: swapCount, label: '받은 교환 요청' },
          }}
        />
        <div className="mt-auto flex flex-col gap-2">
          {leaveBalance && <LeaveBalanceCard b={leaveBalance} />}
          <div className="flex flex-col gap-0.5 border-t border-line-nav px-2.5 pt-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              {user.name}
              {doctor && <span className="text-[11px] font-semibold text-ink-2">의사</span>}
              {isAdmin && <span className="text-[11px] font-semibold text-admin">관리자</span>}
            </div>
            <div className="text-xs text-ink-2">
              {user.wardName} · {doctor ? 'ID' : '사번'} {user.employeeNo}
            </div>
            <form action={logoutAction}>
              <button type="submit" className="mt-1 cursor-pointer text-xs text-ink-3 hover:text-ink">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="min-w-0">{children}</main>
    </div>
  )
}
