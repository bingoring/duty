import { logoutAction } from '@/server/auth/actions'
import type { ValidSession } from '@/server/auth/service'
import { NavList } from './NavList'
import { SessionKeeper } from './SessionKeeper'

// 핸드오프 「공통 셸」: grid 184px 1fr, 좌측 nav 흰 배경·우측 보더
export function AppShell({ session, children }: { session: ValidSession; children: React.ReactNode }) {
  const { user } = session
  const isAdmin = user.role === 'admin'
  return (
    <div className="grid min-h-screen min-w-[1280px] grid-cols-[184px_1fr] bg-app">
      {session.persistent && <SessionKeeper />}
      <nav className="sticky top-0 flex h-screen flex-col gap-0.5 border-r border-line-nav bg-surface px-3 py-5">
        <div className="px-2.5 pt-1 pb-4 text-[15px] leading-[1.3] font-extrabold tracking-[-0.02em]">
          벌써 근무표
          <br />짤 때가 됐어?
        </div>
        <NavList isAdmin={isAdmin} />
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line-nav px-2.5 py-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            {user.name}
            {isAdmin && <span className="text-[11px] font-semibold text-admin">관리자</span>}
          </div>
          <div className="text-xs text-ink-2">
            {user.wardName} · 사번 {user.employeeNo}
          </div>
          <form action={logoutAction}>
            <button type="submit" className="mt-1 cursor-pointer text-xs text-ink-3 hover:text-ink">
              로그아웃
            </button>
          </form>
        </div>
      </nav>
      <main className="min-w-0">{children}</main>
    </div>
  )
}
