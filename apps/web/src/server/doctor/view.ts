// 3-7b S-D1 의사 근무표 — 주 단위 달력 뷰 모델 (순수 함수, 서버 컴포넌트·조정 화면이 같이 쓴다)
import {
  DOCTOR_TIMES,
  dayOfWeek,
  doctorCounts,
  formatMD,
  monthDates,
  weekdayKo,
  type DoctorShiftRow,
  type DoctorTarget,
  type IsoDate,
} from '@duty/domain'

export type CalPerson = { id: string; name: string }
export type CalDay = {
  date: IsoDate
  dom: number
  dow: number
  red: boolean
  holiday: string | null
  today: boolean
  day: CalPerson | null
  night: CalPerson | null
  allDay: boolean
}
export type CalWeek = (CalDay | null)[]

export type DoctorTally = {
  id: string
  name: string
  D: number
  N: number
  allDay: number
  total: number
  extra: ('D +1' | 'N +1' | 'D −1' | 'N −1')[]
  me: boolean
}

export type NextShift = { date: IsoDate; label: string; kind: 'D' | 'N' | 'ALLDAY'; time: string }

export type DoctorCalendar = {
  weeks: CalWeek[]
  tally: DoctorTally[]
  next: NextShift[]
}

export function buildDoctorCalendar(a: {
  year: number
  month: number
  doctors: readonly CalPerson[]
  shifts: readonly DoctorShiftRow[]
  holidays: readonly { date: IsoDate; name: string }[]
  viewerId: string | null
  today: IsoDate
  targets?: ReadonlyMap<string, DoctorTarget>
  base?: DoctorTarget
}): DoctorCalendar {
  const names = new Map(a.doctors.map((d) => [d.id, d]))
  const person = (id: string | null) => (id ? (names.get(id) ?? { id, name: '?' }) : null)
  const byDate = new Map(a.shifts.map((s) => [s.date, s]))
  const hol = new Map(a.holidays.map((h) => [h.date, h.name]))
  const days = monthDates(a.year, a.month)
  const cells: CalDay[] = days.map((date, i) => {
    const r = byDate.get(date)
    const dow = dayOfWeek(date)
    return {
      date,
      dom: i + 1,
      dow,
      red: dow === 0 || hol.has(date),
      holiday: hol.get(date) ?? null,
      today: date === a.today,
      day: person(r?.day ?? null),
      night: person(r?.night ?? null),
      allDay: !!r?.day && r.day === r.night,
    }
  })
  const weeks: CalWeek[] = []
  let week: CalWeek = Array.from({ length: dayOfWeek(days[0]!) }, () => null)
  for (const c of cells) {
    week.push(c)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length) weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)])

  const tally = a.doctors.map((d) => {
    const c = doctorCounts(a.shifts, d.id)
    const t = a.targets?.get(d.id)
    const extra: DoctorTally['extra'] = []
    if (t && a.base) {
      if (t.D > a.base.D) extra.push('D +1')
      if (t.D < a.base.D) extra.push('D −1')
      if (t.N > a.base.N) extra.push('N +1')
      if (t.N < a.base.N) extra.push('N −1')
    }
    return { id: d.id, name: d.name, ...c, total: c.D + c.N, extra, me: d.id === a.viewerId }
  })

  const next: NextShift[] = []
  if (a.viewerId)
    for (const c of cells) {
      if (c.date < a.today || next.length >= 4) continue
      const d = c.day?.id === a.viewerId
      const n = c.night?.id === a.viewerId
      if (!d && !n) continue
      const kind = d && n ? 'ALLDAY' : d ? 'D' : 'N'
      next.push({
        date: c.date,
        label: `${formatMD(c.date)} (${weekdayKo(c.date)})`,
        kind,
        time: kind === 'ALLDAY' ? '10:00 – 익일 10:00' : DOCTOR_TIMES[kind],
      })
    }
  return { weeks, tally, next }
}
