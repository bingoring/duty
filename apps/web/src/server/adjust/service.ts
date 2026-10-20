import {
  applyEdits,
  checkSchedule,
  formatMD,
  formatViolation,
  monthDates,
  newViolations,
  uncoveredViolations,
  type CellEdit,
  type ScheduleInput,
} from '@duty/domain'
import { nurseOffRequests } from './reroll'
import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { lockPlan, lockPlansFor, rejectable } from '../plans/lock'
import { cellEditLogs, monthPlans, scheduleCells, users } from '../db/schema'
import { fillProfiles } from '../generate/input'
import { buildScheduleInput } from '../schedule/input'
import { INVALID_BY_ADMIN, invalidateSwapsForCells } from '../swaps/invalidate'
import { applyDraftLeaves, leaveRangeKeys, staleBefore, type DraftLeave } from './draft'
import { persistDraftLeave } from './leave-draft'

// Build Spec 2-7 business-logic-model §2 — 관리자 일괄 저장 · 협의 기간 변경
type Actor = { id: string; role: 'nurse' | 'admin' }
type PlanRow = typeof monthPlans.$inferSelect
export type SaveResult = { ok: true; saved: number } | { ok: false; message: string; violations?: string[] }

const MAX_REASON = 200

// 편집 가능 여부 (R-ADJ-2)
export function editBlockReason(status: string | undefined): string | null {
  if (status === 'CONFIRMED') return null
  if (status === 'CLOSED') return '마감한 달입니다. 마감 취소 후 수정하세요.'
  if (status === 'DRAFTING') return '생성안을 확인하는 중입니다. 듀티 생성에서 확정하세요.'
  return '듀티가 아직 생성되지 않았습니다.'
}

// 브라우저 즉시 검사와 서버 재검사가 같은 입력을 쓴다 (월초 잔여 채움)
export async function adjustCheckInput(db: Db, plan: PlanRow): Promise<ScheduleInput> {
  const { input } = await buildScheduleInput(db, plan)
  await fillProfiles(db, input, input.rules)
  return input
}

const same = (a: CellEdit['before'], c: { code: string; offKind: string | null; leaveKind: string | null }) =>
  a.code === c.code &&
  (a.offKind ?? null) === (c.offKind ?? null) &&
  (a.leaveKind ?? null) === (c.leaveKind ?? null)

export async function saveEdits(
  db: Db,
  actor: Actor,
  planId: string,
  edits: CellEdit[],
  // 3-10 9: 저장 전 휴가 — 여기서 처음 승인 휴가로 넣는다(편집과 한 트랜잭션)
  leaves: DraftLeave[] = [],
  today = '',
): Promise<SaveResult> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  // R-1: 계획 행을 잠근 뒤 상태·칸 비교·재검사·쓰기를 한 트랜잭션에서 한다(동시 저장·교환·마감과 직렬화)
  return rejectable(() =>
    db.transaction(async (tx): Promise<SaveResult> => {
      const tdb = tx as unknown as Db
      const plan = await lockPlan(tx, planId)
      const blocked = editBlockReason(plan?.status)
      if (!plan || blocked) return { ok: false, message: blocked ?? '계획을 찾을 수 없습니다.' }
      if (edits.length === 0 && leaves.length === 0) return { ok: true, saved: 0 }
      const days = new Set(monthDates(plan.year, plan.month))
      if (edits.some((e) => !days.has(e.date))) return { ok: false, message: '대상 월 밖의 칸입니다.' }
      if (leaves.some((l) => !days.has(l.startDate) || l.cells.some((c) => !days.has(c.date))))
        return { ok: false, message: '대상 월 밖의 휴가입니다.' }
      // 휴가가 다음 달로 이어지면 그 달 계획 행도 잠근다(연·월 순 — 이 달 다음)
      const locked = leaves.length
        ? await lockPlansFor(tx, [
            plan.year + '-' + String(plan.month).padStart(2, '0') + '-01',
            ...leaves.flatMap((l) => [l.startDate, l.endDate]),
          ])
        : []
      const inLeave = new Set(leaves.flatMap((l) => [...leaveRangeKeys(l)]))
      if (edits.some((e) => inLeave.has(`${e.userId}|${e.date}`)))
        return { ok: false, message: '휴가 기간 안의 칸에 다른 편집이 함께 있습니다. 새로 불러와 주세요.' }
      if (
        edits.some((e) => e.override && (!e.override.reason.trim() || e.override.reason.length > MAX_REASON))
      )
        return { ok: false, message: `예외 사유는 1~${MAX_REASON}자로 적어 주세요.` }

      const names = new Map(
        (await tdb.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
      )
      const nameOf = (id: string) => names.get(id) ?? id
      const current = await tdb
        .select()
        .from(scheduleCells)
        .where(
          and(
            eq(scheduleCells.monthPlanId, plan.id),
            inArray(scheduleCells.userId, [
              ...new Set([...edits.map((e) => e.userId), ...leaves.map((l) => l.userId)]),
            ]),
          ),
        )
      const at = new Map(current.map((c) => [`${c.userId}|${c.date}`, c]))

      // R-ADJ-7: 편집을 시작할 때 본 값과 지금 값이 다르면 전체 거부
      const conflicts = [
        ...edits.filter((e) => {
          const c = at.get(`${e.userId}|${e.date}`)
          return !c || !same(e.before, c)
        }),
        ...leaves.flatMap((l) =>
          staleBefore(
            l.cells.map((c) => ({ ...c, userId: l.userId })),
            at,
          ),
        ),
      ]
      if (conflicts.length)
        return {
          ok: false,
          message: `다른 곳에서 먼저 바뀐 칸이 있습니다: ${conflicts.map((e) => `${nameOf(e.userId)} ${formatMD(e.date)}`).join(', ')}. 새로 불러와 주세요.`,
        }

      // 3-9 9: 간호사가 신청한 OFF는 D·E·N으로 바꾸지 못한다(휴가로 바꾸는 것은 근무 신청·도크의 휴가 입력)
      const offLocked = await nurseOffRequests(tdb, plan)
      const lockedEdits = edits.filter(
        (e) =>
          e.before.code === 'OFF' &&
          ['D', 'E', 'N'].includes(e.after.code) &&
          offLocked.has(`${e.userId}|${e.date}`),
      )
      if (lockedEdits.length)
        return {
          ok: false,
          message: `간호사가 신청한 OFF는 근무로 바꿀 수 없습니다: ${lockedEdits.map((e) => `${nameOf(e.userId)} ${formatMD(e.date)}`).join(', ')}`,
        }

      // R-ADJ-6: 서버 재검사, 예외 사유가 가려 주지 않는 새 필수 위반은 거부
      const input = await adjustCheckInput(tdb, plan)
      const diff = newViolations(
        checkSchedule(input),
        checkSchedule({ ...input, cells: applyEdits(applyDraftLeaves(input.cells, leaves), edits) }),
      )
      const uncovered = uncoveredViolations(diff.hardViolations, edits)
      if (uncovered.length)
        return {
          ok: false,
          message:
            '필수 규칙을 어기는 변경이 있습니다. 사유를 적고 「그래도 적용」하거나 변경을 고쳐 주세요.',
          violations: uncovered.map((v) => {
            const f = formatViolation(v, { nameOf, month: plan.month })
            return f.detail ? `${f.title} · ${f.detail}` : f.title
          }),
        }

      // 3-10 9: 저장 전 휴가를 승인 휴가로 넣는다(칸·이력·교환 무효). 검사에 걸리면 Rejected로 전체를 되돌린다
      for (const l of leaves) await persistDraftLeave(tx, locked, actor, l, today)

      const now = new Date()
      {
        for (const e of edits) {
          const before = at.get(`${e.userId}|${e.date}`)!
          const after = {
            code: e.after.code,
            offKind: e.after.code === 'OFF' ? (e.after.offKind ?? 'regular') : null,
            leaveKind: null,
            checkupHalf: before.checkupHalf,
          }
          await tx
            .update(scheduleCells)
            // 3-10 8: 다시 생성한 칸은 자동 생성(다음 리롤에서 고정하지 않음), 손으로 바꾼 칸만 관리자 수정
            .set({
              ...after,
              source: e.kind === 'reroll' ? 'auto' : 'admin',
              editedBy: actor.id,
              editedAt: now,
            })
            .where(
              and(
                eq(scheduleCells.monthPlanId, plan.id),
                eq(scheduleCells.userId, e.userId),
                eq(scheduleCells.date, e.date),
              ),
            )
          await tx.insert(cellEditLogs).values({
            monthPlanId: plan.id,
            userId: e.userId,
            date: e.date,
            before: {
              code: before.code,
              offKind: before.offKind,
              leaveKind: before.leaveKind,
              checkupHalf: before.checkupHalf,
            },
            after,
            editedBy: actor.id,
            editedAt: now,
            reason: e.kind === 'reroll' ? 'reroll' : 'manual',
            note: e.override?.reason.trim() ?? null,
          })
        }
        // 2-8 R-SWAP-9: 바뀐 칸이 걸린 대기 교환 요청은 무효
        await invalidateSwapsForCells(
          tx,
          plan.id,
          edits.map((e) => ({ userId: e.userId, date: e.date })),
          INVALID_BY_ADMIN,
        )
      }
      return { ok: true as const, saved: edits.length + leaves.reduce((n, l) => n + l.cells.length, 0) }
    }),
  )
}

// R-ADJ-11: 마감일 뒤 ~ 대상 월 말일
export async function updateNegotiation(
  db: Db,
  actor: Actor,
  planId: string,
  range: { start: string; end: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  const [plan] = await db.select().from(monthPlans).where(eq(monthPlans.id, planId))
  if (!plan) return { ok: false, message: '계획을 찾을 수 없습니다.' }
  const last = monthDates(plan.year, plan.month).at(-1)!
  if (!(plan.requestDeadline < range.start && range.start <= range.end && range.end <= last))
    return {
      ok: false,
      message: `협의 기간은 신청 마감(${formatMD(plan.requestDeadline)}) 뒤부터 ${formatMD(last)}까지, 시작 ≤ 끝이어야 합니다.`,
    }
  await db
    .update(monthPlans)
    .set({ negotiationStart: range.start, negotiationEnd: range.end })
    .where(eq(monthPlans.id, plan.id))
  return { ok: true }
}
