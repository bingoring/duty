import {
  addDays,
  defaultTrainingEnd,
  employedDaysInYear,
  specialLeaveDays,
  type Role,
  type RuleSet,
  type Rotation,
  type SeniorityTier,
  type TraineeKind,
} from '@duty/domain'
import { and, asc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { balanceEntries, credentials, sessions, trainings, users } from '../db/schema'
import { hashPassword } from '../auth/password'
import { generateTempPassword } from '../auth/tokens'
import { ensureWard } from '../seed/core'
import { reconcileFoundingOff } from '../holidays/founding'
import { ledgerSums, round1, type Sums } from '../schedule/balances'
import type { BalanceAdjustInput, FieldErrors, StaffCreateInput, StaffUpdateInput } from '../admin/schemas'

// Build Spec 2-4 business-rules §1.1 — S10 간호사 관리
export type StaffCtx = { adminId: string; today: string; rules: RuleSet }

export type StaffTraining = {
  id: string
  kind: TraineeKind
  preceptorId: string
  preceptorName: string
  startDate: string
  endDate: string
  tripleStaffUntil: string
}

export type StaffRow = {
  id: string
  employeeNo: string
  name: string
  hireDate: string | null
  years: number | null
  kTass: boolean
  seniorityTier: SeniorityTier
  seniorityRank: number
  unionMember: boolean
  rotation: Rotation
  role: Role
  roleLabel: string
  training: StaffTraining | null
  trainingText: string
  balances: Sums
}

export function yearsOfService(hireDate: string | null, today: string): number | null {
  if (!hireDate) return null
  const [y1, m1, d1] = hireDate.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = today.split('-').map(Number) as [number, number, number]
  return Math.max(0, y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0))
}

export async function listStaff(db: Db, today: string): Promise<StaffRow[]> {
  const people = await db.select().from(users).where(eq(users.active, true)).orderBy(asc(users.seniorityRank))
  const names = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  )
  const open = await db.select().from(trainings).where(gte(trainings.endDate, today))
  const sums = await ledgerSums(
    db,
    people.map((u) => u.id),
  )
  const inProgress = (t: (typeof open)[number]) => t.startDate <= today && today <= t.endDate
  return people.map((u) => {
    const t = open.find((x) => x.traineeId === u.id)
    const roleLabel =
      u.rotation === 'fixed_weekday' || u.role === 'admin'
        ? '수간호사 · 관리자'
        : t && inProgress(t)
          ? '신규'
          : open.some((x) => x.preceptorId === u.id && inProgress(x))
            ? '프리셉터'
            : '간호사'
    const training: StaffTraining | null = t
      ? {
          id: t.id,
          kind: t.kind as TraineeKind,
          preceptorId: t.preceptorId,
          preceptorName: names.get(t.preceptorId) ?? '',
          startDate: t.startDate,
          endDate: t.endDate,
          tripleStaffUntil: t.tripleStaffUntil,
        }
      : null
    return {
      id: u.id,
      employeeNo: u.employeeNo,
      name: u.name,
      hireDate: u.hireDate,
      years: yearsOfService(u.hireDate, today),
      kTass: u.kTass,
      seniorityTier: u.seniorityTier as SeniorityTier,
      seniorityRank: u.seniorityRank,
      unionMember: u.unionMember,
      rotation: u.rotation as Rotation,
      role: u.role as Role,
      roleLabel,
      training,
      trainingText: training ? `~${training.endDate} · 프리셉터 ${training.preceptorName}` : '—',
      balances: sums.get(u.id)!,
    }
  })
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

async function checkPreceptor(tx: Tx, preceptorId: string, selfId?: string): Promise<boolean> {
  const [p] = await tx.select().from(users).where(eq(users.id, preceptorId))
  return !!p && p.active && p.rotation === 'rotating' && p.id !== selfId
}

function trainingDates(start: string, weeks: number, rules: RuleSet) {
  const endDate = defaultTrainingEnd(start, rules.params)
  const triple = addDays(start, 7 * weeks - 1)
  return {
    startDate: start,
    endDate,
    tripleStaffUntil: triple > endDate ? endDate : triple < start ? start : triple,
  }
}

export type CreateResult =
  { ok: true; userId: string; tempPassword: string } | { ok: false; errors: FieldErrors }

export async function createStaff(db: Db, input: StaffCreateInput, ctx: StaffCtx): Promise<CreateResult> {
  const employeeNo = input.employeeNo.trim()
  if (input.training && !input.hireDate)
    return { ok: false, errors: { hireDate: '신규 간호사는 입사일(트레이닝 시작일)이 필요합니다.' } }
  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)
  const year = Number(ctx.today.slice(0, 4))
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: users.id }).from(users).where(eq(users.employeeNo, employeeNo))
    if (dup) return { ok: false as const, errors: { employeeNo: '이미 등록된 사번입니다.' } }
    if (input.training && !(await checkPreceptor(tx, input.training.preceptorId)))
      return { ok: false as const, errors: { preceptorId: '프리셉터를 선택해 주세요.' } }
    const wardId = await ensureWard(tx)
    const [{ max }] = (await tx
      .select({ max: sql<number>`coalesce(max(${users.seniorityRank}), 0)` })
      .from(users)) as [{ max: number }]
    const [u] = await tx
      .insert(users)
      .values({
        wardId,
        employeeNo,
        name: input.name,
        role: input.role,
        rotation: input.rotation,
        seniorityRank: Number(max) + 1,
        seniorityTier: input.seniorityTier,
        hireDate: input.hireDate,
        kTass: input.kTass,
        unionMember: input.unionMember,
      })
      .returning({ id: users.id })
    const userId = u!.id
    await tx.insert(credentials).values({ userId, passwordHash, mustChangePassword: true })
    // R-STAFF-ADD-4: 초기 원장(0 생략) + 자동 부여. 입사일이 없으면 1년 재직으로 본다
    const initial = {
      annual_leave: input.annualLeave,
      night_bank: input.nightBank,
      off_carry: input.offCarry,
    }
    const grants = {
      special_leave: specialLeaveDays(employedDaysInYear(year, input.hireDate, null)),
      checkup: 0.5,
      sick_leave: 60,
    }
    const entries = [
      ...Object.entries(initial).map(([account, delta]) => ({
        account,
        delta,
        reason: 'initial_input',
        refYear: null,
      })),
      ...Object.entries(grants).map(([account, delta]) => ({
        account,
        delta,
        reason: 'year_grant',
        refYear: year,
      })),
    ].filter((e) => e.delta !== 0)
    if (entries.length)
      await tx
        .insert(balanceEntries)
        .values(entries.map((e) => ({ ...e, userId, delta: String(e.delta), createdBy: ctx.adminId })))
    await reconcileFoundingOff(tx, year, { userIds: [userId], createdBy: ctx.adminId })
    if (input.training && input.hireDate) {
      await tx.insert(trainings).values({
        traineeId: userId,
        preceptorId: input.training.preceptorId,
        kind: input.training.kind,
        ...trainingDates(input.hireDate, input.training.tripleWeeks, ctx.rules),
        createdBy: ctx.adminId,
      })
    }
    return { ok: true as const, userId, tempPassword }
  })
}

export type Result = { ok: true } | { ok: false; errors?: FieldErrors; message?: string }

export async function updateStaff(
  db: Db,
  userId: string,
  input: StaffUpdateInput,
  ctx: StaffCtx,
): Promise<Result> {
  if (input.training && !input.hireDate)
    return { ok: false, errors: { hireDate: '신규 간호사는 입사일(트레이닝 시작일)이 필요합니다.' } }
  return db.transaction(async (tx) => {
    if (input.training && !(await checkPreceptor(tx, input.training.preceptorId, userId)))
      return { ok: false as const, errors: { preceptorId: '프리셉터를 선택해 주세요.' } }
    await tx
      .update(users)
      .set({
        name: input.name,
        hireDate: input.hireDate,
        kTass: input.kTass,
        seniorityTier: input.seniorityTier,
        unionMember: input.unionMember,
        rotation: input.rotation,
        role: input.role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
    // R-STAFF-EDIT-1: 표 순서 — 활성 사용자를 다시 1..n으로 매긴다
    const active = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.seniorityRank))
    const order = active.map((x) => x.id).filter((id) => id !== userId)
    order.splice(Math.min(input.seniorityRank, order.length + 1) - 1, 0, userId)
    for (const [i, id] of order.entries())
      await tx
        .update(users)
        .set({ seniorityRank: i + 1 })
        .where(eq(users.id, id))
    // R-STAFF-EDIT-2: 트레이닝
    const [current] = await tx
      .select()
      .from(trainings)
      .where(and(eq(trainings.traineeId, userId), gte(trainings.endDate, ctx.today)))
    if (!input.training && current) {
      if (current.startDate > ctx.today) await tx.delete(trainings).where(eq(trainings.id, current.id))
      else
        await tx
          .update(trainings)
          .set({ endDate: addDays(ctx.today, -1) })
          .where(eq(trainings.id, current.id))
    } else if (input.training && input.hireDate) {
      const dates = trainingDates(current?.startDate ?? input.hireDate, input.training.tripleWeeks, ctx.rules)
      const values = {
        preceptorId: input.training.preceptorId,
        kind: input.training.kind,
        tripleStaffUntil: dates.tripleStaffUntil,
      }
      if (current) await tx.update(trainings).set(values).where(eq(trainings.id, current.id))
      else
        await tx.insert(trainings).values({ traineeId: userId, ...dates, ...values, createdBy: ctx.adminId })
    }
    return { ok: true as const }
  })
}

export async function removeStaff(db: Db, userId: string, ctx: StaffCtx): Promise<Result> {
  if (userId === ctx.adminId) return { ok: false, message: '자기 자신은 제거할 수 없습니다.' }
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId))
    if (!u || !u.active) return { ok: false as const, message: '이미 제거된 간호사입니다.' }
    if (u.role === 'admin') {
      const others = await tx.$count(
        users,
        and(eq(users.role, 'admin'), eq(users.active, true), ne(users.id, userId)),
      )
      if (others === 0) return { ok: false as const, message: '마지막 관리자는 제거할 수 없습니다.' }
    }
    const precepting = await tx.$count(
      trainings,
      and(
        eq(trainings.preceptorId, userId),
        lte(trainings.startDate, ctx.today),
        gte(trainings.endDate, ctx.today),
      ),
    )
    if (precepting > 0)
      return {
        ok: false as const,
        message: '진행 중 트레이닝의 프리셉터입니다. 트레이닝을 먼저 수정해 주세요.',
      }
    await tx
      .update(users)
      .set({ active: false, deactivatedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
    return { ok: true as const }
  })
}

export async function reissuePassword(db: Db, userId: string): Promise<{ tempPassword: string }> {
  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)
  await db.transaction(async (tx) => {
    await tx
      .update(credentials)
      .set({ passwordHash, mustChangePassword: true, failedCount: 0, lockedUntil: null })
      .where(eq(credentials.userId, userId))
    await tx.delete(sessions).where(eq(sessions.userId, userId))
  })
  return { tempPassword }
}

export async function adjustBalances(db: Db, input: BalanceAdjustInput, adminId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const sums = (await ledgerSums(tx as unknown as Db, [input.userId])).get(input.userId)!
    const rows = Object.entries(input.values)
      .map(([account, value]) => ({
        account,
        delta: round1((value as number) - sums[account as keyof Sums]),
      }))
      .filter((r) => r.delta !== 0)
    if (rows.length)
      await tx.insert(balanceEntries).values(
        rows.map((r) => ({
          userId: input.userId,
          account: r.account,
          delta: String(r.delta),
          reason: 'admin_adjust',
          note: input.note,
          createdBy: adminId,
        })),
      )
  })
}
