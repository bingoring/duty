import Link from 'next/link'
import { formatMD, monthDates } from '@duty/domain'
import { DoctorGenerateScreen } from '@/components/doctor/DoctorGenerateScreen'
import { requireDoctorAdmin } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { redHolidays } from '@/server/doctor/core'
import { loadDoctorGenerate } from '@/server/doctor/generate'
import { loadDoctorColors } from '@/server/doctor/schedule'
import { buildDoctorCalendar } from '@/server/doctor/view'
import { parseYm, shiftYm } from '@/server/schedule/month'

const ymStr = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

// 3-7d S-D3 의사 듀티 생성 — 생성·리롤·±1 대상·검사 결과·확정(조기 배포). 기본은 다음 달
export default async function DoctorGeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[]; c?: string | string[]; hl?: string | string[] }>
}) {
  const session = await requireDoctorAdmin()
  const today = await requestToday()
  const sp = await searchParams
  const ym = typeof sp.ym === 'string' ? parseYm(sp.ym, today) : shiftYm(parseYm(undefined, today), 1)
  const db = getDb()
  const v = await loadDoctorGenerate(db, ym, typeof sp.c === 'string' ? sp.c : null)
  // 3-11 2: 공휴일도 주말과 같은 배경 · 3-11 1: 의사별 색 · 강조(hl)
  const days = monthDates(ym.year, ym.month)
  const holidays = await redHolidays(db, days[0]!, days.at(-1)!)
  const colors = await loadDoctorColors(db)
  const hl = typeof sp.hl === 'string' && v.doctors.some((d) => d.id === sp.hl) ? sp.hl : null
  const hlQ = hl ? `&hl=${hl}` : ''
  const cal = v.picked
    ? buildDoctorCalendar({
        ...ym,
        doctors: v.doctors,
        shifts: v.picked.shifts,
        holidays,
        viewerId: null,
        today,
      })
    : null
  const prev = shiftYm(ym, -1)
  const next = shiftYm(ym, 1)
  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 py-[18px]">
      <div className="flex items-center gap-2">
        <Link
          href={`/doctor/admin/generate?ym=${ymStr(prev.year, prev.month)}${hlQ}`}
          aria-label="이전 달"
          className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface"
        >
          ‹
        </Link>
        <h1 className="text-xl font-bold tracking-[-0.02em]">
          {ym.year}년 {ym.month}월 · 의사 듀티 생성
        </h1>
        <Link
          href={`/doctor/admin/generate?ym=${ymStr(next.year, next.month)}${hlQ}`}
          aria-label="다음 달"
          className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface"
        >
          ›
        </Link>
        <span className="ml-2 text-xs text-ink-2">
          신청 마감 {formatMD(v.plan.requestDeadline)} · 조정 ~{formatMD(v.plan.negotiationEnd)}
        </span>
      </div>
      <DoctorGenerateScreen
        key={`${v.plan.id}:${v.picked?.id ?? ''}:${v.plan.status}`}
        ym={ym}
        today={today}
        plan={{
          status: v.plan.status,
          negotiationEnd: v.plan.negotiationEnd,
          extras: v.plan.extras,
          confirmedCandidateId: v.plan.confirmedCandidateId,
          confirmedAt: v.plan.confirmedAt?.toISOString() ?? null,
        }}
        doctors={v.doctors.map((d) => ({ id: d.id, name: d.name }))}
        params={v.params}
        need={v.need}
        candidates={v.candidates.map((c) => ({ id: c.id, generationNo: c.generationNo }))}
        picked={
          v.picked ? { id: v.picked.id, generationNo: v.picked.generationNo, check: v.picked.check } : null
        }
        calendar={cal}
        colors={colors}
        highlight={hl}
        viewerId={session.user.id}
        requestCount={v.requestCount}
        fixedCount={v.fixedCount}
      />
    </div>
  )
}
