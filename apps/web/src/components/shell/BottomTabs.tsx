'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { MobileTab } from './mobile-tabs'
import { isActive } from './nav-items'

const BADGE_LABEL = { swap: '받은 교환 요청', proposal: '받은 휴가 변경 요청' } as const

// 3-12 모바일 아래 탭. 본문 뒤에 두어(DOM 순서) 데스크톱과 같은 글자를 먼저 잡지 않게 한다
export function BottomTabs({
  tabs,
  badges,
}: {
  tabs: MobileTab[]
  badges: { swap: number; proposal: number }
}) {
  const pathname = usePathname()
  return (
    <nav
      aria-label="아래 탭"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line-nav bg-surface pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))]"
    >
      {tabs.map((t) => {
        const active = isActive(pathname, t.href)
        const count = t.badge ? badges[t.badge] : 0
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center gap-0.5 text-[11px] ${
              active ? 'font-bold text-primary' : 'text-ink-3'
            }`}
          >
            <span aria-hidden className="text-lg leading-none">
              {t.icon}
            </span>
            {t.label}
            {t.badge && count > 0 && (
              <span
                aria-label={`${BADGE_LABEL[t.badge]} ${count}건`}
                className="absolute -top-0.5 left-[56%] rounded-full bg-danger px-1.5 text-[10px] font-bold text-white"
              >
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
