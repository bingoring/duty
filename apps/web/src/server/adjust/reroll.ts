import { DEFAULT_RULES, checkSchedule, formatViolation, type CellEdit, type GridCell } from '@duty/domain'
import { and, eq, gte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { monthPlans, scheduleCells, shiftRequests, users } from '../db/schema'
import { assembleCells, buildGenerationInput, effectivePriorities, toSolverRequest } from '../generate/input'
import { CARRY_STAFF_HINT, carryStaffConflict, causeText } from '../generate/service'
import { callSolver, solverTimeLimit } from '../generate/solver-client'
import { latestRuleSet } from '../rules/service'

// Build Spec 3-9 4 — 확정된 달의 부분 리롤: from 전 칸은 고정, from ~ 월말을 솔버로 다시 짠다.
// 결과는 바로 저장하지 않고 근무 조정의 「저장 전 편집」으로 돌려준다(관리자가 보고 「저장 · 재배포」)
type Actor = { id: string; role: 'nurse' | 'admin' }
type Fail = { ok: false; message: string; causes?: string[] }

async function confirmedPlan(db: Db, planId: string) {
  const [plan] = await db.select().from(monthPlans).where(eq(monthPlans.id, planId))
  if (!plan || plan.status !== 'CONFIRMED') return null
  return plan
}

// 사라질 변경(from 이후 교환·관리자 수정 칸) — 리롤 전에 보여 준다
export async function rerollPreview(
  db: Db,
  actor: Actor,
  a: { planId: string; from: string },
): Promise<{ ok: true; swaps: number; adminEdits: number } | Fail> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  const plan = await confirmedPlan(db, a.planId)
  if (!plan) return { ok: false, message: '확정된 달만 다시 생성할 수 있습니다.' }
  const rows = await db
    .select({ source: scheduleCells.source })
    .from(scheduleCells)
    .where(and(eq(scheduleCells.monthPlanId, plan.id), gte(scheduleCells.date, a.from)))
  return {
    ok: true,
    swaps: rows.filter((r) => r.source === 'swap').length,
    adminEdits: rows.filter((r) => r.source === 'admin').length,
  }
}

// 3-9 9: 간호사가 직접 신청한 OFF(OFF 하나만, 관리자 대신 입력 아님) — 관리자도 D·E·N으로 바꾸지 못한다
export async function nurseOffRequests(db: Db, plan: { year: number; month: number }) {
  const rows = await db
    .select()
    .from(shiftRequests)
    .where(and(eq(shiftRequests.year, plan.year), eq(shiftRequests.month, plan.month)))
  return new Set(
    rows
      .filter(
        (r) => r.submittedAt && !r.byAdmin && !r.special && r.options.length === 1 && r.options[0] === 'OFF',
      )
      .map((r) => `${r.userId}|${r.date}`),
  )
}

let running = false

export async function rerollFrom(
  db: Db,
  actor: Actor,
  a: { planId: string; from: string },
): Promise<{ ok: true; edits: CellEdit[] } | Fail> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  if (running) return { ok: false, message: '다른 생성이 진행 중입니다. 끝난 뒤 다시 시도해 주세요.' }
  running = true
  try {
    const plan = await confirmedPlan(db, a.planId)
    if (!plan) return { ok: false, message: '확정된 달만 다시 생성할 수 있습니다.' }
    const rows = await db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id))
    const current: GridCell[] = rows.map((r) => ({
      userId: r.userId,
      date: r.date,
      code: r.code as GridCell['code'],
      checkupHalf: r.checkupHalf,
      ...(r.offKind ? { offKind: r.offKind as GridCell['offKind'] } : {}),
      ...(r.leaveKind ? { leaveKind: r.leaveKind as GridCell['leaveKind'] } : {}),
    }))
    const offLocked = await nurseOffRequests(db, plan)
    const keep = new Set(
      current
        .filter((c) => c.code === 'OFF' && offLocked.has(`${c.userId}|${c.date}`))
        .map((c) => `${c.userId}|${c.date}`),
    )
    const g = await buildGenerationInput(db, plan, { freeze: { from: a.from, cells: current, keep } })
    const names = new Map(
      (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
    )
    const nameOf = (id: string) => names.get(id) ?? id
    const rules = await latestRuleSet(db)
    const priorities = effectivePriorities(
      {
        requests: true,
        offAfterNight: true,
        weekendPair: true,
        avoidJuniorOnly: true,
        minimizeRepeatPairs: true,
      },
      rules ?? DEFAULT_RULES,
    )
    const seed = Math.floor(Math.random() * 2 ** 31)
    const out = await callSolver(toSolverRequest(g, { seed, timeLimitSec: solverTimeLimit(), priorities }))
    if (out.kind === 'unreachable') {
      console.error('solver_unreachable', { error: out.error, seed, reroll: true })
      return { ok: false, message: '솔버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.' }
    }
    if (out.kind === 'unknown')
      return { ok: false, message: '시간 안에 안을 찾지 못했습니다. 다시 시도해 주세요.' }
    const p = rules.params
    if (out.kind === 'infeasible')
      return {
        ok: false,
        message: `${a.from.slice(5).replace('-', '/')}부터 규칙을 모두 지키는 근무표를 만들 수 없습니다. 휴가·규칙을 확인하거나 근무 조정에서 직접 고쳐 주세요.`,
        causes: [
          ...new Set(
            out.causes.map((c) =>
              causeText(c, nameOf, {
                maxOff: p.maxConsecutiveOff,
                nightMax: p.maxNightPerMonth,
                maxWork: p.maxConsecutiveWork,
              }),
            ),
          ),
        ].slice(0, 5),
        ...(out.causes.length || !carryStaffConflict(rules) ? {} : { causes: [CARRY_STAFF_HINT] }),
      }
    const headFill = (out.res.headFill ?? []).map((f) => `${f.userId}|${f.date}`)
    const cells = assembleCells(g, out.res.cells, headFill)
    const hard = checkSchedule({ ...g.input, cells }).hardViolations
    if (hard.length) {
      console.error('reroll_hard_violation', { seed, rules: hard.map((v) => v.ruleId) })
      const f = formatViolation(hard[0]!, { nameOf, month: plan.month })
      return {
        ok: false,
        message: `다시 생성한 안이 규칙 검사를 통과하지 못했습니다(${f.title}). 다시 시도해 주세요.`,
      }
    }
    const at = new Map(current.map((c) => [`${c.userId}|${c.date}`, c]))
    const edits: CellEdit[] = []
    for (const c of cells) {
      if (c.date < a.from) continue
      const b = at.get(`${c.userId}|${c.date}`)
      if (!b) continue
      if (b.code === c.code && (b.offKind ?? null) === (c.offKind ?? null)) continue
      // 휴가·특수 칸은 고정이라 바뀌지 않는다 → 근무·OFF만 편집이 된다
      if (!['D', 'E', 'N', 'S', 'OFF'].includes(c.code)) continue
      edits.push({
        userId: c.userId,
        date: c.date,
        before: {
          code: b.code,
          ...(b.offKind ? { offKind: b.offKind } : {}),
          ...(b.leaveKind ? { leaveKind: b.leaveKind } : {}),
        },
        after: {
          code: c.code as 'D' | 'E' | 'N' | 'S' | 'OFF',
          ...(c.code === 'OFF' ? { offKind: c.offKind === 'sleeping' ? 'sleeping' : 'regular' } : {}),
        },
        kind: 'manual',
      })
    }
    return { ok: true, edits }
  } finally {
    running = false
  }
}
