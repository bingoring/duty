import { dayOfWeek, type IsoDate } from '@duty/domain'
import type { RequestsView } from './dto'

// 3-12 모바일 근무 신청: RequestsView(데스크톱 격자와 같은 데이터)를 달력·그날 동료 신청으로 다시 묶는다(순수 함수)

export type ReqMark = { label: string; kind: 'shift' | 'leave'; byAdmin: boolean; draft: boolean }
export type ReqDay = {
  date: IsoDate
  day: number
  red: boolean
  mine: ReqMark | null
  // 그날 쉬겠다고 신청한 사람 수(offCounts), 3 이상이면 hot(데스크톱 crowded와 같은 기준)
  rest: number
  hot: boolean
  // 그날 신청이 있는 사람 수(나 포함, 관리자 보기용)
  count: number
}
export type ReqMonth = { weeks: (ReqDay | null)[][] }
export type PeerRequest = {
  userId: string
  name: string
  label: string
  kind: 'shift' | 'leave'
  byAdmin: boolean
}

const CROWDED = 3

export function requestMonth(view: RequestsView): ReqMonth {
  const me = view.rows.find((r) => r.me)
  const days: ReqDay[] = view.days.map((d, i) => {
    const c = me?.cells[i]
    const rest = view.offCounts[d.date] ?? 0
    return {
      date: d.date,
      day: d.day,
      red: d.color === 'sun' || (d.red && d.color !== 'sat'),
      mine:
        c?.kind != null
          ? { label: c.label, kind: c.kind, byAdmin: !!(c.byAdmin || c.leave?.byAdmin), draft: c.draft }
          : null,
      rest,
      hot: rest >= CROWDED,
      count: view.rows.filter((r) => r.cells[i]?.kind != null).length,
    }
  })
  const weeks: (ReqDay | null)[][] = []
  let week: (ReqDay | null)[] = days.length
    ? Array.from({ length: dayOfWeek(days[0]!.date) }, () => null)
    : []
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

function others(view: RequestsView, exceptUserId: string, date: IsoDate): PeerRequest[] {
  return view.rows.flatMap((r) => {
    if (r.userId === exceptUserId) return []
    const c = r.cells.find((x) => x.date === date)
    if (!c?.kind || c.draft) return []
    return [
      {
        userId: r.userId,
        name: r.name,
        label: c.label,
        kind: c.kind,
        byAdmin: !!(c.byAdmin || c.leave?.byAdmin),
      },
    ]
  })
}

// 내 행을 뺀 그날 신청(남의 것은 제출된 것만 실려 온다)
export function peerRequests(view: RequestsView, date: IsoDate): PeerRequest[] {
  return others(view, view.rows.find((r) => r.me)?.userId ?? '', date)
}

// 데스크톱 신청 팝오버의 「같은 날」 문구: 고른 사람을 뺀 그날 신청(임시 저장 제외)
export function sameDayText(view: RequestsView, userId: string, date: IsoDate): string {
  return others(view, userId, date)
    .map((p) => `${p.name} ${p.label}`)
    .join(' · ')
}
