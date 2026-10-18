// 3-7b 의사 근무표 읽기. 확정(CONFIRMED)된 달만 보인다 — 의사·간호사 모두(상호 공개)
import { DOCTOR_TIMES, monthDates, type IsoDate } from '@duty/domain'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema'
import {
  confirmedShifts,
  currentDoctorRules,
  findDoctorPlan,
  listDoctors,
  redHolidays,
  targetsFor,
  type Ym,
} from './core'
import { buildDoctorCalendar, type DoctorCalendar } from './view'

export type DoctorScheduleView = {
  year: number
  month: number
  title: string
  prev: string
  next: string
  confirmed: boolean
  badge: string | null
  calendar: DoctorCalendar
  doctors: { id: string; name: string }[]
  viewerId: string | null
  times: typeof DOCTOR_TIMES
}

const ymStr = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`
const shift = (ym: Ym, d: number) => {
  const t = ym.year * 12 + ym.month - 1 + d
  return ymStr(Math.floor(t / 12), (t % 12) + 1)
}

export async function loadDoctorSchedule(
  db: Db,
  a: Ym & { viewerId: string | null; today: IsoDate },
): Promise<DoctorScheduleView> {
  const plan = await findDoctorPlan(db, a)
  const confirmed = plan?.status === 'CONFIRMED'
  const all = await listDoctors(db, { includeInactive: true })
  const shifts = confirmed ? await confirmedShifts(db, plan.id) : []
  // 비활성 의사는 그 달 근무가 있을 때만 집계에 남긴다
  const inMonth = new Set(shifts.flatMap((s) => [s.day, s.night]))
  const doctors = all.filter((d) => d.active || inMonth.has(d.id)).map((d) => ({ id: d.id, name: d.name }))
  const days = monthDates(a.year, a.month)
  const hol = await redHolidays(db, days[0]!, days.at(-1)!)
  const { params } = await currentDoctorRules(db)
  const targets = plan
    ? targetsFor(
        a,
        doctors.map((d) => d.id),
        params,
        plan.extras,
      )
    : undefined
  let badge: string | null = null
  if (confirmed && plan.confirmedBy) {
    const [by] = await db.select({ name: users.name }).from(users).where(eq(users.id, plan.confirmedBy))
    badge = `확정 · 담당 ${by?.name ?? ''}`.trim()
  } else if (confirmed) badge = '확정'
  return {
    year: a.year,
    month: a.month,
    title: `${a.year}년 ${a.month}월 · 응급실 의사 근무표`,
    prev: shift(a, -1),
    next: shift(a, 1),
    confirmed,
    badge,
    calendar: buildDoctorCalendar({
      ...a,
      doctors,
      shifts,
      holidays: hol,
      viewerId: a.viewerId,
      targets,
      base: { D: params.dPerMonth, N: params.nPerMonth },
    }),
    doctors,
    viewerId: a.viewerId,
    times: DOCTOR_TIMES,
  }
}
