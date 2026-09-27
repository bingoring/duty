import {
  formatMD,
  generationChecks,
  summarizeNurse,
  type CheckResult,
  type GenerationCheck,
  monthDates,
  type MonthPlanStatus,
} from '@duty/domain'
import { and, asc, eq, gte, isNotNull, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { leaveRequests, monthPlans, scheduleCandidates, shiftRequests, trainings, users } from '../db/schema'
import { ensureRequestPlan, findPlan } from '../requests/plan'
import { latestRuleSet } from '../rules/service'
import { loadDraftView } from '../schedule/load'
import { shiftYm, type YearMonth } from '../schedule/month'
import type { ScheduleCellRow } from '../schedule/types'
import { buildScheduleView, type ScheduleView } from '../schedule/view'
import { buildGenerationInput, type Priorities } from './input'
import { loadCandidateCells, type SolverMeta } from './service'

// Build Spec 2-6 domain-entities §4 — S8 화면 DTO (관리자 전용)
export type PriorityItem = {
  key: keyof Priorities | 'training'
  label: string
  checked: boolean
  disabled: boolean
}

export type CandidateView = {
  id: string
  no: number
  createdAt: string
  stale: boolean
  confirmed: boolean
  hardCount: number
  softCount: number
  checks: GenerationCheck[]
  offShort: { name: string; short: number }[]
  summary: {
    userId: string
    name: string
    D: number
    E: number
    N: number
    OFF: number
    acc: string
    accSign: -1 | 0 | 1
    nLeft: number
  }[]
  grid: ScheduleView
  prevMonthConfirmed: boolean
}

export type GenerateView = {
  year: number
  month: number
  ym: string
  planStatus: MonthPlanStatus | null
  canGenerate: boolean
  blockedReason: string | null
  hard: { label: string; value: string }[]
  forbiddenPatterns: string[]
  priorities: PriorityItem[]
  candidates: { id: string; no: number }[]
  current: CandidateView | null
}

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)

// 기본 대상 월: 생성 가능한(마감 지남·생성 중) 가장 가까운 달, 없으면 다음 달
export async function defaultGenerateYm(db: Db, today: string): Promise<YearMonth> {
  const next = shiftYm({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }, 1)
  await ensureRequestPlan(db, next, today, await latestRuleSet(db))
  const open = (await db.select().from(monthPlans).orderBy(asc(monthPlans.year), asc(monthPlans.month))).find(
    (p) => ['REQUEST_CLOSED', 'DRAFTING'].includes(p.status),
  )
  return open ? { year: open.year, month: open.month } : next
}

export async function loadGenerateView(
  db: Db,
  args: { ym: YearMonth; candidateId?: string; today: string },
): Promise<GenerateView> {
  const { ym, today } = args
  const rules = await latestRuleSet(db)
  const plan = (await ensureRequestPlan(db, ym, today, rules)) ?? (await findPlan(db, ym)) ?? null
  const p = rules.params
  const days = monthDates(ym.year, ym.month)

  const status = (plan?.status ?? null) as MonthPlanStatus | null
  const canGenerate = status === 'REQUEST_CLOSED' || status === 'DRAFTING'
  const blockedReason = canGenerate
    ? null
    : !plan
      ? '이 달은 아직 신청 기간이 아닙니다.'
      : status === 'REQUESTING'
        ? `${formatMD(plan.requestDeadline)} 신청 마감 뒤 생성할 수 있습니다.`
        : null

  // 우선 반영: 근무 신청 건수·코멘트 수, 트레이닝 쌍 이름
  const reqs = plan
    ? await db
        .select({ comment: shiftRequests.comment })
        .from(shiftRequests)
        .where(
          and(
            eq(shiftRequests.year, ym.year),
            eq(shiftRequests.month, ym.month),
            isNotNull(shiftRequests.submittedAt),
          ),
        )
    : []
  const leaves = await db
    .select({ comment: leaveRequests.comment })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.status, 'APPROVED'),
        lte(leaveRequests.startDate, days.at(-1)!),
        gte(leaveRequests.endDate, days[0]!),
      ),
    )
  const comments = [...reqs, ...leaves].filter((r) => r.comment?.trim()).length
  const names = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  )
  const nameOf = (id: string) => names.get(id) ?? id
  const tr = await db
    .select()
    .from(trainings)
    .where(and(lte(trainings.startDate, days.at(-1)!), gte(trainings.endDate, days[0]!)))
  const pairs = tr.map((t) => `${nameOf(t.preceptorId)}·${nameOf(t.traineeId)}`)
  const t = rules.toggles
  const priorities: PriorityItem[] = [
    {
      key: 'requests',
      label: `근무 신청 · 연차 (${reqs.length + leaves.length}건, 코멘트 ${comments})`,
      checked: true,
      disabled: false,
    },
    { key: 'offAfterNight', label: 'N 후 OFF 2개 (불가피 시 N-OFF-E)', checked: true, disabled: false },
    {
      key: 'weekendPair',
      label: '모든 간호사 월 1회 주말 이틀 통 OFF',
      checked: t.weekendPairOffMonthly,
      disabled: false,
    },
    { key: 'avoidJuniorOnly', label: '저연차만 배정 방지', checked: t.avoidJuniorOnly, disabled: false },
    {
      key: 'minimizeRepeatPairs',
      label: '특정 근무자 반복 겹침 최소화',
      checked: t.minimizeRepeatPairs,
      disabled: false,
    },
    {
      key: 'training',
      label: `프리셉터–신규 동일 근무 (${pairs.length ? pairs.join(', ') : '해당 없음'}) · 필수`,
      checked: true,
      disabled: true,
    },
  ]

  const hard = [
    { label: '듀티당 최소 인원', value: `${p.minStaffPerShift}명` },
    { label: 'K-tass 권한자 포함', value: `${p.minKTass}명 이상` },
    { label: '월 나이트 상한', value: `${p.maxNightPerMonth}개` },
    { label: '연속 나이트', value: `≤ ${p.maxConsecutiveNight}일` },
    { label: '근무 간 휴식', value: `≥ ${p.minRestHours}시간` },
  ]

  const cands = plan
    ? await db
        .select()
        .from(scheduleCandidates)
        .where(eq(scheduleCandidates.monthPlanId, plan.id))
        .orderBy(asc(scheduleCandidates.generationNo))
    : []
  const confirmedId = plan?.confirmedCandidateId ?? null
  const pick =
    cands.find((c) => c.id === args.candidateId) ??
    (confirmedId ? cands.find((c) => c.id === confirmedId) : undefined) ??
    cands.at(-1)

  let current: CandidateView | null = null
  if (plan && pick) {
    const g = await buildGenerationInput(db, plan)
    const meta = pick.solverMeta as SolverMeta
    const check = pick.checkResult as CheckResult
    const cells = (await loadCandidateCells(db, pick.id)) as ScheduleCellRow[]
    const warnCells = new Set(
      check.softWarnings.flatMap((v) => v.userIds.flatMap((u) => v.dates.map((d) => `${u}|${d}`))),
    )
    const grid = buildScheduleView(await loadDraftView(db, { plan, cells, today, warnCells }))
    const balance = new Map(grid.rows.map((r) => [r.userId, r]))
    const rotating = g.input.nurses.filter((n) => n.rotation === 'rotating').map((n) => n.id)
    const summary = grid.rows
      .filter((r) => rotating.includes(r.userId))
      .map((r) => {
        const s = summarizeNurse(cells.filter((c) => c.userId === r.userId))
        const acc = Number(balance.get(r.userId)!.accOff.replace('+', ''))
        return {
          userId: r.userId,
          name: r.name,
          D: s.D,
          E: s.E,
          N: s.N,
          OFF: s.OFF,
          acc: balance.get(r.userId)!.accOff,
          accSign: (Math.sign(acc) || 0) as -1 | 0 | 1,
          nLeft: Number(balance.get(r.userId)!.nLeft),
        }
      })
    const target = new Map(g.base.nurses.map((n) => [n.id, n.offTarget]))
    const offShort = g.base.nurses
      .map((n) => {
        const mine = cells.filter((c) => c.userId === n.id)
        const actual = mine.filter(
          (c) =>
            c.code === 'OFF' &&
            (c.offKind === 'regular' || c.offKind === 'edu_cont' || c.offKind === 'edu_union'),
        ).length
        return { name: nameOf(n.id), short: Math.round(((target.get(n.id) ?? 0) - actual) * 10) / 10 }
      })
      .filter((x) => x.short > 0)
    const checks = generationChecks(check, g.input, { nameOf, month: ym.month })
    current = {
      id: pick.id,
      no: pick.generationNo,
      createdAt: hhmm(pick.createdAt),
      stale: pick.id !== confirmedId && meta.inputHash !== g.inputHash,
      confirmed: pick.id === confirmedId,
      hardCount: check.hardViolations.length,
      softCount: check.softWarnings.length,
      checks,
      offShort,
      summary,
      grid,
      prevMonthConfirmed: meta.prevMonthConfirmed,
    }
  }

  return {
    ...ym,
    ym: `${ym.year}-${String(ym.month).padStart(2, '0')}`,
    planStatus: status,
    canGenerate,
    blockedReason,
    hard,
    forbiddenPatterns: rules.forbiddenPatterns,
    priorities,
    candidates: cands.map((c) => ({ id: c.id, no: c.generationNo })),
    current,
  }
}
