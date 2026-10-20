import {
  CHECKUP_HALVES,
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
  LEAVE_TYPE_SHORT,
} from '@duty/domain'

// Build Spec 2-5 domain-entities §4 — 역할별 DTO. 코멘트·임시 신청은 서버에서 걸러 보낸다 (1-2 §8)

export type RawRequest = {
  userId: string
  date: string
  options: string[]
  special: string | null
  comment: string | null
  submittedAt: Date | null
  // 3-6: 관리자가 대신 넣은 신청
  byAdmin?: boolean
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
  // 3-9 14: 관리자가 대신 넣은 휴가
  byAdmin?: boolean
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
  // 3-6: 관리자가 처리 이력에서 승인을 취소한다
  id: string
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
  byAdmin?: boolean
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
  // 3-6: 관리자가 대신 넣은 신청 → 파란 외곽선
  byAdmin?: boolean
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
  // 3-6: 검진 오전·오후
  if (type === 'checkup' && reasonCode && reasonCode in CHECKUP_HALVES)
    return CHECKUP_HALVES[reasonCode as keyof typeof CHECKUP_HALVES]
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

// 3-10 10: 관리자가 넣은 신청·휴가는 간호사가 지우거나 바꾸지 못한다
export const ADMIN_ENTERED = '관리자가 넣은 신청입니다. 바꾸려면 수간호사에게 요청해 주세요.'

// 3-10 1: 간호사 본인이 D·E·N을 신청한 칸이면 관리자가 넣을 수 있는 근무(신청 근무 + OFF). 아니면 null
export function nurseShiftAsk(
  q: { options: readonly string[]; special?: string | null; byAdmin?: boolean } | null | undefined,
): RequestOption[] | null {
  if (!q || q.byAdmin || q.special) return null
  if (!q.options.some((o) => o === 'D' || o === 'E' || o === 'N')) return null
  return [...new Set([...(q.options as RequestOption[]), 'OFF' as const])]
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

export function buildRequestsView(
  r: RequestsRaw,
  viewer: { id: string; role: 'nurse' | 'admin' },
): RequestsView {
  const isAdmin = viewer.role === 'admin'
  const days = monthDates(r.year, r.month)
  const status = r.plan?.status ?? null
  // 3-8: 확정 전(생성안 검토 중 포함)까지 신청을 고칠 수 있다
  const preGen = status === 'REQUESTING' || status === 'REQUEST_CLOSED' || status === 'DRAFTING'
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

  // 2026-10-09 변경: 수간호사 맨 위 고정, 나머지는 연차 순(내 행은 제자리에서 강조)
  const users = [...r.users].sort(
    (a, b) => Number(!!b.head) - Number(!!a.head) || a.seniorityRank - b.seniorityRank,
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
          // 3-6: 종류 이름(검진은 오전/오후)
          label: LEAVE_TYPE_SHORT[l.type] ?? '휴가',
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
            ...(l.byAdmin ? { byAdmin: true } : {}),
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
        ...(q.byAdmin ? { byAdmin: true } : {}),
        ...(scheduled ? { scheduled } : {}),
      }
    })
    const count =
      r.requests.filter((q) => q.userId === u.id && q.submittedAt).length +
      r.leaves.filter((l) => l.userId === u.id && ['SUBMITTED', 'APPROVED'].includes(l.status)).length
    return { userId: u.id, name: u.name, me: u.id === viewer.id, head: !!u.head, cells, count }
  })

  // R-REQ-VIEW-3: 제출된 OFF 단일 신청 수.
  // 3-10 4: 쉬는 인원 = OFF 단일 + 휴가(제출·승인). 같은 날 한 사람은 한 번만, 수간호사 제외
  const resting = new Map<string, Set<string>>()
  const heads = new Set(r.users.filter((u) => u.head).map((u) => u.id))
  const inMonth = new Set(days)
  const rest = (date: string, userId: string) => {
    if (heads.has(userId) || !inMonth.has(date)) return
    if (!resting.has(date)) resting.set(date, new Set())
    resting.get(date)!.add(userId)
  }
  for (const q of r.requests)
    if (q.submittedAt && !q.special && q.options.length === 1 && q.options[0] === 'OFF')
      rest(q.date, q.userId)
  for (const l of r.leaves)
    if (l.status === 'SUBMITTED' || l.status === 'APPROVED')
      for (const d of leaveDates(l.startDate, l.endDate)) rest(d, l.userId)
  const offCounts: Record<string, number> = Object.fromEntries([...resting].map(([d, s]) => [d, s.size]))

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
      wardText: `병동 신청 ${r.requests.filter((q) => q.submittedAt).length}건${crowded.length ? ` · ${crowded.join(' · ')} 쉬는 인원 3명 이상` : ''}`,
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
