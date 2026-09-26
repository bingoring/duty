export type NavItemDef = { href: string; label: string; pending?: boolean }

// 핸드오프 v2 「공통 셸」 메뉴 순서. pending = 2차 범위(1-1 Q1) → "준비 중"
export const MAIN_NAV: NavItemDef[] = [
  { href: '/', label: '근무표' },
  { href: '/requests', label: '근무 신청' },
  { href: '/adjust', label: '근무 조정' },
  { href: '/peers', label: '동료 현황', pending: true },
  { href: '/rules', label: '규칙 안내', pending: true },
]

export const ADMIN_NAV: NavItemDef[] = [
  { href: '/admin/generate', label: '듀티 생성' },
  { href: '/admin/staff', label: '간호사 관리' },
  { href: '/admin/rules', label: '규칙 설정' },
]

export const SETTINGS_NAV: NavItemDef = { href: '/settings', label: '내 설정' }

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}
