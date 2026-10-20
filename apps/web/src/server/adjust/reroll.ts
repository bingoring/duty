import {
  DEFAULT_RULES,
  applyEdits,
  checkSchedule,
  formatMD,
  formatViolation,
  newViolations,
  uncoveredViolations,
  type CellEdit,
  type GridCell,
} from '@duty/domain'
import { and, eq, gte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { monthPlans, scheduleCells, shiftRequests, users } from '../db/schema'
import { assembleCells, buildGenerationInput, effectivePriorities, toSolverRequest } from '../generate/input'
import { CARRY_STAFF_HINT, carryStaffConflict, causeText } from '../generate/service'
import { callSolver, solverTimeLimit } from '../generate/solver-client'
import { latestRuleSet } from '../rules/service'
import {
  applyDraftLeaves,
  beforeOf,
  draftLeaveKeys,
  staleBefore,
  type DraftLeave,
  type DraftLeaveInput,
} from './draft'
import { resolveDraftLeaves } from './leave-draft'

// Build Spec 3-9 4 — 확정된 달의 부분 리롤: from 전 칸은 고정, from ~ 월말을 솔버로 다시 짠다.
// 결과는 바로 저장하지 않고 근무 조정의 「저장 전 편집」으로 돌려준다(관리자가 보고 「저장 · 재배포」)
type Actor = { id: string; role: 'nurse' | 'admin' }
type Fail = { ok: false; message: string; causes?: string[] }

async function confirmedPlan(db: Db, planId: string) {
  const [plan] = await db.select().from(monthPlans).where(eq(monthPlans.id, planId))
  if (!plan || plan.status !== 'CONFIRMED') return null
  return plan
}

// 리롤 전에 보여 준다: from 이후 교환 칸(다시 짜이면서 바뀔 수 있음) · 관리자 수정 칸(3-10 8: 그대로 둔다)
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

// 3-10 8: 리롤 때 그대로 두는 관리자 변경 — 저장 전 편집 + from 이후 저장된 관리자 수정 칸
export function keptAdminKeys(
  rows: readonly { userId: string; date: string; source: string }[],
  edits: readonly { userId: string; date: string }[],
  from: string,
): Set<string> {
  return new Set([
    ...edits.map((e) => `${e.userId}|${e.date}`),
    ...rows.filter((r) => r.source === 'admin' && r.date >= from).map((r) => `${r.userId}|${r.date}`),
  ])
}

// 3-10 9: 휴가는 가정으로만 넣고(저장하지 않음) from = 휴가 시작일 ~ 월말을 다시 짠다.
// edits·leaves = 지금 저장 전 편집·저장 전 휴가(3-10 8: 그대로 둔다). 결과는 새 휴가 + 새 편집으로 돌려준다
export async function rerollFrom(
  db: Db,
  actor: Actor,
  a: {
    planId: string
    leave: DraftLeaveInput
    edits?: CellEdit[]
    leaves?: DraftLeaveInput[]
    today: string
  },
): Promise<{ ok: true; leave: DraftLeave; edits: CellEdit[] } | Fail> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  if (running) return { ok: false, message: '다른 생성이 진행 중입니다. 끝난 뒤 다시 시도해 주세요.' }
  running = true
  try {
    const plan = await confirmedPlan(db, a.planId)
    if (!plan) return { ok: false, message: '확정된 달만 다시 생성할 수 있습니다.' }
    const from = a.leave.startDate
    const draftEdits = a.edits ?? []
    const rows = await db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id))
    const names = new Map(
      (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
    )
    const nameOf = (id: string) => names.get(id) ?? id
    const atRow = new Map(rows.map((r) => [`${r.userId}|${r.date}`, r]))

    // R-ADJ-7: 저장 전 편집이 본 값과 지금 값이 다르면 거부(저장과 같은 비교)
    const stale = staleBefore(draftEdits, atRow)
    if (stale.length)
      return {
        ok: false,
        message: `다른 곳에서 먼저 바뀐 칸이 있습니다: ${stale.map((e) => `${nameOf(e.userId)} ${formatMD(e.date)}`).join(', ')}. 새로 불러와 주세요.`,
      }
    const resolved = await resolveDraftLeaves(db, plan, [...(a.leaves ?? []), a.leave], rows, a.today)
    if (!resolved.ok) return resolved
    const leaves = resolved.leaves
    const leave = leaves.at(-1)!
    const leaveKeys = draftLeaveKeys(leaves)
    if (draftEdits.some((e) => leaveKeys.has(`${e.userId}|${e.date}`)))
      return { ok: false, message: '휴가 기간 안의 칸에 저장 전 편집이 있습니다. 그 편집을 되돌려 주세요.' }

    const dbCells: GridCell[] = rows.map((r) => ({
      userId: r.userId,
      date: r.date,
      code: r.code as GridCell['code'],
      checkupHalf: r.checkupHalf,
      ...(r.offKind ? { offKind: r.offKind as GridCell['offKind'] } : {}),
      ...(r.leaveKind ? { leaveKind: r.leaveKind as GridCell['leaveKind'] } : {}),
    }))
    // 지금 보이는 저장 전 근무표 = DB 칸 + 저장 전 휴가 + 저장 전 편집
    const current = applyEdits(applyDraftLeaves(dbCells, leaves), draftEdits)
    const offLocked = await nurseOffRequests(db, plan)
    const kept = keptAdminKeys(rows, draftEdits, from)
    const keep = new Set([
      ...current
        .filter((c) => c.code === 'OFF' && offLocked.has(`${c.userId}|${c.date}`))
        .map((c) => `${c.userId}|${c.date}`),
      ...kept,
    ])
    const g = await buildGenerationInput(db, plan, {
      freeze: { from, cells: current, keep },
      leaves: leaves.map((l) => ({
        userId: l.userId,
        type: l.type,
        startDate: l.startDate,
        endDate: l.endDate,
        byAdmin: actor.id !== l.userId,
      })),
    })
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
    // 3-10 8: from 이후 그대로 둔 관리자 변경 칸 수(안내용)
    const keptAfter = [...kept].filter((k) => k.slice(k.indexOf('|') + 1) >= from).length
    if (out.kind === 'infeasible')
      return {
        ok: false,
        message:
          `${from.slice(5).replace('-', '/')}부터 규칙을 모두 지키는 근무표를 만들 수 없습니다. ` +
          (keptAfter
            ? `그대로 둔 관리자 변경 ${keptAfter}칸(저장 전 편집·저장된 관리자 수정)이 새 휴가와 맞지 않을 수 있습니다. 그 변경을 되돌리거나 휴가·규칙을 확인해 주세요.`
            : '휴가·규칙을 확인하거나 근무 조정에서 직접 고쳐 주세요.'),
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
    // 이미 있던 위반·예외 사유로 적용한 편집의 위반은 리롤 탓이 아니다
    const hard = uncoveredViolations(
      newViolations(checkSchedule({ ...g.input, cells: dbCells }), checkSchedule({ ...g.input, cells }))
        .hardViolations,
      draftEdits,
    )
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
      if (c.date < from) continue
      const k = `${c.userId}|${c.date}`
      const b = at.get(k)
      const orig = atRow.get(k)
      if (!b || !orig || keep.has(k) || leaveKeys.has(k)) continue
      if (b.code === c.code && (b.offKind ?? null) === (c.offKind ?? null)) continue
      // 휴가·특수 칸은 고정이라 바뀌지 않는다 → 근무·OFF만 편집이 된다
      if (!['D', 'E', 'N', 'S', 'OFF'].includes(c.code)) continue
      edits.push({
        userId: c.userId,
        date: c.date,
        // 저장 때 R-ADJ-7 비교는 DB 칸과 한다
        before: beforeOf(orig),
        after: {
          code: c.code as 'D' | 'E' | 'N' | 'S' | 'OFF',
          ...(c.code === 'OFF' ? { offKind: c.offKind === 'sleeping' ? 'sleeping' : 'regular' } : {}),
        },
        kind: 'manual',
      })
    }
    return { ok: true, leave, edits }
  } finally {
    running = false
  }
}
