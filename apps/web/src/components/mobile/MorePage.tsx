import Link from 'next/link'
import { LeaveBalanceCard } from '@/components/shell/LeaveBalanceCard'
import { logoutAction } from '@/server/auth/actions'
import type { ValidSession } from '@/server/auth/service'
import type { LeaveBalanceSummary } from '@/server/schedule/types'

// 3-12 모바일 「더보기」: 데스크톱 사이드바 아래쪽(내 정보·휴가 잔여·나머지 메뉴·로그아웃)을 한 열 카드로
export function MorePage(props: {
  session: ValidSession
  leaveBalance: LeaveBalanceSummary | null
  links: { href: string; label: string }[]
}) {
  const { user } = props.session
  const doctor = user.roleGroup === 'doctor'
  return (
    <div className="flex flex-col gap-3 px-4 pt-3.5">
      <h1 className="text-[19px] font-bold tracking-[-0.02em]">더보기</h1>
      <section aria-label="내 정보" className="rounded-xl bg-surface px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-[15px] font-bold">
          {user.name}
          {doctor && <span className="text-xs font-semibold text-ink-2">의사</span>}
          {user.role === 'admin' && <span className="text-xs font-semibold text-admin">관리자</span>}
        </div>
        <div className="text-xs text-ink-2">
          {user.wardName} · {doctor ? 'ID' : '사번'} {user.employeeNo}
        </div>
      </section>
      {props.leaveBalance && <LeaveBalanceCard b={props.leaveBalance} />}
      <nav aria-label="더보기 메뉴" className="overflow-hidden rounded-xl bg-surface text-[14px]">
        {props.links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex justify-between border-b border-line-soft px-3.5 py-3 last:border-0 active:bg-panel"
          >
            {l.label}
            <span className="text-ink-3">›</span>
          </Link>
        ))}
      </nav>
      <form action={logoutAction}>
        <button
          type="submit"
          className="h-11 w-full rounded-xl border border-line bg-surface text-[14px] font-semibold text-ink-2"
        >
          로그아웃
        </button>
      </form>
    </div>
  )
}
