'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ADMIN_NAV, MAIN_NAV, SETTINGS_NAV, isActive, type NavItemDef } from './nav-items'

function NavItem({ item, pathname }: { item: NavItemDef; pathname: string }) {
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
    </Link>
  )
}

export function NavList({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  return (
    <>
      {MAIN_NAV.map((item) => (
        <NavItem key={item.href} item={item} pathname={pathname} />
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
