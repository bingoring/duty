// 3-7 의사 근무표 — 규칙·개수·검사기. 간호사 칸 검사기(checker/)와 섞지 않는다.
// 의사 근무: D 10:00–20:00 · N 20:00–익일 10:00 · O(휴무). 같은 날 D·N을 한 사람이 하면 올데이.
import { z } from 'zod'
import {
  addDays,
  dayOfWeek,
  daysInMonth,
  formatMD,
  isEmployed,
  monthDates,
  weekdayKo,
  type Employment,
  type IsoDate,
} from './dates'

export const DOCTOR_SLOTS = ['D', 'N'] as const
export type DoctorSlot = (typeof DOCTOR_SLOTS)[number]
export const DOCTOR_RULE_SHIFT_VALUES = ['D', 'N', 'ANY'] as const
export type DoctorFixedShift = (typeof DOCTOR_RULE_SHIFT_VALUES)[number]
export const DOCTOR_OPTION_VALUES = ['D', 'N', 'O', 'ALLDAY'] as const
export type DoctorOption = (typeof DOCTOR_OPTION_VALUES)[number]
export type DoctorDayState = DoctorOption

export const DOCTOR_TIMES = { D: '10:00 – 20:00', N: '20:00 – 익일 10:00' } as const
export const DOCTOR_OPTION_LABEL: Record<DoctorOption, string> = { D: 'D', N: 'N', O: 'O', ALLDAY: '올데이' }
export const DOCTOR_SHIFT_LABEL: Record<DoctorFixedShift, string> = { D: 'Day', N: 'Night', ANY: '근무' }

// ── 규칙(직군별 규칙 버전) ────────────────────────────────────────────
// 3-11 6/7: 규칙마다 필수(hard)·권고(soft)를 관리자가 고른다. 매일 D1·N1(DAILY)과 재직 기간은 늘 필수
export const DOCTOR_SEVERITY_VALUES = ['hard', 'soft'] as const
export type DoctorSeverity = (typeof DOCTOR_SEVERITY_VALUES)[number]
export const DOCTOR_SEVERITY_KEYS = ['COUNT', 'FIXED', 'ALLDAY_RANGE', 'REQUEST'] as const
export type DoctorSeverityKey = (typeof DOCTOR_SEVERITY_KEYS)[number]
const Severity = z.enum(DOCTOR_SEVERITY_VALUES)
export const DoctorSeverityMapSchema = z.object({
  COUNT: Severity,
  FIXED: Severity,
  ALLDAY_RANGE: Severity,
  REQUEST: Severity,
})
export type DoctorSeverityMap = z.infer<typeof DoctorSeverityMapSchema>
export const DEFAULT_DOCTOR_SEVERITY: DoctorSeverityMap = {
  COUNT: 'hard',
  FIXED: 'hard',
  ALLDAY_RANGE: 'soft',
  REQUEST: 'soft',
}

// 3-11 10: 금지 패턴 — 한 의사가 연속한 날에 하는 근무의 순서. 칸(슬롯) 기준이다:
//   D = 그 날 Day 칸을 한다(올데이 포함) · N = Night 칸을 한다(올데이 포함) · AD = 올데이(D·N 둘 다) · O = 근무 없음
// 예) N-N = 이틀 연속 Night 칸(올데이 날 포함), N-D = Night 다음 날 Day, AD-D = 올데이 다음 날 Day
export const DOCTOR_PATTERN_TOKENS = ['D', 'N', 'AD', 'O'] as const
export type DoctorPatternToken = (typeof DOCTOR_PATTERN_TOKENS)[number]
export const DOCTOR_PATTERN_TOKEN_LABEL: Record<DoctorPatternToken, string> = {
  D: 'D',
  N: 'N',
  AD: '올데이',
  O: 'O',
}
export const DOCTOR_PATTERN_MAX_LEN = 4
export const DoctorPatternSchema = z.object({
  pattern: z
    .array(z.enum(DOCTOR_PATTERN_TOKENS))
    .min(2, { message: '패턴은 2~4일로 정해 주세요.' })
    .max(DOCTOR_PATTERN_MAX_LEN, { message: '패턴은 2~4일로 정해 주세요.' })
    .refine((t) => t.some((x) => x !== 'O'), { message: 'O만으로 된 패턴은 쓸 수 없습니다.' }),
  severity: Severity,
})
export type DoctorPattern = z.infer<typeof DoctorPatternSchema>
export const patternLabel = (p: readonly DoctorPatternToken[]) =>
  p.map((t) => DOCTOR_PATTERN_TOKEN_LABEL[t]).join('-')
export const DEFAULT_DOCTOR_PATTERNS: DoctorPattern[] = [
  { pattern: ['AD', 'D'], severity: 'hard' },
  { pattern: ['AD', 'N'], severity: 'hard' },
  { pattern: ['N', 'N'], severity: 'hard' },
  // 예전 「Night 다음 날 Day」(권고)를 대신한다
  { pattern: ['N', 'D'], severity: 'soft' },
]

export const DoctorRuleParamsSchema = z
  .object({
    // 30일 달 기준 의사별 D·N 개수. 날짜 수와 맞지 않는 만큼은 ±1 대상(순환)이 채운다
    dPerMonth: z.number().int().min(1).max(31),
    nPerMonth: z.number().int().min(1).max(31),
    // 전월 며칠까지 신청, 며칠까지 조정
    requestDeadlineDay: z.number().int().min(1).max(31),
    negotiationEndDay: z.number().int().min(1).max(31),
    // 테스트 기간(2026-10-19 결정: 12월분 전까지)에는 끈다 — 끄면 간호사 「의사」 탭에 보이지 않고 의사 화면에 「테스트 기간」
    published: z.boolean(),
    // 3-11 6/7: 예전 버전에는 없다 → 기본값(지금까지의 동작)
    severity: DoctorSeverityMapSchema.default(DEFAULT_DOCTOR_SEVERITY),
    // 3-11 10: 예전 버전에는 없다 → 기본 패턴
    patterns: z.array(DoctorPatternSchema).max(12).default(DEFAULT_DOCTOR_PATTERNS),
  })
  .refine((p) => p.requestDeadlineDay <= p.negotiationEndDay, {
    message: '조정 마감은 신청 마감과 같거나 뒤여야 합니다.',
    path: ['negotiationEndDay'],
  })
  .refine((p) => new Set(p.patterns.map((x) => x.pattern.join('-'))).size === p.patterns.length, {
    message: '같은 금지 패턴이 두 번 있습니다.',
    path: ['patterns'],
  })
export type DoctorRuleParams = z.infer<typeof DoctorRuleParamsSchema>
export const DEFAULT_DOCTOR_RULES: DoctorRuleParams = {
  dPerMonth: 6,
  nPerMonth: 6,
  requestDeadlineDay: 20,
  negotiationEndDay: 25,
  published: false,
  severity: DEFAULT_DOCTOR_SEVERITY,
  patterns: DEFAULT_DOCTOR_PATTERNS,
}

// 3-11 6/7·10: 저장된 규칙 버전 읽기 — 예전 버전(공개 여부·필수/권고·금지 패턴 없음)은 기본값으로 채운다
export function readDoctorRuleParams(raw: unknown): DoctorRuleParams {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DoctorRuleParams>
  return {
    ...DEFAULT_DOCTOR_RULES,
    ...r,
    severity: { ...DEFAULT_DOCTOR_SEVERITY, ...(r.severity ?? {}) },
    patterns: Array.isArray(r.patterns) ? r.patterns : DEFAULT_DOCTOR_PATTERNS,
  }
}

// 전월 마감일·조정 마감일 (전월 말일을 넘으면 말일)
export function doctorPlanDates(year: number, month: number, p: DoctorRuleParams) {
  const py = month === 1 ? year - 1 : year
  const pm = month === 1 ? 12 : month - 1
  const last = daysInMonth(py, pm)
  const at = (d: number) =>
    `${py}-${String(pm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
  return { requestDeadline: at(p.requestDeadlineDay), negotiationEnd: at(p.negotiationEndDay) }
}

// ── 개인 조건 ──────────────────────────────────────────────────────
// 3-11 3: 격주 — 그 달의 몇째 주(일요일 시작, 1일이 든 주 = 1주)가 홀수/짝수인 주에만
export const DOCTOR_FIXED_CYCLES = ['weekly', 'odd', 'even'] as const
export type DoctorFixedCycle = (typeof DOCTOR_FIXED_CYCLES)[number]
export const DOCTOR_FIXED_CYCLE_LABEL: Record<DoctorFixedCycle, string> = {
  weekly: '매주',
  odd: '홀수 주',
  even: '짝수 주',
}
export const DoctorFixedRuleSchema = z.object({
  id: z.string().min(1).max(40),
  weekday: z.number().int().min(0).max(6),
  shift: z.enum(DOCTOR_RULE_SHIFT_VALUES),
  type: z.enum(['require', 'forbid']),
  enabled: z.boolean(),
  // 예전 조건에는 없다 → 매주
  cycle: z.enum(DOCTOR_FIXED_CYCLES).default('weekly'),
})
// 입력 타입: 저장된 예전 조건(cycle 없음)도 받는다
export type DoctorFixedRule = z.input<typeof DoctorFixedRuleSchema>

export const DoctorPrefsSchema = z
  .object({
    allDayMin: z.number().int().min(0).max(31).nullable(),
    allDayMax: z.number().int().min(0).max(31).nullable(),
    fixedRules: z.array(DoctorFixedRuleSchema).max(14),
  })
  .refine((p) => p.allDayMin === null || p.allDayMax === null || p.allDayMin <= p.allDayMax, {
    message: '최소는 최대보다 클 수 없습니다.',
    path: ['allDayMax'],
  })
export type DoctorPrefs = z.input<typeof DoctorPrefsSchema>
export const EMPTY_DOCTOR_PREFS: DoctorPrefs = { allDayMin: null, allDayMax: null, fixedRules: [] }

// 올데이 범위 프리셋 (S-D2): 없음 / 1~2 / 2~3 / 전부(D·N 개수만큼)
export function allDayPresets(perMonth: number) {
  return [
    { key: 'none', label: '없음', min: 0, max: 0 },
    { key: '1-2', label: '1~2개', min: 1, max: 2 },
    { key: '2-3', label: '2~3개', min: 2, max: 3 },
    { key: 'all', label: `전부 ${perMonth}`, min: perMonth, max: perMonth },
  ] as const
}

export function allDayRangeLabel(p: Pick<DoctorPrefs, 'allDayMin' | 'allDayMax'>): string {
  const { allDayMin: a, allDayMax: b } = p
  if (a === null && b === null) return '제한 없음'
  if (a === 0 && b === 0) return '없음'
  if (a === b) return `${a}개`
  return `${a ?? 0}~${b ?? '∞'}개`
}

export function fixedRuleLabel(
  r: Pick<DoctorFixedRule, 'weekday' | 'shift' | 'type'> & { cycle?: DoctorFixedCycle },
): string {
  const wd = ['일', '월', '화', '수', '목', '금', '토'][r.weekday]
  const cyc = r.cycle && r.cycle !== 'weekly' ? `${DOCTOR_FIXED_CYCLE_LABEL[r.cycle]} ` : ''
  return `${cyc}${wd}요일 ${DOCTOR_SHIFT_LABEL[r.shift]} ${r.type === 'require' ? '필수' : '금지'}`
}

// 3-11 3: 그 달의 몇째 주 — 일요일 시작, 1일이 든 주가 1주
export function weekOfMonth(iso: IsoDate): number {
  const first = `${iso.slice(0, 8)}01`
  return Math.floor((Number(iso.slice(8, 10)) - 1 + dayOfWeek(first)) / 7) + 1
}

export function cycleMatches(cycle: DoctorFixedCycle | undefined, iso: IsoDate): boolean {
  if (!cycle || cycle === 'weekly') return true
  return (weekOfMonth(iso) % 2 === 1) === (cycle === 'odd')
}

export type FixedOnDate = {
  date: IsoDate
  shift: DoctorFixedShift
  type: 'require' | 'forbid'
  label: string
}

// 켜진 고정 조건을 그 달 날짜로 펼친다. exceptions(그 날만 예외로 한 날)는 뺀다
export function expandFixedRules(
  rules: readonly DoctorFixedRule[],
  days: readonly IsoDate[],
  exceptions: ReadonlySet<IsoDate> = new Set(),
): FixedOnDate[] {
  const out: FixedOnDate[] = []
  for (const d of days) {
    if (exceptions.has(d)) continue
    for (const r of rules)
      if (r.enabled && dayOfWeek(d) === r.weekday && cycleMatches(r.cycle, d))
        out.push({ date: d, shift: r.shift, type: r.type, label: fixedRuleLabel(r) })
  }
  return out
}

// ── 하루 상태 ──────────────────────────────────────────────────────
export type DoctorShiftRow = { date: IsoDate; day: string | null; night: string | null }

export function dayState(
  row: Pick<DoctorShiftRow, 'day' | 'night'> | undefined,
  userId: string,
): DoctorDayState {
  const d = row?.day === userId
  const n = row?.night === userId
  return d && n ? 'ALLDAY' : d ? 'D' : n ? 'N' : 'O'
}

export function fixedSatisfied(state: DoctorDayState, f: Pick<FixedOnDate, 'shift' | 'type'>): boolean {
  const hasD = state === 'D' || state === 'ALLDAY'
  const hasN = state === 'N' || state === 'ALLDAY'
  const hit = f.shift === 'D' ? hasD : f.shift === 'N' ? hasN : hasD || hasN
  return f.type === 'require' ? hit : !hit
}

// 신청이 고정 조건과 부딪히는가 (S-D2: 저장 전 경고 → 그 날만 예외)
export function requestConflicts(
  options: readonly DoctorOption[],
  fixed: readonly Pick<FixedOnDate, 'shift' | 'type' | 'label'>[],
): string[] {
  if (options.length === 0) return []
  // 복수 옵션은 「or」: 하나라도 조건을 지키면 충돌이 아니다
  return fixed.filter((f) => options.every((o) => !fixedSatisfied(o, f))).map((f) => f.label)
}

// ── 개수(31일 달 ±1 대상 순환) ────────────────────────────────────────
export type DoctorExtras = { D: string[]; N: string[] }

// 3-11 8: 재직 기간(입사일~퇴사 예정일)에 든 그 달 날짜 수
export function employedDaysInMonth(year: number, month: number, e: Employment | undefined): number {
  if (!e) return daysInMonth(year, month)
  return monthDates(year, month).filter((d) => isEmployed(e, d)).length
}

// 3-11 8: 기준 개수 — 한 달 내내 재직이면 규칙 값, 아니면 재직 날짜 비율로 반올림
export function baseTarget(year: number, month: number, p: DoctorRuleParams, e?: Employment): DoctorTarget {
  const days = daysInMonth(year, month)
  const k = employedDaysInMonth(year, month, e)
  if (k >= days) return { D: p.dPerMonth, N: p.nPerMonth }
  return { D: Math.round((p.dPerMonth * k) / days), N: Math.round((p.nPerMonth * k) / days) }
}

// 날짜 수와 기준 개수의 차이 — 양수면 그만큼 +1 대상, 음수면 −1 대상이 필요하다
// 3-11 8: doctors에 의사별 기준 개수(재직 비율)를 주면 그 합으로 센다. 숫자면 모두 한 달 재직
export function extraNeeded(
  year: number,
  month: number,
  doctors: number | readonly DoctorTarget[],
  p: DoctorRuleParams,
) {
  const days = daysInMonth(year, month)
  const bases =
    typeof doctors === 'number'
      ? Array.from({ length: doctors }, () => ({ D: p.dPerMonth, N: p.nPerMonth }))
      : doctors
  return {
    D: days - bases.reduce((s, b) => s + b.D, 0),
    N: days - bases.reduce((s, b) => s + b.N, 0),
  }
}

// 기본 대상: 표 순서로 돌린다 — 직전에 대상이었던 마지막 사람 다음부터 D, 그다음 N
export function defaultExtras(
  order: readonly string[],
  need: { D: number; N: number },
  lastUsed: readonly string[],
): DoctorExtras {
  const n = order.length
  if (n === 0) return { D: [], N: [] }
  const lastIdx = Math.max(-1, ...lastUsed.map((id) => order.indexOf(id)))
  let cursor = (lastIdx + 1) % n
  const take = (k: number) => {
    const out: string[] = []
    for (let i = 0; i < Math.min(Math.abs(k), n); i++) {
      out.push(order[cursor]!)
      cursor = (cursor + 1) % n
    }
    return out
  }
  const D = take(need.D)
  const N = take(need.N)
  return { D, N }
}

export type DoctorTarget = { D: number; N: number }

// 3-11 8: bases(의사별 기준 개수)가 없으면 모두 규칙 값
export function monthTargets(
  ids: readonly string[],
  p: DoctorRuleParams,
  need: { D: number; N: number },
  extras: DoctorExtras,
  bases?: ReadonlyMap<string, DoctorTarget>,
): Map<string, DoctorTarget> {
  const sD = Math.sign(need.D)
  const sN = Math.sign(need.N)
  return new Map(
    ids.map((id) => {
      const b = bases?.get(id) ?? { D: p.dPerMonth, N: p.nPerMonth }
      return [
        id,
        {
          D: Math.max(0, b.D + (extras.D.includes(id) ? sD : 0)),
          N: Math.max(0, b.N + (extras.N.includes(id) ? sN : 0)),
        },
      ]
    }),
  )
}

// ── 검사기 ────────────────────────────────────────────────────────
export type DoctorCheckDoctor = {
  id: string
  name: string
  target: DoctorTarget
  allDayMin: number | null
  allDayMax: number | null
  fixed: readonly FixedOnDate[]
  requests?: readonly { date: IsoDate; options: readonly DoctorOption[] }[]
  // 3-11 8: 재직 기간 밖 날에는 근무할 수 없다(필수). 없으면 제한 없음
  employment?: Employment
}

export type DoctorViolation = {
  // NIGHT_TO_DAY는 예전 저장본 호환용 — 3-11부터는 금지 패턴(PATTERN) 「N-D」로 나온다
  rule: 'DAILY' | 'COUNT' | 'FIXED' | 'ALLDAY_RANGE' | 'REQUEST' | 'NIGHT_TO_DAY' | 'PATTERN' | 'EMPLOYMENT'
  userId?: string
  dates: IsoDate[]
  message: string
}

export type DoctorCheckResult = { hard: DoctorViolation[]; soft: DoctorViolation[] }

export type DoctorCheckInput = {
  year: number
  month: number
  doctors: readonly DoctorCheckDoctor[]
  shifts: readonly DoctorShiftRow[]
  // 'generate' = 생성안·확정(개수 필수), 'adjust' = 조정·교환(매일 D1·N1과 고정 조건만 필수, 개수는 권고)
  mode: 'generate' | 'adjust'
  // 예전 호출 호환: 전월 마지막 날 Night만. prevShifts가 있으면 그쪽을 쓴다
  prevLastNight?: string | null
  // 3-11 10: 전월 마지막 며칠(월초 금지 패턴 검사용)
  prevShifts?: readonly DoctorShiftRow[]
  // 3-11 6/7·10: 없으면 기본값
  severity?: DoctorSeverityMap
  patterns?: readonly DoctorPattern[]
}

// 3-11 10: 칸 기준 토큰 판정 (DoctorPatternToken 설명 참고)
export function patternTokenHit(tok: DoctorPatternToken, st: DoctorDayState): boolean {
  const hasD = st === 'D' || st === 'ALLDAY'
  const hasN = st === 'N' || st === 'ALLDAY'
  return tok === 'D' ? hasD : tok === 'N' ? hasN : tok === 'AD' ? st === 'ALLDAY' : st === 'O'
}

export function doctorCounts(shifts: readonly DoctorShiftRow[], id: string) {
  let D = 0
  let N = 0
  let allDay = 0
  for (const s of shifts) {
    if (s.day === id) D++
    if (s.night === id) N++
    if (s.day === id && s.night === id) allDay++
  }
  return { D, N, allDay }
}

// 3-7d: 생성 재검사·관리자 조정·교환 수락이 함께 쓰는 순수 함수
export function checkDoctorMonth(input: DoctorCheckInput): DoctorCheckResult {
  const hard: DoctorViolation[] = []
  const soft: DoctorViolation[] = []
  const days = monthDates(input.year, input.month)
  const byDate = new Map(input.shifts.map((s) => [s.date, s]))
  const known = new Set(input.doctors.map((d) => d.id))
  const label = (d: IsoDate) => `${formatMD(d)}(${weekdayKo(d)})`

  for (const d of days) {
    const r = byDate.get(d)
    const miss = [
      !r?.day || !known.has(r.day) ? 'Day' : null,
      !r?.night || !known.has(r.night) ? 'Night' : null,
    ]
      .filter(Boolean)
      .join('·')
    if (miss) hard.push({ rule: 'DAILY', dates: [d], message: `${label(d)} ${miss} 근무자가 없습니다` })
  }

  const sev = { ...DEFAULT_DOCTOR_SEVERITY, ...input.severity }
  const pick = (k: DoctorSeverityKey) => (sev[k] === 'hard' ? hard : soft)
  const patterns = input.patterns ?? DEFAULT_DOCTOR_PATTERNS
  const maxLen = Math.max(1, ...patterns.map((p) => p.pattern.length))
  // 전월 마지막 maxLen−1일: 행이 없으면 모르는 날(그 날이 든 창은 보지 않는다)
  const prevRows = new Map((input.prevShifts ?? []).map((r) => [r.date, r]))
  const first = days[0]!
  if (!input.prevShifts && input.prevLastNight)
    prevRows.set(addDays(first, -1), { date: addDays(first, -1), day: null, night: input.prevLastNight })
  const prevDays = Array.from({ length: maxLen - 1 }, (_, j) => addDays(first, -(maxLen - 1 - j)))

  for (const doc of input.doctors) {
    const c = doctorCounts(input.shifts, doc.id)
    for (const s of DOCTOR_SLOTS) {
      if (c[s] === doc.target[s]) continue
      const v: DoctorViolation = {
        rule: 'COUNT',
        userId: doc.id,
        dates: [],
        message: `${doc.name} · ${s === 'D' ? 'Day' : 'Night'} ${c[s]}개 · 목표 ${doc.target[s]}개`,
      }
      ;(input.mode === 'generate' ? pick('COUNT') : soft).push(v)
    }
    if (doc.employment) {
      const out = days.filter((d) => {
        const st = dayState(byDate.get(d), doc.id)
        return st !== 'O' && !isEmployed(doc.employment!, d)
      })
      if (out.length)
        hard.push({
          rule: 'EMPLOYMENT',
          userId: doc.id,
          dates: out,
          message: `${doc.name} · 재직 기간 밖 근무 ${out.map(label).join(', ')}`,
        })
    }
    for (const f of doc.fixed) {
      if (!byDate.has(f.date) && input.mode === 'adjust') continue
      if (!fixedSatisfied(dayState(byDate.get(f.date), doc.id), f))
        pick('FIXED').push({
          rule: 'FIXED',
          userId: doc.id,
          dates: [f.date],
          message: `${doc.name} · ${label(f.date)} · 고정 조건 「${f.label}」`,
        })
    }
    const lo = doc.allDayMin
    const hi = doc.allDayMax
    if ((lo !== null && c.allDay < lo) || (hi !== null && c.allDay > hi))
      pick('ALLDAY_RANGE').push({
        rule: 'ALLDAY_RANGE',
        userId: doc.id,
        dates: [],
        message: `${doc.name} · 올데이 ${c.allDay}개 · 선호 ${allDayRangeLabel({ allDayMin: lo, allDayMax: hi })}`,
      })
    for (const q of doc.requests ?? []) {
      if (!q.options.includes(dayState(byDate.get(q.date), doc.id)))
        pick('REQUEST').push({
          rule: 'REQUEST',
          userId: doc.id,
          dates: [q.date],
          message: `${doc.name} · ${label(q.date)} 신청 ${q.options.map((o) => DOCTOR_OPTION_LABEL[o]).join('/')} 미반영`,
        })
    }
    // 3-11 10: 금지 패턴 — 전월 며칠 + 이 달. 창이 이 달 날짜를 하나라도 품어야 센다
    const seq: { date: IsoDate; st: DoctorDayState | null; inMonth: boolean }[] = [
      ...prevDays.map((d) => ({
        date: d,
        st: prevRows.has(d) ? dayState(prevRows.get(d), doc.id) : null,
        inMonth: false,
      })),
      ...days.map((d) => ({ date: d, st: dayState(byDate.get(d), doc.id), inMonth: true })),
    ]
    for (const p of patterns) {
      const k = p.pattern.length
      for (let i = Math.max(0, prevDays.length - (k - 1)); i + k <= seq.length; i++) {
        const w = seq.slice(i, i + k)
        if (!w[k - 1]!.inMonth) continue
        if (!w.every((x, j) => x.st !== null && patternTokenHit(p.pattern[j]!, x.st))) continue
        const inMonth = w.filter((x) => x.inMonth).map((x) => x.date)
        ;(p.severity === 'hard' ? hard : soft).push({
          rule: 'PATTERN',
          userId: doc.id,
          dates: inMonth,
          message: `${doc.name} · ${label(w[0]!.date)}부터 금지 패턴 「${patternLabel(p.pattern)}」`,
        })
      }
    }
  }
  return { hard, soft }
}

// 교환·재배정: 두 칩(날짜·근무)의 주인을 맞바꾼다. 같은 칩이면 그대로
export type DoctorChip = { date: IsoDate; slot: DoctorSlot }

export function swapChips(
  shifts: readonly DoctorShiftRow[],
  a: DoctorChip,
  b: DoctorChip,
): DoctorShiftRow[] | null {
  const rows = shifts.map((s) => ({ ...s }))
  const ra = rows.find((r) => r.date === a.date)
  const rb = rows.find((r) => r.date === b.date)
  if (!ra || !rb) return null
  const key = (s: DoctorSlot): 'day' | 'night' => (s === 'D' ? 'day' : 'night')
  const ownerA = ra[key(a.slot)]
  const ownerB = rb[key(b.slot)]
  if (!ownerA || !ownerB || ownerA === ownerB) return null
  ra[key(a.slot)] = ownerB
  rb[key(b.slot)] = ownerA
  return rows
}

export function ownerOf(shifts: readonly DoctorShiftRow[], chip: DoctorChip): string | null {
  const r = shifts.find((s) => s.date === chip.date)
  return (chip.slot === 'D' ? r?.day : r?.night) ?? null
}
