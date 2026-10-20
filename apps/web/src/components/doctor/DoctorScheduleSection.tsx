// 3-7b S-D1 의사 근무표 화면 본문 + 근무표 상단 「간호사 / 의사」 탭 (서버 컴포넌트)
import Link from 'next/link'
import { PrintButton } from '@/components/schedule/PrintButton'
import type { DoctorScheduleView } from '@/server/doctor/schedule'
import { DoctorCalendarGrid, DoctorSidePanel } from './DoctorCalendar'
import { DoctorHighlightChips, highlightHrefs } from './DoctorHighlight'

const navBtn =
  'flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm hover:bg-panel'

// 우측 h30 세그먼트. 활성 bg #1B1F1E 글자 #fff
export function GroupTabs({
  active,
  nurseHref,
  doctorHref,
}: {
  active: 'nurse' | 'doctor'
  nurseHref: string
  doctorHref: string
}) {
  const tab = (key: 'nurse' | 'doctor', label: string, href: string) => (
    <Link
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={`flex h-[30px] items-center px-3.5 text-[13px] font-semibold ${
        active === key ? 'bg-ink text-white' : 'bg-surface text-ink-2 hover:bg-panel'
      }`}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label="직군" className="flex overflow-hidden rounded-lg border border-line" data-print="hide">
      {tab('nurse', '간호사', nurseHref)}
      {tab('doctor', '의사', doctorHref)}
    </nav>
  )
}

export function DoctorScheduleSection({
  view,
  hrefOf,
  tabs,
  highlight,
}: {
  view: DoctorScheduleView
  // 달 이동·강조 링크 주소 (간호사 화면 탭이면 /?view=doctor&…)
  hrefOf: (q: { ym: string; hl?: string | null }) => string
  tabs: React.ReactNode
  highlight: string | null
}) {
  const ym = `${view.year}-${String(view.month).padStart(2, '0')}`
  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 py-[18px]">
      <h1 className="print-only text-sm font-bold">{view.title}</h1>
      <div className="flex items-center gap-3" data-print="hide">
        <div className="flex items-center gap-1.5">
          <Link href={hrefOf({ ym: view.prev, hl: highlight })} aria-label="이전 달" className={navBtn}>
            ‹
          </Link>
          <h1 className="text-xl font-bold tracking-[-0.02em]">{view.title}</h1>
          <Link href={hrefOf({ ym: view.next, hl: highlight })} aria-label="다음 달" className={navBtn}>
            ›
          </Link>
        </div>
        {view.testPeriod && !view.hidden && (
          <span className="rounded-full bg-warn-bg px-2 py-[3px] text-xs font-semibold text-warn-ink">
            테스트 기간 · 간호사에게 공개 전
          </span>
        )}
        {view.badge && (
          <span className="rounded-full bg-primary-soft px-2 py-[3px] text-xs font-semibold text-primary">
            {view.badge}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {tabs}
          <PrintButton />
        </div>
      </div>
      {view.hidden ? (
        <div className="rounded-card border border-line bg-surface px-6 py-16 text-center text-sm text-ink-2">
          의사 근무표는 아직 공개 전입니다(테스트 기간).
        </div>
      ) : !view.confirmed ? (
        <div className="rounded-card border border-line bg-surface px-6 py-16 text-center text-sm text-ink-2">
          {view.month}월 의사 근무표는 아직 확정되지 않았습니다.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-print="hide">
            {/* 3-11 1: 칩 색은 의사별 색 — 강조 칩의 색 점이 범례 */}
            <span className="font-bold">Day</span>
            <span className="text-ink-2">{view.times.D}</span>
            <span className="font-bold">Night</span>
            <span className="text-ink-2">{view.times.N}</span>
            <span className="ml-2 rounded-full border border-line bg-surface px-1.5 text-[10px] font-bold">
              올데이
            </span>
            <span className="text-ink-2">같은 날 Day·Night를 한 사람이</span>
            <span className="ml-auto">
              <DoctorHighlightChips
                doctors={view.doctors}
                viewerId={view.viewerId}
                highlight={highlight}
                colors={view.colors}
                hrefs={highlightHrefs(view.doctors, (hl) => hrefOf({ ym, hl }))}
              />
            </span>
          </div>
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <DoctorCalendarGrid
                month={view.month}
                weeks={view.calendar.weeks}
                viewerId={view.viewerId}
                highlight={highlight}
                colors={view.colors}
                origins={view.origins}
              />
            </div>
            <DoctorSidePanel cal={view.calendar} showNext={!!view.viewerId} />
          </div>
        </>
      )}
    </div>
  )
}
