import {
  SHIFT_TIMES,
  dayOfWeek,
  defaultPlanDates,
  formatMD,
  isRedDay,
  monthDates,
  redDaySet,
  weekdayKo,
  type IsoDate,
} from '@duty/domain'
import { shiftYm, ymOf } from './month'
import type { MonthViewData, RowBalance, ScheduleCellRow, ViewUser } from './types'

// Build Spec 2-3 domain-entities §2. 순수 함수 — 서버 컴포넌트가 그대로 렌더링한다

export type DayHead = {
  date: IsoDate
  day: number
  weekday: string
  red: boolean
  color: 'sun' | 'sat' | 'plain'
  // 핸드오프 v3 오늘 열 강조 — 보는 달이 이번 달일 때만
  today: boolean
}

export type GridCellView = {
  date: IsoDate
  label: string
  chip: 'd' | 'e' | 'n' | 's' | 'off' | 'leave' | null
  outline: 'admin' | 'swap' | 'requested' | null
  checkupHalf: boolean
  weekend: boolean
  today: boolean
  title: string
  // 2-6 생성안 미리보기: 권고 미충족 칸
  warn?: boolean
}

export type GridRow = {
  userId: string
  name: string
  kind: 'head' | 'me' | 'other'
  carryOff: string
  carryN: string
  cells: GridCellView[]
  accOff: string
  nLeft: string
  special: string
  checkup: string
  bo: string
}

export type SummaryCards = {
  todayLabel: string
  todayCode: string
  todayTime: string
  offCount: number
  baseline: number
  accText: string
  accNote: string
  bankBefore: number
  nights: number
  sleeping: number
  annual: number
  special: number
}

export type ScheduleView = {
  title: string
  prev: string
  next: string
  badge: { kind: 'confirmed' | 'closed'; text: string } | null
  nextMonthLink: { ym: string; text: string } | null
  empty: { text: string; adminLink?: string } | null
  days: DayHead[]
  rows: GridRow[]
  cards: SummaryCards | null
  footer: string
  gridTemplate: string
}

const KIND_LABEL: Record<string, string> = {
  sleeping: '슬리핑오프',
  edu_cont: '보수교육',
  edu_union: '노조교육',
  special: '특별휴가',
  founding: '개원오프',
  family: '경조휴가',
  sick: '병가',
  official: '공가',
}

const withDay = (d: IsoDate) => `${formatMD(d)} (${weekdayKo(d)})`
export const num = (n: number) => String(Math.round(n * 10) / 10)

// R-VIEW-10: 색 없이 부호. 음수는 U+2212
export function signed(n: number): string {
  const r = Math.round(n * 10) / 10
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0'
}

export function cellView(
  c: ScheduleCellRow | undefined,
  day: DayHead,
  notes: readonly string[] = [],
): GridCellView {
  const { date, red: weekend, today } = day
  if (!c)
    return {
      date,
      label: '',
      chip: null,
      outline: null,
      checkupHalf: false,
      weekend,
      today,
      title: withDay(date),
    }
  const leave = c.code === 'AL' || c.code === 'LEAVE'
  const label = c.code === 'OFF' ? 'off' : leave ? '휴' : c.code
  const chip = leave ? 'leave' : c.code === 'OFF' ? 'off' : (c.code.toLowerCase() as GridCellView['chip'])
  // 2-11 R-MARK-1·2: 관리자 수정 > 교환 > 신청 반영(휴가 칸 포함)
  const outline = c.source === 'admin' || c.source === 'swap' || c.source === 'requested' ? c.source : null
  const kind = KIND_LABEL[c.offKind ?? c.leaveKind ?? ''] ?? (c.code === 'AL' ? '연차' : undefined)
  const head = [withDay(date), label, kind, c.checkupHalf ? '검진 반차' : undefined]
    .filter(Boolean)
    .join(' · ')
  const fallback =
    outline === 'admin'
      ? '관리자 수정'
      : outline === 'swap'
        ? '교환 반영'
        : outline === 'requested'
          ? '신청 반영'
          : undefined
  // 첫 줄 = 날짜·표시·종류, 이후 줄 = 출처(R-TIP-1·2). 조회한 줄이 없으면 출처 이름만
  const lines = [head, ...(notes.length ? notes : fallback ? [fallback] : [])]
  return { date, label, chip, outline, checkupHalf: c.checkupHalf, weekend, today, title: lines.join('\n') }
}

// R-VIEW-2
function orderUsers(users: ViewUser[], viewerId: string): ViewUser[] {
  const heads = users.filter((u) => u.rotation === 'fixed_weekday')
  const viewer = users.find((u) => u.id === viewerId && u.rotation !== 'fixed_weekday')
  const rest = users.filter((u) => u.rotation !== 'fixed_weekday' && u !== viewer)
  return [...heads, ...(viewer ? [viewer] : []), ...rest]
}

function todayCard(c: ScheduleCellRow | null) {
  if (!c) return { todayCode: '—', todayTime: '' }
  if (c.code === 'OFF') return { todayCode: 'off', todayTime: '' }
  if (c.code === 'AL') return { todayCode: '연차', todayTime: '' }
  if (c.code === 'LEAVE') return { todayCode: '휴가', todayTime: '' }
  const t = SHIFT_TIMES[c.code]
  return { todayCode: c.code, todayTime: `${t.start}–${t.end}` }
}

function accNote(n: number): string {
  const r = Math.round(n * 10) / 10
  return r > 0 ? `다음 달 반납 ${r}` : r < 0 ? `다음 달 ${-r}일 더 받음` : '기준과 같음'
}

// 열 폭은 칩 크기(--chip, globals.css)의 배수다. 칩 20px이면 1c 수치(68·36·24·34px) 그대로이고,
// 화면이 넓으면 칩과 함께 커지며 날짜 열은 남는 폭을 나눠 채운다(사용자 요청 2026-10-07)
const col = (k: number) => `calc(var(--chip)*${k})`
function gridTemplate(days: number): string {
  return `${col(3.4)} ${col(1.8)} ${col(1.8)} repeat(${days},minmax(${col(1.2)},1fr)) ${Array(5).fill(col(1.7)).join(' ')}`
}

export function buildScheduleView(d: MonthViewData): ScheduleView {
  const ym = { year: d.year, month: d.month }
  const next = shiftYm(ym, 1)
  const dates = monthDates(d.year, d.month)
  const red = redDaySet(d.holidays)
  const days: DayHead[] = dates.map((date) => {
    const dow = dayOfWeek(date)
    const isRed = isRedDay(date, red)
    const color =
      dow === 0 || (isRed && dow !== 6) || (dow === 6 && red.has(date)) ? 'sun' : dow === 6 ? 'sat' : 'plain'
    return {
      date,
      day: Number(date.slice(8)),
      weekday: weekdayKo(date),
      red: isRed,
      color,
      today: date === d.today,
    }
  })

  const shown = d.preview || (d.plan && (d.plan.status === 'CONFIRMED' || d.plan.status === 'CLOSED'))
  const nextDates = d.nextPlan ?? defaultPlanDates(next.year, next.month, d.rules.params)
  const footer =
    `근무 신청 마감 매월 ${d.rules.params.requestDeadlineDay}일 · ` +
    `협의 수정 기간 ${formatMD(nextDates.negotiationStart)} – ${formatMD(nextDates.negotiationEnd)} (관리자 설정) · ` +
    '누적 off·잔여 N은 연말 정산 없이 계속 이월'
  const todayYm = d.today.slice(0, 7)
  const nextShown = d.nextPlan && (d.nextPlan.status === 'CONFIRMED' || d.nextPlan.status === 'CLOSED')

  const base = {
    title: `${d.year}년 ${d.month}월 · 응급실 근무표`,
    prev: ymOf(shiftYm(ym, -1)),
    next: ymOf(next),
    nextMonthLink:
      nextShown && todayYm === ymOf(ym) ? { ym: ymOf(next), text: `${next.month}월 근무표 확정됨` } : null,
    days,
    footer,
    gridTemplate: gridTemplate(dates.length),
  }

  if (!shown) {
    const empty: ScheduleView['empty'] = {
      text: `${d.year}년 ${d.month}월 근무표가 아직 확정되지 않았습니다.`,
    }
    if (d.viewerRole === 'admin' && d.plan?.status === 'DRAFTING') empty.adminLink = '/admin/generate'
    return { ...base, badge: null, empty, rows: [], cards: null }
  }

  const cellAt = new Map(d.cells.map((c) => [`${c.userId}|${c.date}`, c]))
  const rows: GridRow[] = orderUsers(d.users, d.viewerId).map((u) => {
    const b = d.balances.get(u.id) as RowBalance
    return {
      userId: u.id,
      name: u.name,
      kind: u.id === d.viewerId ? 'me' : u.rotation === 'fixed_weekday' ? 'head' : 'other',
      carryOff: num(b.offCarryBefore),
      carryN: num(b.nightBankBefore),
      cells: days.map((day) => {
        const v = cellView(cellAt.get(`${u.id}|${day.date}`), day, d.notes?.get(`${u.id}|${day.date}`))
        return d.preview?.warnCells.has(`${u.id}|${day.date}`) ? { ...v, warn: true } : v
      }),
      accOff: signed(b.offCarryAfter),
      nLeft: num(b.nightBankAfter),
      special: `${num(b.special)}/${b.foundingEligible ? num(b.founding) : '-'}`,
      checkup: num(b.checkup),
      bo: num(b.eduContThisYear),
    }
  })

  const mine = d.users.some((u) => u.id === d.viewerId) ? d.balances.get(d.viewerId) : undefined
  const cards: SummaryCards | null = mine
    ? {
        todayLabel: `오늘 ${withDay(d.today)}`,
        ...todayCard(d.todayCell),
        offCount: mine.actualOff,
        baseline: mine.baselineOff,
        accText: signed(mine.offCarryAfter),
        accNote: accNote(mine.offCarryAfter),
        bankBefore: mine.nightBankBefore,
        nights: mine.nightCount,
        sleeping: mine.sleepingOff,
        annual: mine.annual,
        special: mine.special,
      }
    : null

  if (d.preview)
    return {
      ...base,
      title: `${d.year}년 ${d.month}월 · 생성안`,
      badge: null,
      empty: null,
      rows,
      cards: null,
    }
  const who =
    d.plan!.status === 'CLOSED' ? (d.plan!.closedByName ?? d.plan!.confirmedByName) : d.plan!.confirmedByName
  const badge = {
    kind: d.plan!.status === 'CLOSED' ? ('closed' as const) : ('confirmed' as const),
    text: `${d.plan!.status === 'CLOSED' ? '마감' : '확정'}${who ? ` · 담당 ${who}` : ''}`,
  }
  return { ...base, badge, empty: null, rows, cards }
}
