import Link from 'next/link'
import { DoctorAdjustScreen } from '@/components/doctor/DoctorAdjustScreen'
import { requireDoctor } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { loadDoctorSchedule } from '@/server/doctor/schedule'
import { loadDoctorAdjust } from '@/server/doctor/swaps'
import { parseYm } from '@/server/schedule/month'
import { requestDevice } from '@/server/request-device'

type Sp = { ym?: string | string[]; hl?: string | string[] }

const navBtn =
  'flex h-7 w-7 items-center justify-center rounded-[7px] border border-line bg-surface text-sm hover:bg-panel'

// 3-7e 의사 근무 조정 — 의사: 칩 맞바꾸기 요청 · 관리자: 하단 도크로 칸 재배정·맞바꾸기 (의사 규칙만 검사)
export default async function DoctorAdjustPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const session = await requireDoctor()
  const today = await requestToday()
  const sp = await searchParams
  const { year, month } = parseYm(sp.ym, today)
  const actor = { id: session.user.id, role: session.user.role === 'admin' ? 'admin' : 'member' } as const
  // 3-12: 관리자 직접 편집은 휴대폰에서 PC 안내
  // 3-12 3차: 의사 관리자도 휴대폰에서 칸을 바꾼다(한 열 + 편집 도크는 아래 시트)
  const mobile = (await requestDevice()) === 'mobile'
  const db = getDb()
  const adjust = await loadDoctorAdjust(db, { year, month }, actor, today)
  const view = await loadDoctorSchedule(db, { year, month, viewerId: session.user.id, today })
  // 3-11 1: 강조(hl)는 의사 화면 사이를 따라다닌다
  const hl = typeof sp.hl === 'string' && view.doctors.some((d) => d.id === sp.hl) ? sp.hl : null
  const hlQ = hl ? `&hl=${hl}` : ''

  const header = (
    <div className="flex items-center gap-1.5">
      <Link href={`/doctor/adjust?ym=${view.prev}${hlQ}`} aria-label="이전 달" className={navBtn}>
        ‹
      </Link>
      <h1 className="text-xl font-bold tracking-[-0.02em] whitespace-nowrap">
        {year}년 {month}월 · 의사 근무 조정
      </h1>
      <Link href={`/doctor/adjust?ym=${view.next}${hlQ}`} aria-label="다음 달" className={navBtn}>
        ›
      </Link>
    </div>
  )

  if (!view.confirmed || !adjust.plan)
    return (
      <div className="flex min-w-0 flex-col gap-3 px-4 py-[18px]">
        <div className="flex items-center gap-3">{header}</div>
        <div className="rounded-card border border-line bg-surface px-6 py-16 text-center text-sm text-ink-2">
          확정된 근무표만 조정할 수 있습니다.
        </div>
      </div>
    )

  return (
    <DoctorAdjustScreen
      mobile={mobile}
      header={header}
      year={year}
      month={month}
      today={today}
      weeks={view.calendar.weeks}
      doctors={view.doctors}
      viewerId={session.user.id}
      admin={actor.role === 'admin'}
      marks={adjust.marks}
      colors={view.colors}
      origins={view.origins}
      highlight={hl}
      swaps={adjust.swaps}
    />
  )
}
