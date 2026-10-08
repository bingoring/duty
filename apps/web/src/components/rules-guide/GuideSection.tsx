import type { GuideSection as Section, GuideTag, RulesGuide } from '@/server/rules/guide'

// Build Spec 2-10 frontend-components §2 — 1l 규칙 안내 (프로토타입 L904–937)
const TAG: Record<GuideTag, [string, string]> = {
  auto: ['자동 적용', 'bg-primary-soft text-primary'],
  rec: ['권고', 'bg-shift-d text-warn-ink'],
  info: ['안내', 'bg-line-soft text-ink-2'],
  off: ['사용 안 함', 'bg-line-soft text-ink-2'],
}
const SHIFT_BG = { D: 'bg-shift-d', E: 'bg-shift-e', N: 'bg-shift-n', S: 'bg-shift-s' } as const

export function ShiftCards({ shifts }: { shifts: RulesGuide['shifts'] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {shifts.map((s) => (
        <div key={s.code} className={`flex flex-col gap-1 rounded-xl p-4 text-ink ${SHIFT_BG[s.code]}`}>
          <span className="text-[26px] leading-none font-extrabold">{s.code}</span>
          <span className="text-[13px] font-semibold">{s.time}</span>
          <span className="text-xs">{s.desc}</span>
        </div>
      ))}
    </div>
  )
}

export function GuideSection({ section, children }: { section: Section; children?: React.ReactNode }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-h`} className="flex scroll-mt-6 flex-col gap-3">
      <h2 id={`${section.id}-h`} className="text-[22px] font-bold tracking-[-0.02em]">
        {section.title}
      </h2>
      {children}
      <ol className="rounded-xl border border-line bg-surface px-[18px] py-1.5 text-sm">
        {section.items.map((it, i) => (
          <li key={i} className="flex gap-3.5 border-b border-line-soft py-3 last:border-b-0">
            <span className="w-[22px] flex-none text-xs text-ink-3">{i + 1}</span>
            <div className="flex flex-1 flex-col gap-2 leading-normal">
              <span>{it.text}</span>
              {it.table && (
                <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px] text-ink-2 sm:max-w-[420px]">
                  {it.table.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt>{k}</dt>
                      <dd className="text-right font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <span
              className={`h-fit flex-none rounded-full px-2 py-[3px] text-[11px] font-bold whitespace-nowrap ${TAG[it.tag][1]}`}
            >
              {TAG[it.tag][0]}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
