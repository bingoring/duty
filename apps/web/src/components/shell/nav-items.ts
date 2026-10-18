export type NavItemDef = { href: string; label: string; pending?: boolean }

// 핸드오프 v2 「공통 셸」 메뉴 순서. pending = 아직 없는 화면 → "준비 중"
export const MAIN_NAV: NavItemDef[] = [
  { href: '/', label: '근무표' },
  { href: '/requests', label: '근무 신청' },
  { href: '/adjust', label: '근무 조정' },
  { href: '/peers', label: '동료 현황' },
  { href: '/rules', label: '규칙 안내' },
]

export const ADMIN_NAV: NavItemDef[] = [
  { href: '/admin/generate', label: '듀티 생성' },
  { href: '/admin/staff', label: '간호사 관리' },
  { href: '/admin/rules', label: '규칙 설정' },
]

export const SETTINGS_NAV: NavItemDef = { href: '/settings', label: '내 설정' }

// 3-7a 의사 메뉴 (핸드오프 turn-6): 근무표 · 근무 신청 · 근무 조정 · 규칙 안내 → 관리자 → 내 설정
export const DOCTOR_MAIN_NAV: NavItemDef[] = [
  { href: '/doctor', label: '근무표' },
  { href: '/doctor/requests', label: '근무 신청' },
  { href: '/doctor/adjust', label: '근무 조정' },
  { href: '/doctor/rules', label: '규칙 안내' },
]

export const DOCTOR_ADMIN_NAV: NavItemDef[] = [
  { href: '/doctor/admin/generate', label: '듀티 생성' },
  { href: '/doctor/admin/staff', label: '의사 관리' },
  { href: '/doctor/admin/rules', label: '규칙 설정' },
]

export const DOCTOR_SETTINGS_NAV: NavItemDef = { href: '/doctor/settings', label: '내 설정' }

export const NAV_OF = {
  nurse: { main: MAIN_NAV, admin: ADMIN_NAV, settings: SETTINGS_NAV },
  doctor: { main: DOCTOR_MAIN_NAV, admin: DOCTOR_ADMIN_NAV, settings: DOCTOR_SETTINGS_NAV },
} as const

const HOMES = new Set(['/', '/doctor'])

export function isActive(pathname: string, href: string): boolean {
  return HOMES.has(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}
