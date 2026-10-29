import { SHIFT_TIMES, addDays, dayOfWeek, formatMD, weekdayKo, type IsoDate } from '@duty/domain'
import type { GridCellView, GridRow, ScheduleView } from './view'

// 3-12 모바일 근무표. 데스크톱 격자와 같은 ScheduleView를 내 달력·날짜별 명단·오늘 카드로 다시 묶는다(순수 함수)

export type MobileChip = 'd' | 'e' | 'n' | 's' | 'off' | 'leave' | 'allday'
export type MyDay = { date: IsoDate; day: number; red: boolean; today: boolean; chip: MobileChip | null; label: string }
// 일요일 시작, 앞뒤 빈칸 null
export type MyMonth = { weeks: (MyDay | null)[][] }
export type RosterPerson = { id: string; name: string; me: boolean; note: string }
export type RosterGroup = {
  key: 'D' | 'E' | 'N' | 'S' | 'ALLDAY' | 'OFF' | 'LEAVE'
  label: string
  time: string
  people: RosterPerson[]
}
export type DayRosters = Record<IsoDate, RosterGroup[]>
export type TodayCard = {
  dateLabel: string
  code: string
  time: string
  tomorrow: string | null
  summary: string | null
  empty: boolean
}

const withDay = (d: IsoDate) => `${formatMD(d)} (${weekdayKo(d)})`
const span = (code: 'D' | 'E' | 'N' | 'S') => `${SHIFT_TIMES[code].start}–${SHIFT_TIMES[code].end}`

export function toWeeks(days: MyDay[]): MyMonth {
  const weeks: (MyDay | null)[][] = []
  let week: (MyDay | null)[] = days.length ? Array.from({ length: dayOfWeek(days[0]!.date) }, () => null) : []
  for (const d of days) {
    week.push(d)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length) weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)])
  return { weeks }
}

const meRow = (v: ScheduleView) => v.rows.find((r) => r.kind === 'me')

export function myMonth(view: ScheduleView): MyMonth {
  const me = meRow(view)
  return toWeeks(
    view.days.map((d, i) => {
      const c = me?.cells[i]
      return {
        date: d.date,
        day: d.day,
        // 달력 숫자는 일요일·공휴일만 빨강(DayHead.red는 토요일도 포함)
        red: d.color === 'sun' || (d.red && d.color !== 'sat'),
        today: d.today,
        chip: c?.chip ?? null,
        label: c?.label ?? '',
      }
    }),
  )
}

const GROUPS: { key: RosterGroup['key']; chip: GridCellView['chip']; label: string; time: string }[] = [
  { key: 'D', chip: 'd', label: 'D', time: span('D') },
  { key: 'E', chip: 'e', label: 'E', time: span('E') },
  { key: 'N', chip: 'n', label: 'N', time: span('N') },
  { key: 'S', chip: 's', label: 'S', time: span('S') },
  { key: 'LEAVE', chip: 'leave', label: '휴가', time: '' },
  { key: 'OFF', chip: 'off', label: '쉬는 사람', time: '' },
]

function person(r: GridRow, c: GridCellView, key: RosterGroup['key']): RosterPerson {
  // 휴가는 종류 이름, 근무 칸은 「D검」처럼 칸 표시가 근무 이름과 다를 때만
  const note = key === 'LEAVE' || (key !== 'OFF' && c.label !== key) ? c.label : ''
  return { id: r.userId, name: r.name, me: r.kind === 'me', note }
}

export function dayRosters(view: ScheduleView): DayRosters {
  const out: DayRosters = {}
  view.days.forEach((d, i) => {
    out[d.date] = GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      time: g.time,
      people: view.rows.flatMap((r) => {
        const c = r.cells[i]
        return c && c.chip === g.chip ? [person(r, c, g.key)] : []
      }),
    })).filter((g) => g.people.length > 0)
  })
  return out
}

function tomorrowText(c: GridCellView | undefined): string | null {
  if (!c?.chip) return null
  if (c.chip === 'off' || c.chip === 'leave') return `내일 ${c.label}`
  const code = c.chip.toUpperCase() as 'D' | 'E' | 'N' | 'S'
  return `내일 ${c.label} ${SHIFT_TIMES[code].start}–`
}

function cellOn(v: ScheduleView | null, date: IsoDate): GridCellView | undefined {
  const me = v && meRow(v)
  return me?.cells.find((c) => c.date === date)
}

// cur = 오늘이 든 달, next = 다음 달(오늘이 말일일 때만 필요)
export function todayCard(a: { cur: ScheduleView; next: ScheduleView | null; today: IsoDate }): TodayCard {
  const dateLabel = `오늘 ${withDay(a.today)}`
  const cards = a.cur.cards
  if (!cards) return { dateLabel, code: '—', time: '', tomorrow: null, summary: null, empty: true }
  const tomorrow = addDays(a.today, 1)
  const c = cellOn(a.cur, tomorrow) ?? cellOn(a.next, tomorrow)
  return {
    dateLabel,
    code: cards.todayCode,
    time: cards.todayTime,
    tomorrow: tomorrowText(c),
    summary: `이번 달 OFF ${cards.offCount} · 누적 OFF ${cards.accText}`,
    empty: false,
  }
}
