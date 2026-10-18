import type { CellSource, LeaveType, RequestSpecial } from './allowed-sets'
import { optionsSatisfied, specialSatisfied } from './cell-source'
import type { CheckResult } from './checker'
import { formatViolation, type FormatContext } from './checker/format'
import { addDays, formatMD, isEmployed, isRedDay, monthDates, type IsoDate } from './dates'
import { leaveDates } from './requests'
import type { RuleSet } from './rules-defaults'
import type { GridCell, NurseProfile, RequestEntry, ScheduleInput } from './types'

// Build Spec 2-6 domain-entities §3 — 생성의 고정 칸과 1i 검사 결과 요약

export type FixedCell = Pick<GridCell, 'code' | 'offKind' | 'leaveKind'>

// 승인 휴가 → 칸 (2-5 확정된 달 승인과 같은 변환). 검진 반차는 코드를 고정하지 않는다
export function leaveToCell(type: LeaveType): FixedCell | null {
  switch (type) {
    case 'annual':
      return { code: 'AL' }
    case 'special':
      return { code: 'OFF', offKind: 'special' }
    case 'founding':
      return { code: 'OFF', offKind: 'founding' }
    case 'checkup':
      return null
    default:
      return { code: 'LEAVE', leaveKind: type }
  }
}

export function specialToCell(special: RequestSpecial): FixedCell {
  switch (special) {
    case 'AL':
      return { code: 'AL' }
    case 'EDU_CONT':
      return { code: 'OFF', offKind: 'edu_cont' }
    case 'EDU_UNION':
      return { code: 'OFF', offKind: 'edu_union' }
  }
}

export type ApprovedLeave = { userId: string; type: LeaveType; startDate: IsoDate; endDate: IsoDate }
export type SpecialRequest = { userId: string; date: IsoDate; special: RequestSpecial }

// 우선순위: 승인 휴가 > 특수 신청. 대상 월·재직일 밖은 버린다
export function fixedCells(a: {
  days: readonly IsoDate[]
  nurses: readonly NurseProfile[]
  leaves: readonly ApprovedLeave[]
  specials: readonly SpecialRequest[]
}): { fixed: Map<string, Map<IsoDate, FixedCell>>; checkupDates: Map<string, Set<IsoDate>> } {
  const byId = new Map(a.nurses.map((n) => [n.id, n]))
  const month = new Set(a.days)
  const fixed = new Map<string, Map<IsoDate, FixedCell>>()
  const checkupDates = new Map<string, Set<IsoDate>>()
  const ok = (userId: string, d: IsoDate) => {
    const n = byId.get(userId)
    return n !== undefined && month.has(d) && isEmployed(n, d)
  }
  const put = (userId: string, d: IsoDate, c: FixedCell) => {
    if (!fixed.has(userId)) fixed.set(userId, new Map())
    if (!fixed.get(userId)!.has(d)) fixed.get(userId)!.set(d, c)
  }
  for (const l of a.leaves)
    for (const d of leaveDates(l.startDate, l.endDate)) {
      if (!ok(l.userId, d)) continue
      const c = leaveToCell(l.type)
      if (c) put(l.userId, d, c)
      else {
        if (!checkupDates.has(l.userId)) checkupDates.set(l.userId, new Set())
        checkupDates.get(l.userId)!.add(d)
      }
    }
  for (const s of a.specials) if (ok(s.userId, s.date)) put(s.userId, s.date, specialToCell(s.special))
  return { fixed, checkupDates }
}

// 수간호사(fixed_weekday): 빨간 날 OFF, 그 외 S(2-11 R-HEAD-1). 승인 휴가·특수 신청 > 본인 D 신청 > 본인 OFF 신청.
// 기본 S 칸은 솔버가 필수 인원을 달리 채울 수 없을 때만 D로 바꾼다(R-HEAD-3, 입력의 flex)
export function headCells(
  n: NurseProfile,
  days: readonly IsoDate[],
  red: ReadonlySet<IsoDate>,
  over: {
    fixed: ReadonlyMap<IsoDate, FixedCell>
    offRequests: ReadonlySet<IsoDate>
    dRequests?: ReadonlySet<IsoDate>
  },
): GridCell[] {
  return days
    .filter((d) => isEmployed(n, d))
    .map((d) => {
      const f = over.fixed.get(d)
      const base = { userId: n.id, date: d, checkupHalf: false }
      if (f) return { ...base, ...strip(f) }
      if (over.dRequests?.has(d)) return { ...base, code: 'D' as const }
      if (isRedDay(d, red) || over.offRequests.has(d))
        return { ...base, code: 'OFF' as const, offKind: 'regular' as const }
      return { ...base, code: 'S' as const }
    })
}

const strip = (f: FixedCell): FixedCell => {
  const out: FixedCell = { code: f.code }
  if (f.offKind) out.offKind = f.offKind
  if (f.leaveKind) out.leaveKind = f.leaveKind
  return out
}

// 검사기 H-NIGHT-MAX·S-NIGHT-TARGET과 같은 판정 (솔버 입력용)
export function nightLimits(
  n: NurseProfile,
  rules: RuleSet,
  year: number,
  month: number,
): { max: number; target: number | null; dedicated: boolean } {
  const days = monthDates(year, month)
  const p = rules.params
  const dedicated =
    rules.toggles.nightDedicated &&
    n.nightDedicated !== null &&
    n.nightDedicated.from <= days.at(-1)! &&
    n.nightDedicated.to >= days[0]!
  if (dedicated)
    return {
      max: days.length === 31 ? p.nightDedicatedMaxPerMonth31 : p.nightDedicatedMaxPerMonth,
      target: null,
      dedicated,
    }
  return { max: p.maxNightPerMonth, target: p.targetNightPerMonth, dedicated }
}

// 3-5 추가: 월 나이트 최소(S-NIGHT-MIN). 근무할 수 있는 날(재직일 − 연차·휴가 칸)이 적으면 비례해 줄인다(내림).
// 0이면·야간 전담이면 null. 트레이닝 중 신규 제외는 부르는 쪽(검사기·솔버 입력)이 정한다
export function nightMinFor(
  n: NurseProfile,
  rules: RuleSet,
  year: number,
  month: number,
  leaveDays: number,
): number | null {
  const min = rules.params.minNightPerMonth
  if (!min || nightLimits(n, rules, year, month).dedicated) return null
  const days = monthDates(year, month)
  const available = Math.max(0, days.filter((d) => isEmployed(n, d)).length - leaveDays)
  return Math.floor((min * available) / days.length)
}

// 후보 칸 출처: 고정 칸·충족한 신청 = requested (빨간 외곽선), 그 외 auto
export function generatedCellSource(
  cell: GridCell,
  request: RequestEntry | undefined,
  isFixed: boolean,
): CellSource {
  const requested = request?.byAdmin ? 'admin' : 'requested'
  if (isFixed) return requested
  if (!request) return 'auto'
  const ok = request.special
    ? specialSatisfied(cell, request.special)
    : optionsSatisfied(cell, request.options)
  return ok ? requested : 'auto'
}

export type GenerationCheck = { ok: boolean; title: string; detail: string }

// 1i 우측 검사 결과 리스트: 통과 항목(인원·신청) → 권고 미충족(formatViolation)
export function generationChecks(
  result: CheckResult,
  input: Pick<ScheduleInput, 'year' | 'month' | 'rules' | 'requests'>,
  ctx: FormatContext,
): GenerationCheck[] {
  const days = monthDates(input.year, input.month)
  const p = input.rules.params
  const headFill = result.softWarnings.filter((v) => v.ruleId === 'S-HEAD-FILL').length
  // 3-5: 인원 규칙을 권고로 낮췄으면 부족이 경고 쪽에 있다
  const staffBad = [...result.hardViolations, ...result.softWarnings].some(
    (v) => v.ruleId === 'H-STAFF' || v.ruleId === 'H-KTASS',
  )
  const out: GenerationCheck[] = []
  if (!staffBad)
    out.push({
      ok: true,
      title: `모든 듀티 인원 ${p.minStaffPerShift}명 이상${p.minKTass > 0 ? ` · KTAS ${p.minKTass}명 포함` : ''}`,
      detail: `${formatMD(days[0]!)}~${days.length} D·E·N ${days.length * 3}개 듀티 전부 충족${
        headFill ? ` · 수간호사 보충 ${headFill}개` : ''
      }`,
    })
  const total = input.requests.length
  if (total > 0) {
    const missed =
      result.softWarnings.filter((v) => v.ruleId === 'S-REQUEST').length +
      result.hardViolations.filter((v) => v.ruleId === 'H-SPECIAL-REQ').length
    const multi = input.requests.filter((r) => r.options.length > 1).length
    out.push(
      missed === 0
        ? {
            ok: true,
            title: `신청 ${total}건 전부 반영`,
            detail: multi ? `복수 옵션 ${multi}건 포함` : '',
          }
        : {
            ok: false,
            title: `신청 ${total}건 중 ${total - missed}건 반영`,
            detail: `불충족 ${missed}건은 아래 목록`,
          },
    )
  }
  // 날짜순(날짜 없는 항목은 뒤), 같은 날은 규칙 ID순
  const key = (v: { dates: IsoDate[]; ruleId: string }) => `${v.dates[0] ?? '9999'}|${v.ruleId}`
  const listed = [...result.hardViolations, ...result.softWarnings].sort((a, b) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0,
  )
  for (const v of listed) {
    const f = formatViolation(v, ctx)
    out.push({ ok: false, ...f })
  }
  return out
}

// 3-8 H-OFF-EVE: OFF만 신청한 날의 전날(대상 월 안)에는 N을 주지 않는다. 전날 신청에 N이 있으면 예외.
// 검사기와 솔버 입력이 같은 날짜를 쓴다
export function offEveNoNightDates(
  requests: readonly RequestEntry[],
  userId: string,
  inMonth: (d: IsoDate) => boolean,
): IsoDate[] {
  const mine = new Map(requests.filter((r) => r.userId === userId).map((r) => [r.date, r]))
  const out: IsoDate[] = []
  for (const r of mine.values()) {
    if (r.special || r.options.length !== 1 || r.options[0] !== 'OFF') continue
    const eve = addDays(r.date, -1)
    if (!inMonth(eve) || mine.get(eve)?.options.includes('N')) continue
    out.push(eve)
  }
  return out.sort()
}
