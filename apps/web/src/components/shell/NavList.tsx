'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_NAV, MAIN_NAV, SETTINGS_NAV, isActive, type NavItemDef } from './nav-items'

function NavItem({ item, pathname, badge = 0 }: { item: NavItemDef; pathname: string; badge?: number }) {
  const active = isActive(pathname, item.href)
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between rounded-lg px-2.5 py-[9px] text-[13.5px] ${
        active ? 'bg-primary-soft font-bold text-primary' : 'text-nav-ink hover:bg-panel'
      }`}
    >
      {item.label}
      {item.pending && <span className="text-[10px] font-normal text-ink-3">준비 중</span>}
      {badge > 0 && (
        <span
          aria-label={`받은 교환 요청 ${badge}건`}
          className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  )
}

// badges: 2-8 받은 교환 요청 수 등 메뉴별 배지 (href → 수)
export function NavList({ isAdmin, badges = {} }: { isAdmin: boolean; badges?: Record<string, number> }) {
  const pathname = usePathname()
  return (
    <>
      {MAIN_NAV.map((item) => (
        <NavItem key={item.href} item={item} pathname={pathname} badge={badges[item.href] ?? 0} />
      ))}
      <div className="px-2.5 pt-3.5 pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-3">관리자</div>
      {isAdmin ? (
        ADMIN_NAV.map((item) => <NavItem key={item.href} item={item} pathname={pathname} />)
      ) : (
        <div className="px-2.5 py-1.5 text-xs text-ink-4">권한 없음</div>
      )}
      <NavItem item={SETTINGS_NAV} pathname={pathname} />
    </>
  )
}
