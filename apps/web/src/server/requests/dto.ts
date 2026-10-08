import {
  FAMILY_LEAVE_DAYS,
  OFFICIAL_LEAVE_REASONS,
  canNurseEditRequests,
  dayOfWeek,
  isRedDay,
  redDaySet,
  weekdayKo,
  type HolidayKind,
  formatMD,
  leaveDates,
  monthDates,
  offTarget,
  requestLabel,
  type LeaveType,
  type MonthPlanStatus,
  type RequestOption,
  type RequestSpecial,
  type RuleSet,
} from '@duty/domain'

// Build Spec 2-5 domain-entities §4 — 역할별 DTO. 코멘트·임시 신청은 서버에서 걸러 보낸다 (1-2 §8)

export type RawRequest = {
  userId: string
  date: string
  options: string[]
  special: string | null
  comment: string | null
  submittedAt: Date | null
}

export type RawLeave = {
  id: string
  userId: string
  type: LeaveType
  reasonCode: string | null
  startDate: string
  endDate: string
  days: number
  status: string
  comment: string | null
  rejectReason: string | null
  decidedAt: Date | null
}

export type PendingLeave = {
  id: string
  name: string
  monthLabel: string
  confirmedMonth: boolean
  kindLabel: string
  range: string
  days: number
  comment: string | null
  impact: string[] | null
  // 확정된 달 인원 영향이 있을 때 대체 후보 (핸드오프 v4 4a)
  candidates: string[]
  // 2-7 「승인 · 대체 지정」 → /adjust?ym=&focus=&shift=
  focus: { ym: string; date: string; shift: 'D' | 'E' | 'N' } | null
}

export type LeaveHistory = {
  name: string
  kindLabel: string
  status: 'APPROVED' | 'REJECTED'
  reason: string | null
  when: string
}

export type RequestsRaw = {
  year: number
  month: number
  today: string
  plan: {
    status: MonthPlanStatus
    requestDeadline: string
    negotiationStart: string
    negotiationEnd: string
  } | null
  users: { id: string; name: string; seniorityRank: number; head?: boolean }[]
  requests: RawRequest[]
  leaves: RawLeave[]
  // 확정된 달: 칸 코드(표시용)
  scheduled: { userId: string; date: string; label: string }[]
  rules: RuleSet
  viewerCard: {
    baseline: number
    offCarry: number
    nightBank: number
    weekendMissedLastMonth: boolean | null
  } | null
  pending: PendingLeave[]
  history: LeaveHistory[]
  holidays?: { date: string; kind: HolidayKind }[]
}

export type LeaveCell = {
  id: string
  type: LeaveType
  reasonCode: string | null
  status: string
  startDate: string
  endDate: string
  days: number
  kindLabel: string
  rejectReason?: string
}

export type RequestCellDTO = {
  date: string
  kind: 'shift' | 'leave' | null
  label: string
  options?: RequestOption[]
  special?: RequestSpecial
  hasComment: boolean
  comment?: string
  draft: boolean
  leave?: LeaveCell
  scheduled?: string
}

export type RequestRowDTO = {
  userId: string
  name: string
  me: boolean
  // 2-11 R-HEAD-2: 수간호사 행(OFF·D 하나만)
  head: boolean
  cells: RequestCellDTO[]
  count: number
}

export type RequestsView = {
  year: number
  month: number
  planStatus: MonthPlanStatus | null
  deadline: string | null
  negotiation: string | null
  editable: 'all' | 'leave' | 'none'
  isAdmin: boolean
  days: { date: string; day: number; weekday: string; red: boolean; color: 'sun' | 'sat' | 'plain' }[]
  rows: RequestRowDTO[]
  offCounts: Record<string, number>
  cards: {
    mineText: string
    offTargetText: string
    overTarget: boolean
    weekendText: string
    wardText: string
  } | null
  headerCounts: { requests: number; comments: number; pending: number }
  pending: PendingLeave[]
  history: LeaveHistory[]
  unsubmitted: number
}

const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: '연차',
  family: '경조사',
  sick: '병가',
  official: '공가',
  special: '특별휴가',
  checkup: '검진',
  founding: '개원기념 OFF',
}

export function leaveKindLabel(type: LeaveType, reasonCode: string | null): string {
  const base = LEAVE_LABEL[type]
  if (type === 'family' && reasonCode && reasonCode in FAMILY_LEAVE_DAYS)
    return `${base} · ${FAMILY_REASON_LABEL[reasonCode] ?? reasonCode}`
  if (type === 'official' && reasonCode && reasonCode in OFFICIAL_LEAVE_REASONS)
    return `${base} · ${OFFICIAL_LEAVE_REASONS[reasonCode as keyof typeof OFFICIAL_LEAVE_REASONS]}`
  return base
}

// 원문 §7 경조휴가 사유 (핸드오프 3b 드롭다운 문구)
export const FAMILY_REASON_LABEL: Record<string, string> = {
  self_marriage: '본인 결혼',
  child_marriage: '자녀 결혼',
  ancestor_birthday: '직계존속 회갑·칠순·팔순',
  spouse_childbirth: '배우자 출산',
  parent_death: '본인·배우자 부모 사망',
  grandparent_death: '부모 외 직계존속 사망',
  child_death: '자녀와 그 배우자 사망',
  sibling_death: '본인·배우자 형제자매 사망',
  uncle_aunt_death: '본인·배우자 백숙부모 사망',
  spouse_mourning_end: '배우자 탈상',
  ancestor_mourning_end: '직계존속 탈상',
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

export function buildRequestsView(
  r: RequestsRaw,
  viewer: { id: string; role: 'nurse' | 'admin' },
): RequestsView {
  const isAdmin = viewer.role === 'admin'
  const days = monthDates(r.year, r.month)
  const status = r.plan?.status ?? null
  const preGen = status === 'REQUESTING' || status === 'REQUEST_CLOSED'
  const editable: RequestsView['editable'] = !r.plan
    ? 'none'
    : isAdmin
      ? preGen
        ? 'all'
        : status === 'CONFIRMED'
          ? 'leave'
          : 'none'
      : canNurseEditRequests(status as MonthPlanStatus, r.plan.requestDeadline, r.today)
        ? 'all'
        : status === 'CONFIRMED'
          ? 'leave'
          : 'none'

  // 남의 임시 신청은 아무에게도, 남의 반려·임시 휴가도 보이지 않는다
  const visibleReq = r.requests.filter((q) => q.submittedAt || q.userId === viewer.id)
  const visibleLeave = r.leaves.filter((l) => {
    if (l.status === 'CANCELLED') return false
    if (l.status === 'DRAFT' || l.status === 'REJECTED') return l.userId === viewer.id
    return true
  })
  const reqAt = new Map(visibleReq.map((q) => [`${q.userId}|${q.date}`, q]))
  const leaveAt = new Map<string, RawLeave>()
  for (const l of visibleLeave)
    for (const d of leaveDates(l.startDate, l.endDate)) leaveAt.set(`${l.userId}|${d}`, l)
  const schedAt = new Map(r.scheduled.map((s) => [`${s.userId}|${s.date}`, s.label]))

  const users = [...r.users].sort(
    (a, b) =>
      Number(b.id === viewer.id) - Number(a.id === viewer.id) ||
      Number(!!b.head) - Number(!!a.head) ||
      a.seniorityRank - b.seniorityRank,
  )
  const rows: RequestRowDTO[] = users.map((u) => {
    const cells = days.map((date): RequestCellDTO => {
      const key = `${u.id}|${date}`
      const scheduled = schedAt.get(key)
      const l = leaveAt.get(key)
      if (l) {
        const mine = l.userId === viewer.id
        return {
          date,
          kind: 'leave',
          label: '휴',
          hasComment: !!l.comment,
          ...(l.comment && (mine || isAdmin) ? { comment: l.comment } : {}),
          draft: l.status === 'DRAFT',
          leave: {
            id: l.id,
            type: l.type,
            // 사유(경조·공가 세부)는 본인과 관리자만. 동료에게는 종류만(R-1, DECISIONS 2026-10-08)
            reasonCode: mine || isAdmin ? l.reasonCode : null,
            status: l.status,
            startDate: l.startDate,
            endDate: l.endDate,
            days: l.days,
            kindLabel: leaveKindLabel(l.type, mine || isAdmin ? l.reasonCode : null),
            ...(l.rejectReason && mine ? { rejectReason: l.rejectReason } : {}),
          },
          ...(scheduled ? { scheduled } : {}),
        }
      }
      const q = reqAt.get(key)
      if (!q)
        return {
          date,
          kind: null,
          label: '',
          hasComment: false,
          draft: false,
          ...(scheduled ? { scheduled } : {}),
        }
      const mine = q.userId === viewer.id
      return {
        date,
        kind: 'shift',
        label: requestLabel(
          q.options as RequestOption[],
          (q.special ?? undefined) as RequestSpecial | undefined,
        ),
        options: q.options as RequestOption[],
        ...(q.special ? { special: q.special as RequestSpecial } : {}),
        hasComment: !!q.comment,
        ...(q.comment && (mine || isAdmin) ? { comment: q.comment } : {}),
        draft: !q.submittedAt,
        ...(scheduled ? { scheduled } : {}),
      }
    })
    const count =
      r.requests.filter((q) => q.userId === u.id && q.submittedAt).length +
      r.leaves.filter((l) => l.userId === u.id && ['SUBMITTED', 'APPROVED'].includes(l.status)).length
    return { userId: u.id, name: u.name, me: u.id === viewer.id, head: !!u.head, cells, count }
  })

  // R-REQ-VIEW-3: 제출된 OFF 단일 신청 수
  const offCounts: Record<string, number> = {}
  const heads = new Set(r.users.filter((u) => u.head).map((u) => u.id))
  for (const q of r.requests)
    if (
      q.submittedAt &&
      !q.special &&
      q.options.length === 1 &&
      q.options[0] === 'OFF' &&
      !heads.has(q.userId)
    )
      offCounts[q.date] = (offCounts[q.date] ?? 0) + 1

  let cards: RequestsView['cards'] = null
  if (!isAdmin && r.viewerCard) {
    const mine = r.requests.filter((q) => q.userId === viewer.id)
    const byLabel = new Map<string, number>()
    for (const q of mine) {
      const l = requestLabel(
        q.options as RequestOption[],
        (q.special ?? undefined) as RequestSpecial | undefined,
      )
      byLabel.set(l, (byLabel.get(l) ?? 0) + 1)
    }
    const myLeaves = r.leaves.filter(
      (l) => l.userId === viewer.id && ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(l.status),
    ).length
    const parts = [...byLabel].map(([l, n]) => `${l} ${n}`)
    if (myLeaves) parts.push(`휴가 ${myLeaves}`)
    const c = r.viewerCard
    const sleeping = Math.floor(c.nightBank / r.rules.params.sleepingOffPerN)
    const target = offTarget({ ...c, sleepingOffPerN: r.rules.params.sleepingOffPerN })
    const offSingles = mine.filter(
      (q) => !q.special && q.options.length === 1 && q.options[0] === 'OFF',
    ).length
    const prev = r.month === 1 ? 12 : r.month - 1
    const crowded = Object.entries(offCounts)
      .filter(([, n]) => n >= 3)
      .map(([d]) => formatMD(d))
    cards = {
      mineText: `내 신청 ${mine.length + myLeaves}건${parts.length ? ` · ${parts.join(' · ')}` : ''}`,
      offTargetText: `${r.month}월 기준 OFF ${c.baseline} · 누적 ${signed(c.offCarry)} · 슬리핑오프 ${sleeping} → 목표 ${target}`,
      overTarget: offSingles > target,
      weekendText:
        c.weekendMissedLastMonth === null
          ? '주말 연휴 통 OFF: 지난달 기록 없음'
          : c.weekendMissedLastMonth
            ? `주말 연휴 통 OFF: 우선 대상 (${prev}월 미배정)`
            : `주말 연휴 통 OFF: ${prev}월 배정됨`,
      wardText: `병동 신청 ${r.requests.filter((q) => q.submittedAt).length}건${crowded.length ? ` · ${crowded.join(' · ')} OFF 3명 이상` : ''}`,
    }
  }

  const red = redDaySet(r.holidays ?? [])
  const dayHeads = days.map((date) => {
    const dow = dayOfWeek(date)
    const isRed = isRedDay(date, red)
    const color: 'sun' | 'sat' | 'plain' =
      dow === 0 || (isRed && dow !== 6) || (dow === 6 && red.has(date)) ? 'sun' : dow === 6 ? 'sat' : 'plain'
    return { date, day: Number(date.slice(8)), weekday: weekdayKo(date), red: isRed, color }
  })
  const submitted = r.requests.filter((q) => q.submittedAt)
  return {
    days: dayHeads,
    year: r.year,
    month: r.month,
    planStatus: status,
    deadline: r.plan?.requestDeadline ?? null,
    negotiation: r.plan ? `${formatMD(r.plan.negotiationStart)}–${formatMD(r.plan.negotiationEnd)}` : null,
    editable,
    isAdmin,
    rows,
    offCounts,
    cards,
    headerCounts: {
      requests: submitted.length,
      comments: submitted.filter((q) => q.comment).length,
      pending: r.pending.length,
    },
    pending: isAdmin ? r.pending : [],
    history: isAdmin ? r.history : [],
    unsubmitted:
      r.requests.filter((q) => q.userId === viewer.id && !q.submittedAt).length +
      r.leaves.filter((l) => l.userId === viewer.id && l.status === 'DRAFT').length,
  }
}
