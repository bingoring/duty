import { DOCTOR_TIMES, formatMD, weekdayKo, type IsoDate } from '@duty/domain'
import { toWeeks, type DayRosters, type MyDay, type MyMonth, type RosterGroup, type TodayCard } from '../schedule/mobile'
import type { DoctorScheduleView } from './schedule'
import type { CalDay, CalPerson } from './view'

// 3-12 모바일 의사 근무표. 간호사와 같은 모양(내 달력·날짜별 명단·오늘 카드)으로 다시 묶는다(순수 함수)

const ALLDAY_TIME = '10:00 – 익일 10:00'
const KIND_LABEL = { D: 'D', N: 'N', ALLDAY: '올데이' } as const

function mine(c: CalDay, viewerId: string | null): 'D' | 'N' | 'ALLDAY' | null {
  if (!viewerId) return null
  const d = c.day?.id === viewerId
  const n = c.night?.id === viewerId
  return d && n ? 'ALLDAY' : d ? 'D' : n ? 'N' : null
}

const days = (v: DoctorScheduleView) => v.calendar.weeks.flat().filter((c): c is CalDay => c !== null)

export function doctorMyMonth(view: DoctorScheduleView): MyMonth {
  return toWeeks(
    days(view).map((c): MyDay => {
      const k = mine(c, view.viewerId)
      return {
        date: c.date,
        day: c.dom,
        red: c.red,
        today: c.today,
        chip: k === 'ALLDAY' ? 'allday' : k === 'D' ? 'd' : k === 'N' ? 'n' : null,
        label: k ? KIND_LABEL[k] : '',
      }
    }),
  )
}

export function doctorRosters(view: DoctorScheduleView): DayRosters {
  const p = (x: CalPerson) => ({ id: x.id, name: x.name, me: x.id === view.viewerId, note: '' })
  const out: DayRosters = {}
  for (const c of days(view)) {
    const groups: RosterGroup[] = []
    if (c.allDay && c.day) groups.push({ key: 'ALLDAY', label: '올데이', time: ALLDAY_TIME, people: [p(c.day)] })
    else {
      if (c.day) groups.push({ key: 'D', label: 'D', time: DOCTOR_TIMES.D, people: [p(c.day)] })
      if (c.night) groups.push({ key: 'N', label: 'N', time: DOCTOR_TIMES.N, people: [p(c.night)] })
    }
    out[c.date] = groups
  }
  return out
}

// 다음 근무는 그 달 안에서만(calendar.next) 찾는다
export function doctorTodayCard(view: DoctorScheduleView, today: IsoDate): TodayCard {
  const dateLabel = `오늘 ${formatMD(today)} (${weekdayKo(today)})`
  const cell = days(view).find((c) => c.date === today)
  if (!view.confirmed || !cell)
    return { dateLabel, code: '—', time: '', tomorrow: null, summary: null, empty: true }
  const k = mine(cell, view.viewerId)
  const next = view.calendar.next.find((s) => s.date > today)
  const me = view.calendar.tally.find((t) => t.me)
  return {
    dateLabel,
    code: k ? KIND_LABEL[k] : '쉼',
    time: k === 'ALLDAY' ? ALLDAY_TIME : k ? DOCTOR_TIMES[k] : '',
    tomorrow: next ? `다음 근무 ${next.label} ${KIND_LABEL[next.kind]}` : null,
    summary: me ? `이번 달 D ${me.D} · N ${me.N}` : null,
    empty: false,
  }
}
