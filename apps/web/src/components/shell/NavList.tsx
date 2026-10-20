'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { NAV_OF, isActive, type NavItemDef } from './nav-items'

type Badge = { count: number; label: string }

// 3-11 1: 의사 달력 화면 사이에서는 강조(hl)를 이어 준다
const HL_PAGES = new Set(['/doctor', '/doctor/requests', '/doctor/adjust', '/doctor/admin/generate'])

function NavItem({
  item,
  pathname,
  badge,
  hl,
}: {
  item: NavItemDef
  pathname: string
  badge?: Badge
  hl?: string | null
}) {
  const active = isActive(pathname, item.href)
  return (
    <Link
      href={hl && HL_PAGES.has(item.href) ? `${item.href}?hl=${encodeURIComponent(hl)}` : item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between rounded-lg px-2.5 py-[9px] text-[13.5px] ${
        active ? 'bg-primary-soft font-bold text-primary' : 'text-nav-ink hover:bg-panel'
      }`}
    >
      {item.label}
      {item.pending && <span className="text-[10px] font-normal text-ink-3">준비 중</span>}
      {badge && badge.count > 0 && (
        <span
          aria-label={`${badge.label} ${badge.count}건`}
          className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white"
        >
          {badge.count}
        </span>
      )}
    </Link>
  )
}

// badges: 2-8 받은 교환 요청 수, 3-5 받은 휴가 변경 요청 수 등 메뉴별 배지 (href → 수·이름)
export function NavList({
  isAdmin,
  group = 'nurse',
  badges = {},
}: {
  isAdmin: boolean
  group?: keyof typeof NAV_OF
  badges?: Record<string, Badge>
}) {
  const pathname = usePathname()
  const hl = useSearchParams().get('hl')
  const { main: MAIN_NAV, admin: ADMIN_NAV, settings: SETTINGS_NAV } = NAV_OF[group]
  return (
    <>
      {MAIN_NAV.map((item) => (
        <NavItem
          key={item.href}
          item={item}
          pathname={pathname}
          badge={badges[item.href]}
          hl={group === 'doctor' ? hl : null}
        />
      ))}
      <div className="px-2.5 pt-3.5 pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-3">관리자</div>
      {isAdmin ? (
        ADMIN_NAV.map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} hl={group === 'doctor' ? hl : null} />
        ))
      ) : (
        <div className="px-2.5 py-1.5 text-xs text-ink-4">권한 없음</div>
      )}
      <NavItem item={SETTINGS_NAV} pathname={pathname} />
    </>
  )
}
