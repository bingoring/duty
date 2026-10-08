import type { SolverCause } from '@duty/contract'
import {
  checkSchedule,
  formatMD,
  formatViolation,
  generatedCellSource,
  nextPlanStatus,
  weekdayKo,
  type CheckResult,
  type GridCell,
  type LeaveKind,
  type OffKind,
  type ShiftCode,
} from '@duty/domain'
import { and, desc, eq, max } from 'drizzle-orm'
import type { Db } from '../db/client'
import { lockPlan } from '../plans/lock'
import {
  candidateCells,
  monthPlans,
  ruleVersions,
  scheduleCandidates,
  scheduleCells,
  users,
} from '../db/schema'
import { ensureRequestPlan, findPlan } from '../requests/plan'
import { latestRuleSet } from '../rules/service'
import type { YearMonth } from '../schedule/month'
import {
  assembleCells,
  buildGenerationInput,
  toSolverRequest,
  type GenerationInput,
  type Priorities,
} from './input'
import { callSolver, solverTimeLimit } from './solver-client'

// Build Spec 2-6 business-logic-model §1·§5, business-rules §1·§6
export type GenerateFailure = {
  ok: false
  kind: 'blocked' | 'busy' | 'fixed' | 'infeasible' | 'unknown' | 'unreachable' | 'invalid'
  message: string
  causes?: string[]
}
export type GenerateResult = { ok: true; candidateId: string; no: number } | GenerateFailure

export type SolverMeta = {
  status: 'OPTIMAL' | 'FEASIBLE'
  objective: { total: number; terms: Record<string, number> }
  wallTimeSec: number
  inputHash: string
  priorities: Priorities
  prevMonthConfirmed: boolean
  solverVersion: string
}

type Actor = { id: string; role: 'nurse' | 'admin' }
const fail = (kind: GenerateFailure['kind'], message: string, causes?: string[]): GenerateFailure => ({
  ok: false,
  kind,
  message,
  ...(causes ? { causes } : {}),
})
const GENERATABLE = ['REQUEST_CLOSED', 'DRAFTING']
const MAX_CAUSES = 5

async function names(db: Db) {
  return new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]))
}

async function ruleVersionNo(db: Db) {
  const [r] = await db
    .select({ v: ruleVersions.version })
    .from(ruleVersions)
    .orderBy(desc(ruleVersions.version))
    .limit(1)
  return r?.v ?? 1
}

// R-GEN-12: 불가능 원인 문구
export function causeText(
  c: SolverCause,
  nameOf: (id: string) => string,
  rules: { maxOff: number; nightMax: number },
) {
  const day = c.date ? `${formatMD(c.date)} (${weekdayKo(c.date)})` : ''
  const who = c.userId ? nameOf(c.userId) : ''
  switch (c.group) {
    case 'STAFF':
      return day ? `${day} ${c.shift} 인원을 채울 수 없습니다` : '듀티 최소 인원을 채울 수 없습니다'
    case 'KTASS':
      return `${day} ${c.shift} K-tass 보유자를 배정할 수 없습니다`
    case 'NIGHT_MAX':
      return `${who} · 월 나이트 상한(${rules.nightMax}개)과 충돌합니다`
    case 'NIGHT_CONSEC':
      return `${who} · 연속 나이트 상한과 충돌합니다`
    case 'OFF_CONSEC':
      return `${who} · 연속 오프 상한(${rules.maxOff}일)과 충돌합니다 (휴가 기간을 확인하세요)`
    case 'TRAINING':
      return `${who} · 프리셉터와 같은 근무를 맞출 수 없습니다`
    case 'FIXED':
      return `${who} · 승인된 휴가·교육 칸 때문에 인원을 채울 수 없습니다`
    case 'SLEEPING':
      return `${who} · 슬리핑오프 한도와 충돌합니다`
  }
}

export async function generate(
  db: Db,
  actor: Actor,
  ym: YearMonth,
  opts: { priorities: Priorities; seed?: number; today: string },
): Promise<GenerateResult> {
  if (actor.role !== 'admin') return fail('blocked', '권한이 없습니다.')
  // R-1: 솔버는 CPU·메모리를 크게 쓰므로 한 번에 하나만(두 번 클릭·두 관리자). 앱 서버는 한 프로세스다
  if (generating) return fail('busy', '다른 생성이 진행 중입니다. 끝난 뒤 다시 시도해 주세요.')
  generating = true
  try {
    return await generateOnce(db, actor, ym, opts)
  } finally {
    generating = false
  }
}

let generating = false

async function generateOnce(
  db: Db,
  actor: Actor,
  ym: YearMonth,
  opts: { priorities: Priorities; seed?: number; today: string },
): Promise<GenerateResult> {
  const rules = await latestRuleSet(db)
  const plan = (await ensureRequestPlan(db, ym, opts.today, rules)) ?? (await findPlan(db, ym))
  if (!plan) return fail('blocked', '이 달은 아직 신청 기간이 아닙니다.')
  if (plan.status === 'REQUESTING')
    return fail('blocked', `${formatMD(plan.requestDeadline)} 신청 마감 뒤 생성할 수 있습니다.`)
  if (!GENERATABLE.includes(plan.status))
    return fail('blocked', '이미 확정된 달입니다. 수정은 근무 조정에서 합니다.')

  const g = await buildGenerationInput(db, plan)
  const nameMap = await names(db)
  const nameOf = (id: string) => nameMap.get(id) ?? id
  if (g.fixedViolations.length)
    return fail(
      'fixed',
      '승인된 휴가·교육 신청이 규칙을 넘습니다. 먼저 확인해 주세요.',
      g.fixedViolations.slice(0, MAX_CAUSES).map((v) => {
        const f = formatViolation(v, { nameOf, month: ym.month })
        return f.detail ? `${f.title} · ${f.detail}` : f.title
      }),
    )

  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31)
  const req = toSolverRequest(g, { seed, timeLimitSec: solverTimeLimit(), priorities: opts.priorities })
  const out = await callSolver(req)
  if (out.kind === 'unreachable') {
    // R-1: 원인을 운영 로그에 남긴다(연결 실패·HTTP 오류·계약 불일치)
    console.error('solver_unreachable', { error: out.error, seed })
    return fail(
      'unreachable',
      out.error.startsWith('invalid response')
        ? '솔버 응답 형식이 맞지 않습니다. 관리자(개발 담당)에게 알려 주세요.'
        : '솔버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
    )
  }
  if (out.kind === 'unknown')
    return fail('unknown', '시간 안에 안을 찾지 못했습니다. 다시 시도하거나 조건을 줄여 주세요.')
  if (out.kind === 'infeasible') {
    const seen = new Set<string>()
    const causes = out.causes
      .map((c) =>
        causeText(c, nameOf, {
          maxOff: rules.params.maxConsecutiveOff,
          nightMax: rules.params.maxNightPerMonth,
        }),
      )
      .filter((t) => !seen.has(t) && seen.add(t))
      .slice(0, MAX_CAUSES)
    return fail(
      'infeasible',
      causes.length
        ? '규칙을 모두 지키는 근무표를 만들 수 없습니다.'
        : '규칙을 모두 지키는 근무표를 만들 수 없습니다. 원인을 특정하지 못했으니 신청·휴가·규칙을 확인해 주세요.',
      causes,
    )
  }

  // 1-3 §3: 솔버 안은 TS 검사기로 재검사한 뒤에만 저장한다
  const cells = assembleCells(g, out.res.cells)
  const check = checkSchedule({ ...g.input, cells })
  if (check.hardViolations.length) {
    console.error('solver_hard_violation', {
      seed,
      violations: check.hardViolations.map((v) => ({ ruleId: v.ruleId, dates: v.dates })),
    })
    return fail('invalid', '생성 결과가 규칙 검사를 통과하지 못했습니다. 다른 시드로 다시 시도해 주세요.')
  }

  const meta: SolverMeta = {
    status: out.res.status,
    objective: out.res.objective,
    wallTimeSec: out.res.wallTimeSec,
    inputHash: g.inputHash,
    priorities: opts.priorities,
    prevMonthConfirmed: g.prevMonthConfirmed,
    solverVersion: out.res.solverVersion,
  }
  const version = await ruleVersionNo(db)
  const saved = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(monthPlans).where(eq(monthPlans.id, plan.id)).for('update')
    if (!locked || !GENERATABLE.includes(locked.status)) return null
    const [{ n }] = (await tx
      .select({ n: max(scheduleCandidates.generationNo) })
      .from(scheduleCandidates)
      .where(eq(scheduleCandidates.monthPlanId, plan.id))) as [{ n: number | null }]
    const no = (n ?? 0) + 1
    const [cand] = await tx
      .insert(scheduleCandidates)
      .values({
        monthPlanId: plan.id,
        generationNo: no,
        seed,
        ruleVersion: version,
        checkResult: check,
        solverMeta: meta,
        createdBy: actor.id,
      })
      .returning({ id: scheduleCandidates.id })
    await tx.insert(candidateCells).values(cellRows(g, cells, cand!.id))
    if (locked.status === 'REQUEST_CLOSED')
      await tx
        .update(monthPlans)
        .set({ status: nextPlanStatus('REQUEST_CLOSED', 'GENERATE', { today: opts.today, ...ym }) })
        .where(eq(monthPlans.id, plan.id))
    return { id: cand!.id, no }
  })
  if (!saved) return fail('blocked', '이미 확정된 달입니다.')
  return { ok: true, candidateId: saved.id, no: saved.no }
}

function cellRows(g: GenerationInput, cells: GridCell[], candidateId: string) {
  const reqs = new Map(g.input.requests.map((r) => [`${r.userId}|${r.date}`, r]))
  return cells.map((c) => ({
    candidateId,
    userId: c.userId,
    date: c.date,
    code: c.code,
    offKind: c.offKind ?? null,
    leaveKind: c.leaveKind ?? null,
    checkupHalf: c.checkupHalf,
    source: generatedCellSource(
      c,
      reqs.get(`${c.userId}|${c.date}`),
      g.fixed.get(c.userId)?.has(c.date) ?? false,
    ),
  }))
}

export async function loadCandidateCells(
  db: Db,
  candidateId: string,
): Promise<(GridCell & { source: string })[]> {
  const rows = await db.select().from(candidateCells).where(eq(candidateCells.candidateId, candidateId))
  return rows.map((r) => {
    const c: GridCell & { source: string } = {
      userId: r.userId,
      date: r.date,
      code: r.code as ShiftCode,
      checkupHalf: r.checkupHalf,
      source: r.source,
    }
    if (r.offKind) c.offKind = r.offKind as OffKind
    if (r.leaveKind) c.leaveKind = r.leaveKind as LeaveKind
    return c
  })
}

// 입력이 바뀌었는지 (R-GEN-5)
export async function isStale(db: Db, candidate: { monthPlanId: string; solverMeta: unknown }) {
  const [plan] = await db.select().from(monthPlans).where(eq(monthPlans.id, candidate.monthPlanId))
  if (!plan) return true
  const g = await buildGenerationInput(db, plan)
  return (candidate.solverMeta as SolverMeta | null)?.inputHash !== g.inputHash
}

export type ConfirmResult = { ok: true } | { ok: false; message: string }

export async function confirmCandidate(
  db: Db,
  actor: Actor,
  candidateId: string,
  today: string,
): Promise<ConfirmResult> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  const [cand] = await db.select().from(scheduleCandidates).where(eq(scheduleCandidates.id, candidateId))
  if (!cand) return { ok: false, message: '생성안을 찾을 수 없습니다.' }

  // R-1: 계획 행을 잠근 뒤 입력 해시·재검사를 한다(신청·휴가 승인과 겹쳐 낡은 안이 확정되지 않게)
  return db.transaction(async (tx) => {
    const tdb = tx as unknown as Db
    const plan = await lockPlan(tx, cand.monthPlanId)
    if (!plan || plan.status !== 'DRAFTING')
      return { ok: false as const, message: '확정할 수 있는 달이 아닙니다.' }
    const g = await buildGenerationInput(tdb, plan)
    if ((cand.solverMeta as SolverMeta | null)?.inputHash !== g.inputHash)
      return { ok: false as const, message: '신청·휴가·규칙이 바뀌었습니다. 다시 생성해 주세요.' }
    const cells = await loadCandidateCells(tdb, candidateId)
    const check: CheckResult = checkSchedule({ ...g.input, cells })
    if (check.hardViolations.length)
      return { ok: false as const, message: '필수 규칙 위반이 있어 확정할 수 없습니다.' }
    const existing = await tx
      .select({ d: scheduleCells.date })
      .from(scheduleCells)
      .where(eq(scheduleCells.monthPlanId, plan.id))
      .limit(1)
    if (existing.length) return { ok: false as const, message: '이미 근무표가 있는 달입니다.' }
    await tx.insert(scheduleCells).values(
      cells.map((c) => ({
        monthPlanId: plan.id,
        userId: c.userId,
        date: c.date,
        code: c.code,
        offKind: c.offKind ?? null,
        leaveKind: c.leaveKind ?? null,
        checkupHalf: c.checkupHalf,
        source: c.source,
      })),
    )
    await tx
      .update(monthPlans)
      .set({
        status: nextPlanStatus('DRAFTING', 'CONFIRM', { today, year: plan.year, month: plan.month }),
        confirmedCandidateId: cand.id,
        confirmedBy: actor.id,
        confirmedAt: new Date(),
        ruleVersion: cand.ruleVersion,
      })
      .where(and(eq(monthPlans.id, plan.id), eq(monthPlans.status, 'DRAFTING')))
    return { ok: true as const }
  })
}
