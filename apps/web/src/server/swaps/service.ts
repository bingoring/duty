import {
  SWAP_CODES,
  applyEdits,
  checkSchedule,
  formatMD,
  formatViolation,
  inNegotiation,
  newViolations,
  sameCounts,
  swapToEdits,
  swappable,
  weekdayKo,
  type SwapCode,
  type SwapItem,
} from '@duty/domain'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import type { Db } from '../db/client'
import { lockPlan } from '../plans/lock'
import { cellEditLogs, monthPlans, scheduleCells, swapRequestItems, swapRequests, users } from '../db/schema'
import { adjustCheckInput } from '../adjust/service'
import { invalidateSwapsForCells } from './invalidate'

export { INVALID_BY_ADMIN, invalidateSwapsForCells } from './invalidate'

// Build Spec 2-8 business-rules R-SWAP-1~13, business-logic-model §2
type Actor = { id: string; role: 'nurse' | 'admin' }
type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]
const deny = (message: string) => ({ ok: false as const, message })
const MAX_PEOPLE = 10
const INVALID_BY_SWAP = '다른 교환이 먼저 반영되었습니다'

const day = (d: string) => `${formatMD(d)} (${weekdayKo(d)})`
const label = (code: string) => (code === 'OFF' ? 'OFF' : code)

async function nameMap(db: DbOrTx) {
  return new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]))
}

export type CreateSwapInput = {
  planId: string
  date: string
  items: { userId: string; after: SwapCode }[]
  comment?: string
}
export type CreateResult = { ok: true; id: string; warning?: string } | { ok: false; message: string }

export async function createSwap(
  db: Db,
  actor: Actor,
  input: CreateSwapInput,
  today: string,
): Promise<CreateResult> {
  if (actor.role !== 'nurse') return deny('관리자는 근무 조정에서 직접 바꿉니다.')
  const [plan] = await db.select().from(monthPlans).where(eq(monthPlans.id, input.planId))
  if (!plan || plan.status !== 'CONFIRMED') return deny('확정된 달만 교환 요청을 보낼 수 있습니다.')
  if (!inNegotiation(plan, today))
    return deny(
      `협의 기간(${formatMD(plan.negotiationStart)} – ${formatMD(plan.negotiationEnd)})에만 교환 요청을 보낼 수 있습니다.`,
    )
  const ids = [...new Set(input.items.map((i) => i.userId))]
  if (ids.length !== input.items.length) return deny('같은 사람이 두 번 들어 있습니다.')
  if (!ids.includes(actor.id)) return deny('요청에는 본인이 들어가야 합니다.')
  if (ids.length < 2 || ids.length > MAX_PEOPLE) return deny(`교환은 2~${MAX_PEOPLE}명이 합니다.`)
  if (!input.date.startsWith(`${plan.year}-${String(plan.month).padStart(2, '0')}`))
    return deny('대상 월의 날짜가 아닙니다.')
  if (input.items.some((i) => !SWAP_CODES.includes(i.after))) return deny('바꿀 수 없는 근무입니다.')

  const people = await db.select().from(users).where(inArray(users.id, ids))
  if (people.length !== ids.length || people.some((u) => u.rotation !== 'rotating'))
    return deny('교대 근무자끼리만 교환할 수 있습니다.')
  const cells = await db
    .select()
    .from(scheduleCells)
    .where(
      and(
        eq(scheduleCells.monthPlanId, plan.id),
        eq(scheduleCells.date, input.date),
        inArray(scheduleCells.userId, ids),
      ),
    )
  const cellOf = new Map(cells.map((c) => [c.userId, c]))
  const toGrid = (c: (typeof cells)[number]) => ({
    userId: c.userId,
    date: c.date,
    code: c.code as SwapCode,
    checkupHalf: c.checkupHalf,
    ...(c.offKind ? { offKind: c.offKind as 'regular' } : {}),
  })
  if (ids.some((id) => !swappable(cellOf.get(id) ? toGrid(cellOf.get(id)!) : undefined)))
    return deny('휴가·교육·슬리핑오프·S 칸은 교환할 수 없습니다.')
  const items: SwapItem[] = input.items.map((i) => ({
    userId: i.userId,
    before: { code: cellOf.get(i.userId)!.code as SwapCode },
    after: { code: i.after },
  }))
  if (!sameCounts(items)) return deny('그날 D/E/N·OFF 개수가 달라집니다. 서로 맞바꾸는 조합이어야 합니다.')
  if (items.every((i) => i.before.code === i.after.code)) return deny('바뀌는 근무가 없습니다.')

  // R-SWAP-4: 새로 생기는 필수 위반이 있으면 거부
  const check = await adjustCheckInput(db, plan)
  const edits = swapToEdits(input.date, items)
  const hard = newViolations(
    checkSchedule(check),
    checkSchedule({ ...check, cells: applyEdits(check.cells, edits) }),
  ).hardViolations
  if (hard.length) {
    const names = await nameMap(db)
    const f = formatViolation(hard[0]!, { nameOf: (x) => names.get(x) ?? x, month: plan.month })
    return deny(`필수 규칙을 어기는 교환입니다: ${f.title}${f.detail ? ` · ${f.detail}` : ''}`)
  }

  // R-SWAP-6: 겹치는 대기 요청은 경고만
  const overlap = await db
    .select({ id: swapRequests.id })
    .from(swapRequests)
    .innerJoin(swapRequestItems, eq(swapRequestItems.requestId, swapRequests.id))
    .where(
      and(
        eq(swapRequests.monthPlanId, plan.id),
        eq(swapRequests.date, input.date),
        eq(swapRequests.status, 'PENDING'),
        inArray(swapRequestItems.userId, ids),
      ),
    )
    .limit(1)

  const comment = input.comment?.trim().slice(0, 500) || null
  const id = await db.transaction(async (tx) => {
    const [q] = await tx
      .insert(swapRequests)
      .values({ monthPlanId: plan.id, date: input.date, requesterId: actor.id, comment, status: 'PENDING' })
      .returning({ id: swapRequests.id })
    await tx.insert(swapRequestItems).values(
      items.map((i) => ({
        requestId: q!.id,
        userId: i.userId,
        before: i.before,
        after: i.after,
        response: i.userId === actor.id ? 'ACCEPTED' : 'PENDING',
        respondedAt: i.userId === actor.id ? new Date() : null,
      })),
    )
    return q!.id
  })
  return {
    ok: true,
    id,
    ...(overlap.length
      ? { warning: '같은 칸에 먼저 보낸 요청이 있습니다. 먼저 반영되는 요청만 적용됩니다.' }
      : {}),
  }
}

export type RespondResult = { ok: true; applied: boolean; message?: string } | { ok: false; message: string }

export async function respondSwap(
  db: Db,
  actor: Actor,
  id: string,
  decision: 'accept' | 'reject',
  today: string,
): Promise<RespondResult> {
  const [q] = await db.select().from(swapRequests).where(eq(swapRequests.id, id))
  if (!q) return deny('요청을 찾을 수 없습니다.')
  const names = await nameMap(db)
  // R-1: 계획 행 → 요청 행 순서로 잠근 뒤 응답 상태·칸을 다시 읽는다.
  // 동시 수락(3인 교환)도 마지막 하나만 반영하고, 철회·무효와 겹쳐도 "반영됨"을 잘못 알리지 않는다
  return db.transaction(async (tx): Promise<RespondResult> => {
    const plan = await lockPlan(tx, q.monthPlanId)
    const [locked] = await tx.select().from(swapRequests).where(eq(swapRequests.id, id)).for('update')
    const items = await tx.select().from(swapRequestItems).where(eq(swapRequestItems.requestId, id))
    const mine = items.find((i) => i.userId === actor.id)
    if (!mine) return deny('이 요청의 당사자가 아닙니다.')
    if (locked?.status !== 'PENDING') return deny('이미 끝난 요청입니다.')
    if (!plan || plan.status !== 'CONFIRMED' || !inNegotiation(plan, today))
      return deny('협의 기간이 끝나 응답할 수 없습니다.')
    if (mine.response !== 'PENDING') return deny('이미 응답했습니다.')

    const now = new Date()
    const myResponse = (response: 'ACCEPTED' | 'REJECTED') =>
      tx
        .update(swapRequestItems)
        .set({ response, respondedAt: now })
        .where(and(eq(swapRequestItems.requestId, id), eq(swapRequestItems.userId, actor.id)))

    if (decision === 'reject') {
      await myResponse('REJECTED')
      await tx.update(swapRequests).set({ status: 'REJECTED', closedAt: now }).where(eq(swapRequests.id, id))
      return { ok: true, applied: false }
    }

    await myResponse('ACCEPTED')
    if (!items.every((i) => i.userId === actor.id || i.response === 'ACCEPTED'))
      return { ok: true, applied: false }

    // R-SWAP-8: 마지막 수락 — 잠근 상태에서 칸 재확인·재검사 뒤 반영
    const swapItems: SwapItem[] = items.map((i) => ({
      userId: i.userId,
      before: i.before as SwapItem['before'],
      after: i.after as SwapItem['after'],
    }))
    const edits = swapToEdits(q.date, swapItems)
    const check = await adjustCheckInput(tx as unknown as Db, plan)
    let invalid: string | null = null
    for (const i of swapItems) {
      const c = check.cells.find((x) => x.userId === i.userId && x.date === q.date)
      if (!c || c.code !== i.before.code || !swappable(c)) invalid = '요청 뒤 근무가 바뀌었습니다'
    }
    if (!invalid) {
      const hard = newViolations(
        checkSchedule(check),
        checkSchedule({ ...check, cells: applyEdits(check.cells, edits) }),
      ).hardViolations
      if (hard.length) {
        const f = formatViolation(hard[0]!, { nameOf: (x) => names.get(x) ?? x, month: plan.month })
        invalid = `규칙 위반이 생깁니다 (${f.title})`
      }
    }
    if (invalid) {
      await tx
        .update(swapRequests)
        .set({ status: 'INVALID', closedReason: invalid, closedAt: now })
        .where(eq(swapRequests.id, id))
      return { ok: true, applied: false, message: `반영하지 못했습니다: ${invalid}` }
    }

    for (const e of edits) {
      const where = and(
        eq(scheduleCells.monthPlanId, plan.id),
        eq(scheduleCells.userId, e.userId),
        eq(scheduleCells.date, e.date),
      )
      const [before] = await tx.select().from(scheduleCells).where(where)
      const after = {
        code: e.after.code,
        offKind: e.after.code === 'OFF' ? 'regular' : null,
        leaveKind: null,
        checkupHalf: before!.checkupHalf,
      }
      await tx
        .update(scheduleCells)
        .set({ ...after, source: 'swap', editedBy: q.requesterId, editedAt: now })
        .where(where)
      await tx.insert(cellEditLogs).values({
        monthPlanId: plan.id,
        userId: e.userId,
        date: e.date,
        before: {
          code: before!.code,
          offKind: before!.offKind,
          leaveKind: before!.leaveKind,
          checkupHalf: before!.checkupHalf,
        },
        after,
        editedBy: q.requesterId,
        editedAt: now,
        reason: 'swap',
      })
    }
    await tx.update(swapRequests).set({ status: 'APPLIED', closedAt: now }).where(eq(swapRequests.id, id))
    // R-SWAP-9: 같은 칸이 걸린 다른 대기 요청은 무효
    await invalidateSwapsForCells(
      tx,
      plan.id,
      edits.map((e) => ({ userId: e.userId, date: e.date })),
      INVALID_BY_SWAP,
      id,
    )
    return { ok: true, applied: true }
  })
}

export async function cancelSwap(db: Db, actor: Actor, id: string) {
  const [q] = await db.select().from(swapRequests).where(eq(swapRequests.id, id))
  if (!q || q.requesterId !== actor.id) return deny('보낸 사람만 철회할 수 있습니다.')
  // R-1: 대기 중일 때만(마지막 수락·무효와 겹치면 그쪽이 먼저)
  const [done] = await db
    .update(swapRequests)
    .set({ status: 'CANCELLED', closedAt: new Date() })
    .where(and(eq(swapRequests.id, id), eq(swapRequests.status, 'PENDING')))
    .returning({ id: swapRequests.id })
  if (!done) return deny('이미 끝난 요청입니다.')
  return { ok: true as const }
}

// R-SWAP-10: 협의 기간이 끝난 달의 대기 요청 → 만료 (조회 때 호출)
export async function expireSwaps(db: Db, today: string) {
  const ended = await db
    .select({ id: monthPlans.id })
    .from(monthPlans)
    .where(lt(monthPlans.negotiationEnd, today))
  if (!ended.length) return
  await db
    .update(swapRequests)
    .set({ status: 'EXPIRED', closedReason: '협의 기간이 끝났습니다', closedAt: new Date() })
    .where(
      and(
        eq(swapRequests.status, 'PENDING'),
        inArray(
          swapRequests.monthPlanId,
          ended.map((p) => p.id),
        ),
      ),
    )
}

// ---- 조회 (Build Spec 2-8 domain-entities §4) ----
export type SwapCard = {
  id: string
  date: string
  title: string
  when: string
  from: string
  detail: string
  comment: string | null
  people: { userId: string; name: string; response: string }[]
  status: string
  statusLabel: string
  canRespond: boolean
  canCancel: boolean
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '대기',
  APPLIED: '완료 · 반영됨',
  REJECTED: '거절됨',
  CANCELLED: '철회함',
  EXPIRED: '만료',
  INVALID: '무효',
}
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/\. /g, '/')
    .replace('.', '')

export async function listSwaps(db: Db, viewer: Actor, planId: string, today: string) {
  await expireSwaps(db, today)
  const [plan] = await db.select().from(monthPlans).where(eq(monthPlans.id, planId))
  const open = !!plan && plan.status === 'CONFIRMED' && inNegotiation(plan, today)
  const mineIds =
    viewer.role === 'admin'
      ? null
      : (
          await db
            .select({ id: swapRequestItems.requestId })
            .from(swapRequestItems)
            .where(eq(swapRequestItems.userId, viewer.id))
        ).map((r) => r.id)
  if (mineIds && !mineIds.length)
    return {
      received: [] as SwapCard[],
      sent: [] as SwapCard[],
      pendingByCell: {} as Record<string, string[]>,
    }
  const reqs = await db
    .select()
    .from(swapRequests)
    .where(and(eq(swapRequests.monthPlanId, planId), mineIds ? inArray(swapRequests.id, mineIds) : undefined))
    .orderBy(desc(swapRequests.createdAt))
    .limit(60)
  const items = reqs.length
    ? await db
        .select()
        .from(swapRequestItems)
        .where(
          inArray(
            swapRequestItems.requestId,
            reqs.map((r) => r.id),
          ),
        )
    : []
  const names = await nameMap(db)
  const nameOf = (id: string) => names.get(id) ?? id
  const cards = reqs.map((q): SwapCard => {
    const its = items.filter((i) => i.requestId === q.id)
    const changed = its.filter((i) => i.before.code !== i.after.code)
    const mine = its.find((i) => i.userId === viewer.id)
    return {
      id: q.id,
      date: q.date,
      title: `${day(q.date)} · ${its.length}인 교환`,
      when: hhmm(q.createdAt),
      from: nameOf(q.requesterId),
      detail: changed
        .map((i) => `${nameOf(i.userId)} ${label(i.before.code)}→${label(i.after.code)}`)
        .join(' · '),
      comment: q.comment,
      people: its.map((i) => ({ userId: i.userId, name: nameOf(i.userId), response: i.response })),
      status: q.status,
      statusLabel:
        q.status === 'INVALID' && q.closedReason
          ? `무효 · ${q.closedReason}`
          : (STATUS_LABEL[q.status] ?? q.status),
      canRespond: open && q.status === 'PENDING' && mine?.response === 'PENDING',
      canCancel: q.status === 'PENDING' && q.requesterId === viewer.id,
    }
  })
  const pendingByCell: Record<string, string[]> = {}
  for (const q of reqs.filter((r) => r.status === 'PENDING'))
    for (const i of items.filter((x) => x.requestId === q.id))
      (pendingByCell[`${i.userId}|${q.date}`] ??= []).push(q.id)
  const received = cards.filter((c) => {
    const q = reqs.find((r) => r.id === c.id)!
    return viewer.role !== 'admin' && q.requesterId !== viewer.id
  })
  const sent =
    viewer.role === 'admin'
      ? cards
      : cards.filter((c) => reqs.find((r) => r.id === c.id)!.requesterId === viewer.id)
  return { received: received.slice(0, 20), sent: sent.slice(0, 20), pendingByCell }
}

// 받은 대기 요청 수 (근무 조정 메뉴 배지·근무표 띠)
export async function pendingReceivedCount(db: Db, viewerId: string, today: string) {
  await expireSwaps(db, today)
  const rows = await db
    .select({ id: swapRequests.id })
    .from(swapRequestItems)
    .innerJoin(swapRequests, eq(swapRequests.id, swapRequestItems.requestId))
    .where(
      and(
        eq(swapRequestItems.userId, viewerId),
        eq(swapRequestItems.response, 'PENDING'),
        eq(swapRequests.status, 'PENDING'),
      ),
    )
  return rows.length
}
