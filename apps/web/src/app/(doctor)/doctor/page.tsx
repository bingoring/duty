import { DoctorScheduleSection, GroupTabs } from '@/components/doctor/DoctorScheduleSection'
import { ScheduleGrid } from '@/components/schedule/ScheduleGrid'
import { ScheduleHeader } from '@/components/schedule/ScheduleHeader'
import { ShiftTimesLegend } from '@/components/schedule/ShiftTimesLegend'
import { requireDoctor } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { loadDoctorSchedule } from '@/server/doctor/schedule'
import { loadMonthView } from '@/server/schedule/load'
import { parseYm } from '@/server/schedule/month'
import { buildScheduleView } from '@/server/schedule/view'
import { MobileSchedule } from '@/components/mobile/MobileSchedule'
import { doctorMyMonth, doctorRosters, doctorTodayCard } from '@/server/doctor/mobile'
import { requestDevice } from '@/server/request-device'
import { dayRosters } from '@/server/schedule/mobile'

type Sp = {
  ym?: string | string[]
  view?: string | string[]
  hl?: string | string[]
  tab?: string | string[]
  date?: string | string[]
}

// 3-7b S-D1 의사 근무표 (홈). 「간호사」 탭은 간호사 확정 근무표만 읽기 전용
export default async function DoctorSchedulePage({ searchParams }: { searchParams: Promise<Sp> }) {
  const session = await requireDoctor()
  const today = await requestToday()
  const sp = await searchParams
  const { year, month } = parseYm(sp.ym, today)
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const db = getDb()
  if ((await requestDevice()) === 'mobile') {
    // 3-12 모바일: 오늘 카드 + 내 근무 달력 / 전체(의사 날짜별 명단, 간호사표는 늘 보인다)
    const view = await loadDoctorSchedule(db, { year, month, viewerId: session.user.id, today })
    const todayYm = today.slice(0, 7)
    const todayView =
      todayYm === ym
        ? view
        : await loadDoctorSchedule(db, {
            year: Number(todayYm.slice(0, 4)),
            month: Number(todayYm.slice(5, 7)),
            viewerId: session.user.id,
            today,
          })
    const nurses = buildScheduleView(
      await loadMonthView(db, { year, month, viewerId: session.user.id, today }),
    )
    const date =
      typeof sp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date.startsWith(ym)
        ? sp.date
        : today.startsWith(ym)
          ? today
          : `${ym}-01`
    const tab = sp.tab === 'all' ? 'all' : 'mine'
    const q = (m: string, t: string) => `/doctor?ym=${m}${t === 'all' ? '&tab=all' : ''}`
    return (
      <MobileSchedule
        key={ym}
        title={`${month}월 근무표`}
        prevHref={q(view.prev, tab)}
        nextHref={q(view.next, tab)}
        card={doctorTodayCard(todayView, today)}
        mine={doctorMyMonth(view)}
        groups={[
          { key: 'doctor', label: '의사', rosters: doctorRosters(view) },
          { key: 'nurse', label: '간호사', rosters: dayRosters(nurses) },
        ]}
        tab={tab}
        date={date}
        mineHref={q(ym, 'mine')}
        allHref={`${q(ym, 'all')}&date=${date}`}
        footer={<ShiftTimesLegend />}
      />
    )
  }
  const tabs = (
    <GroupTabs
      active={sp.view === 'nurse' ? 'nurse' : 'doctor'}
      nurseHref={`/doctor?view=nurse&ym=${ym}`}
      doctorHref={`/doctor?ym=${ym}${typeof sp.hl === 'string' ? `&hl=${encodeURIComponent(sp.hl)}` : ''}`}
    />
  )
  if (sp.view === 'nurse') {
    const data = await loadMonthView(db, { year, month, viewerId: session.user.id, today })
    const view = buildScheduleView(data)
    return (
      <div className="flex min-w-0 flex-col gap-3 px-4 py-[18px]">
        <h1 className="print-only text-sm font-bold">{view.title}</h1>
        <ScheduleHeader view={view} hrefOf={(m) => `/doctor?view=nurse&ym=${m}`} tabs={tabs} />
        <ScheduleGrid view={view} />
        <ShiftTimesLegend />
      </div>
    )
  }
  const view = await loadDoctorSchedule(db, { year, month, viewerId: session.user.id, today })
  const hl = typeof sp.hl === 'string' && view.doctors.some((d) => d.id === sp.hl) ? sp.hl : null
  return (
    <DoctorScheduleSection
      view={view}
      tabs={tabs}
      highlight={hl}
      hrefOf={({ ym: m, hl: h }) => `/doctor?ym=${m}${h ? `&hl=${h}` : ''}`}
    />
  )
}
