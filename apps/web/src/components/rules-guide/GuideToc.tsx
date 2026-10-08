'use client'

import { useEffect, useState } from 'react'

// 목차: 누르면 그 섹션으로, 스크롤하면 화면 위쪽에 걸린 섹션을 활성으로 (Build Spec 2-10 R-GUIDE-2)
export function GuideToc({ items }: { items: { id: string; title: string }[] }) {
  const [active, setActive] = useState(items[0]?.id)
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: '0px 0px -70% 0px' },
    )
    for (const i of items) {
      const el = document.getElementById(i.id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [items])
  return (
    <nav
      aria-label="규칙 목차"
      className="flex gap-0.5 overflow-x-auto text-[13px] max-[900px]:flex-row min-[900px]:sticky min-[900px]:top-6 min-[900px]:flex-col min-[900px]:self-start"
    >
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          aria-current={active === i.id ? 'true' : undefined}
          onClick={() => setActive(i.id)}
          className={`shrink-0 rounded-lg px-2.5 py-2 ${
            active === i.id ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-2 hover:bg-panel'
          }`}
        >
          {i.title}
        </a>
      ))}
    </nav>
  )
}
