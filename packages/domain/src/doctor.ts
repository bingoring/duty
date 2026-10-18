// 3-7 의사 근무표 — 규칙·개수·검사기. 간호사 칸 검사기(checker/)와 섞지 않는다.
// 의사 근무: D 10:00–20:00 · N 20:00–익일 10:00 · O(휴무). 같은 날 D·N을 한 사람이 하면 올데이.
import { z } from 'zod'
import { dayOfWeek, daysInMonth, formatMD, monthDates, weekdayKo, type IsoDate } from './dates'

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
export const DoctorRuleParamsSchema = z
  .object({
    // 30일 달 기준 의사별 D·N 개수. 날짜 수와 맞지 않는 만큼은 ±1 대상(순환)이 채운다
    dPerMonth: z.number().int().min(1).max(31),
    nPerMonth: z.number().int().min(1).max(31),
    // 전월 며칠까지 신청, 며칠까지 조정
    requestDeadlineDay: z.number().int().min(1).max(31),
    negotiationEndDay: z.number().int().min(1).max(31),
  })
  .refine((p) => p.requestDeadlineDay <= p.negotiationEndDay, {
    message: '조정 마감은 신청 마감과 같거나 뒤여야 합니다.',
    path: ['negotiationEndDay'],
  })
export type DoctorRuleParams = z.infer<typeof DoctorRuleParamsSchema>
export const DEFAULT_DOCTOR_RULES: DoctorRuleParams = {
  dPerMonth: 6,
  nPerMonth: 6,
  requestDeadlineDay: 20,
  negotiationEndDay: 25,
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
export const DoctorFixedRuleSchema = z.object({
  id: z.string().min(1).max(40),
  weekday: z.number().int().min(0).max(6),
  shift: z.enum(DOCTOR_RULE_SHIFT_VALUES),
  type: z.enum(['require', 'forbid']),
  enabled: z.boolean(),
})
export type DoctorFixedRule = z.infer<typeof DoctorFixedRuleSchema>

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
export type DoctorPrefs = z.infer<typeof DoctorPrefsSchema>
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

export function fixedRuleLabel(r: Pick<DoctorFixedRule, 'weekday' | 'shift' | 'type'>): string {
  const wd = ['일', '월', '화', '수', '목', '금', '토'][r.weekday]
  return `${wd}요일 ${DOCTOR_SHIFT_LABEL[r.shift]} ${r.type === 'require' ? '필수' : '금지'}`
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
      if (r.enabled && dayOfWeek(d) === r.weekday)
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

// 날짜 수와 기준 개수의 차이 — 양수면 그만큼 +1 대상, 음수면 −1 대상이 필요하다
export function extraNeeded(year: number, month: number, doctorCount: number, p: DoctorRuleParams) {
  const days = daysInMonth(year, month)
  return { D: days - doctorCount * p.dPerMonth, N: days - doctorCount * p.nPerMonth }
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

export function monthTargets(
  ids: readonly string[],
  p: DoctorRuleParams,
  need: { D: number; N: number },
  extras: DoctorExtras,
): Map<string, DoctorTarget> {
  const sD = Math.sign(need.D)
  const sN = Math.sign(need.N)
  return new Map(
    ids.map((id) => [
      id,
      {
        D: p.dPerMonth + (extras.D.includes(id) ? sD : 0),
        N: p.nPerMonth + (extras.N.includes(id) ? sN : 0),
      },
    ]),
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
}

export type DoctorViolation = {
  rule: 'DAILY' | 'COUNT' | 'FIXED' | 'ALLDAY_RANGE' | 'REQUEST' | 'NIGHT_TO_DAY'
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
  prevLastNight?: string | null
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
      ;(input.mode === 'generate' ? hard : soft).push(v)
    }
    for (const f of doc.fixed) {
      if (!byDate.has(f.date) && input.mode === 'adjust') continue
      if (!fixedSatisfied(dayState(byDate.get(f.date), doc.id), f))
        hard.push({
          rule: 'FIXED',
          userId: doc.id,
          dates: [f.date],
          message: `${doc.name} · ${label(f.date)} · 고정 조건 「${f.label}」`,
        })
    }
    const lo = doc.allDayMin
    const hi = doc.allDayMax
    if ((lo !== null && c.allDay < lo) || (hi !== null && c.allDay > hi))
      soft.push({
        rule: 'ALLDAY_RANGE',
        userId: doc.id,
        dates: [],
        message: `${doc.name} · 올데이 ${c.allDay}개 · 선호 ${allDayRangeLabel({ allDayMin: lo, allDayMax: hi })}`,
      })
    for (const q of doc.requests ?? []) {
      if (!q.options.includes(dayState(byDate.get(q.date), doc.id)))
        soft.push({
          rule: 'REQUEST',
          userId: doc.id,
          dates: [q.date],
          message: `${doc.name} · ${label(q.date)} 신청 ${q.options.map((o) => DOCTOR_OPTION_LABEL[o]).join('/')} 미반영`,
        })
    }
    for (let i = 0; i < days.length; i++) {
      const today = byDate.get(days[i]!)
      const prevNight = i === 0 ? input.prevLastNight : byDate.get(days[i - 1]!)?.night
      if (prevNight === doc.id && today?.day === doc.id)
        soft.push({
          rule: 'NIGHT_TO_DAY',
          userId: doc.id,
          dates: [days[i]!],
          message: `${doc.name} · ${label(days[i]!)} 전날 Night 다음 Day`,
        })
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
