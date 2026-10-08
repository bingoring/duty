import {
  applyEdits,
  checkSchedule,
  newViolations,
  swappable,
  swapToEdits,
  type ScheduleInput,
  type SwapCode,
} from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { adjustCheckInput, saveEdits } from '../adjust/service'
import { cellEditLogs, scheduleCells, swapRequests, users } from '../db/schema'
import { loadNotices } from '../notices/service'
import { findPlan } from '../requests/plan'
import { seedDev } from '../seed/dev'
import { cancelSwap, createSwap, expireSwaps, listSwaps, respondSwap } from './service'

// Build Spec 2-8 business-rules R-SWAP-1~13. 종이 10월(가명) 확정본, 10월 협의 기간 9/16–9/20
const db = setupTestDb()
const OCT = { year: 2026, month: 10 }
const IN = '2026-09-18'
const AFTER = '2026-09-21'

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}
async function cellOf(userId: string, date: string) {
  const [c] = await db
    .select()
    .from(scheduleCells)
    .where(and(eq(scheduleCells.userId, userId), eq(scheduleCells.date, date)))
  return c!
}

// 두 사람이 서로 다른 교환 가능한 칸을 가진 날 중 교환해도 새 필수 위반이 없는(ok) / 있는(bad) 쌍을 찾는다
type Pair = { date: string; a: string; b: string; ca: SwapCode; cb: SwapCode }
function findPairs(input: ScheduleInput, nos: Map<string, string>) {
  const base = checkSchedule(input)
  const rot = input.nurses.filter((n) => n.rotation === 'rotating').map((n) => n.id)
  let ok: Pair | null = null
  let bad: Pair | null = null
  for (const date of [...new Set(input.cells.map((c) => c.date))].sort().filter((d) => d >= '2026-10-05'))
    for (const a of rot)
      for (const b of rot) {
        if (a >= b || !nos.has(a) || !nos.has(b)) continue
        const ca = input.cells.find((c) => c.userId === a && c.date === date)
        const cb = input.cells.find((c) => c.userId === b && c.date === date)
        if (!swappable(ca) || !swappable(cb) || ca!.code === cb!.code) continue
        const p = { date, a, b, ca: ca!.code as SwapCode, cb: cb!.code as SwapCode }
        const edits = swapToEdits(date, [
          { userId: a, before: { code: p.ca }, after: { code: p.cb } },
          { userId: b, before: { code: p.cb }, after: { code: p.ca } },
        ])
        const hard = newViolations(
          base,
          checkSchedule({ ...input, cells: applyEdits(input.cells, edits) }),
        ).hardViolations
        if (!hard.length) ok ??= p
        else bad ??= p
        if (ok && bad) return { ok, bad }
      }
  throw new Error('교환 쌍을 찾지 못했습니다')
}

let pairs: { ok: Pair; bad: Pair }
let noOf: Map<string, string>

// 시드할 때마다 uuid가 새로 생기므로 쌍도 매번 다시 찾는다
beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
  const rows = await db.select({ id: users.id, no: users.employeeNo }).from(users)
  noOf = new Map(rows.filter((r) => r.no !== '00101').map((r) => [r.id, r.no]))
  pairs = findPairs(await adjustCheckInput(db, (await findPlan(db, OCT))!), noOf)
})

async function send(p: Pair, today = IN) {
  const a = await actor(noOf.get(p.a)!)
  const plan = (await findPlan(db, OCT))!
  return createSwap(
    db,
    a,
    {
      planId: plan.id,
      date: p.date,
      items: [
        { userId: p.a, after: p.cb },
        { userId: p.b, after: p.ca },
      ],
      comment: '바꿔 주실 수 있을까요',
    },
    today,
  )
}

describe('createSwap (R-SWAP-1~6)', () => {
  it('규칙을 지키는 교환은 대기 요청이 되고, 요청자는 수락으로 들어간다', async () => {
    const r = await send(pairs.ok)
    expect(r).toMatchObject({ ok: true })
    const [q] = await db.select().from(swapRequests)
    expect(q!.status).toBe('PENDING')
    const b = await actor(noOf.get(pairs.ok.b)!)
    const view = await listSwaps(db, b, (await findPlan(db, OCT))!.id, IN)
    expect(view.received).toHaveLength(1)
    expect(view.received[0]).toMatchObject({ canRespond: true, comment: '바꿔 주실 수 있을까요' })
    expect(view.received[0]!.people.find((p) => p.userId === pairs.ok.a)!.response).toBe('ACCEPTED')
  })

  it('협의 기간 밖·필수 위반·개수 불일치·수간호사는 거부', async () => {
    expect(await send(pairs.ok, AFTER)).toMatchObject({
      ok: false,
      message: expect.stringContaining('협의 기간'),
    })
    expect(await send(pairs.bad)).toMatchObject({ ok: false, message: expect.stringContaining('필수 규칙') })
    const a = await actor(noOf.get(pairs.ok.a)!)
    const plan = (await findPlan(db, OCT))!
    expect(
      await createSwap(
        db,
        a,
        {
          planId: plan.id,
          date: pairs.ok.date,
          items: [
            { userId: pairs.ok.a, after: pairs.ok.cb },
            { userId: pairs.ok.b, after: pairs.ok.cb },
          ],
        },
        IN,
      ),
    ).toMatchObject({ ok: false, message: expect.stringContaining('개수') })
    const head = await actor('00101')
    expect(
      await createSwap(
        db,
        a,
        {
          planId: plan.id,
          date: pairs.ok.date,
          items: [
            { userId: pairs.ok.a, after: 'D' },
            { userId: head.id, after: 'OFF' },
          ],
        },
        IN,
      ),
    ).toMatchObject({ ok: false })
  })
})

describe('respondSwap · 반영 (R-SWAP-7~9·12)', () => {
  it('상대가 수락하면 즉시 반영: 칸 source swap, 이력 swap, 상대에게 바뀐 근무 안내', async () => {
    const r = await send(pairs.ok)
    if (!r.ok) throw new Error(r.message)
    const b = await actor(noOf.get(pairs.ok.b)!)
    const outsider = await actor(
      [...noOf.values()].find((n) => n !== noOf.get(pairs.ok.a) && n !== noOf.get(pairs.ok.b))!,
    )
    expect(await respondSwap(db, outsider, r.id, 'accept', IN)).toMatchObject({ ok: false })
    expect(await respondSwap(db, b, r.id, 'accept', IN)).toMatchObject({ ok: true, applied: true })

    expect((await cellOf(pairs.ok.a, pairs.ok.date)).code).toBe(pairs.ok.cb)
    const cb = await cellOf(pairs.ok.b, pairs.ok.date)
    expect(cb.code).toBe(pairs.ok.ca)
    expect(cb.source).toBe('swap')
    const logs = await db.select().from(cellEditLogs).where(eq(cellEditLogs.reason, 'swap'))
    expect(logs).toHaveLength(2)
    expect(logs.every((l) => l.editedBy === pairs.ok.a)).toBe(true)
    expect((await loadNotices(db, pairs.ok.b)).items).toHaveLength(1)
    expect((await loadNotices(db, pairs.ok.a)).items).toHaveLength(0)
    const [q] = await db.select().from(swapRequests)
    expect(q!.status).toBe('APPLIED')
  })

  it('거절하면 종료, 요청자는 대기 요청을 철회할 수 있다', async () => {
    const r1 = await send(pairs.ok)
    if (!r1.ok) throw new Error(r1.message)
    const b = await actor(noOf.get(pairs.ok.b)!)
    const a = await actor(noOf.get(pairs.ok.a)!)
    expect(await cancelSwap(db, b, r1.id)).toMatchObject({ ok: false })
    expect(await respondSwap(db, b, r1.id, 'reject', IN)).toMatchObject({ ok: true, applied: false })
    expect((await db.select().from(swapRequests).where(eq(swapRequests.id, r1.id)))[0]!.status).toBe(
      'REJECTED',
    )
    const r2 = await send(pairs.ok)
    if (!r2.ok) throw new Error(r2.message)
    expect(await cancelSwap(db, a, r2.id)).toEqual({ ok: true })
    expect((await db.select().from(swapRequests).where(eq(swapRequests.id, r2.id)))[0]!.status).toBe(
      'CANCELLED',
    )
    expect((await cellOf(pairs.ok.a, pairs.ok.date)).code).toBe(pairs.ok.ca)
  })

  it('겹치는 요청: 하나가 반영되면 나머지는 무효. 관리자가 칸을 바꿔도 무효', async () => {
    const r1 = await send(pairs.ok)
    const r2 = await send(pairs.ok)
    if (!r1.ok || !r2.ok) throw new Error('send')
    expect(r2).toMatchObject({ warning: expect.stringContaining('먼저 보낸 요청') })
    const b = await actor(noOf.get(pairs.ok.b)!)
    await respondSwap(db, b, r1.id, 'accept', IN)
    const [q2] = await db.select().from(swapRequests).where(eq(swapRequests.id, r2.id))
    expect(q2!.status).toBe('INVALID')
    expect(q2!.closedReason).toContain('먼저 반영')

    // 되돌리는 교환을 보낸 뒤 관리자가 그 칸을 고친다
    const back = await send({ ...pairs.ok, ca: pairs.ok.cb, cb: pairs.ok.ca })
    if (!back.ok) throw new Error(back.message)
    const admin = await actor('00101')
    const plan = (await findPlan(db, OCT))!
    const c = await cellOf(pairs.ok.a, pairs.ok.date)
    const saved = await saveEdits(db, admin, plan.id, [
      {
        userId: c.userId,
        date: c.date,
        before: { code: c.code as 'D', ...(c.offKind ? { offKind: c.offKind as 'regular' } : {}) },
        after: { code: 'S' },
        kind: 'manual',
        override: { reason: '테스트' },
      },
    ])
    expect(saved.ok, JSON.stringify(saved)).toBe(true)
    const [q3] = await db.select().from(swapRequests).where(eq(swapRequests.id, back.id))
    expect(q3!.status).toBe('INVALID')
    expect(q3!.closedReason).toContain('관리자')
  })

  it('협의 기간이 끝나면 대기 요청은 만료되고 응답할 수 없다', async () => {
    const r = await send(pairs.ok)
    if (!r.ok) throw new Error(r.message)
    const b = await actor(noOf.get(pairs.ok.b)!)
    expect(await respondSwap(db, b, r.id, 'accept', AFTER)).toMatchObject({ ok: false })
    await expireSwaps(db, AFTER)
    expect((await db.select().from(swapRequests))[0]!.status).toBe('EXPIRED')
  })
})

describe('동시 실행 (R-1)', () => {
  it('수락과 철회가 겹쳐도 상태와 칸이 맞는다(반영이면 칸이 바뀌고 철회는 거부, 철회면 칸 그대로)', async () => {
    const r = await send(pairs.ok)
    if (!r.ok) throw new Error(r.message)
    const before = await cellOf(pairs.ok.b, pairs.ok.date)
    const [acc, can] = await Promise.all([
      respondSwap(db, await actor(noOf.get(pairs.ok.b)!), r.id, 'accept', IN),
      cancelSwap(db, await actor(noOf.get(pairs.ok.a)!), r.id),
    ])
    const [q] = await db.select().from(swapRequests).where(eq(swapRequests.id, r.id))
    const after = await cellOf(pairs.ok.b, pairs.ok.date)
    if (q!.status === 'APPLIED') {
      expect(acc).toEqual({ ok: true, applied: true })
      expect(can.ok).toBe(false)
      expect(after.code).toBe(pairs.ok.ca)
    } else {
      expect(q!.status).toBe('CANCELLED')
      expect(acc).toMatchObject({ ok: false })
      expect(after.code).toBe(before.code)
    }
  })
})
