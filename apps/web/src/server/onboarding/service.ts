import { SENIORITY_TIERS, TRAINEE_KINDS, isIsoDate, type SeniorityTier, type TraineeKind } from '@duty/domain'
import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client'
import { balanceEntries, onboardingSubmissions, trainings, users } from '../db/schema'
import { round1 } from '../schedule/balances'
import { loadLeaveBalance } from '../schedule/load'

// Build Spec 2-11 business-rules §6 (R-ONB-1~10) — 최초 로그인 초기 설정(S2)과 관리자 확인·되돌리기

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export type TrainingValue = {
  kind: TraineeKind
  preceptorId: string
  startDate: string
  endDate: string
  tripleStaffUntil: string
}

export type OnboardingValues = {
  hireDate: string | null
  kTass: boolean
  seniorityTier: SeniorityTier
  unionMember: boolean
  nightDedicated: { from: string; to: string } | null
  annual: number
  nightBank: number
  offCarry: number
  training: TrainingValue | null
}
type Key = keyof OnboardingValues

// 잔여치 → 원장 계정 (R-ONB-6)
const ACCOUNT = { annual: 'annual_leave', nightBank: 'night_bank', offCarry: 'off_carry' } as const
const NUMERIC = Object.keys(ACCOUNT) as (keyof typeof ACCOUNT)[]

export const FIELD_LABEL: Record<Key, string> = {
  hireDate: '입사일',
  kTass: 'K-tass',
  seniorityTier: '연차 구분',
  unionMember: '노조',
  nightDedicated: '근무 방식',
  annual: '올해 연차',
  nightBank: '잔여 N',
  offCarry: '이월 오프',
  training: '신규 트레이닝',
}

// R-ONB-2·3·9: 사람·모드별 묻는 항목
export function fieldsFor(head: boolean, mode: 'initial' | 'annual'): Key[] {
  if (mode === 'annual') return ['annual']
  if (head) return ['hireDate', 'kTass', 'unionMember', 'annual']
  return [
    'hireDate',
    'kTass',
    'seniorityTier',
    'unionMember',
    'nightDedicated',
    'annual',
    'nightBank',
    'offCarry',
    'training',
  ]
}

const date = z.string().refine(isIsoDate, '날짜를 확인해 주세요.')
const half = (min: number, max: number, label: string) =>
  z
    .number({ message: `${label}을(를) 입력해 주세요.` })
    .min(min, `${label}은(는) ${min} 이상입니다.`)
    .max(max, `${label}은(는) ${max} 이하입니다.`)
    .refine((n) => Number.isInteger(n * 2), `${label}은(는) 0.5 단위입니다.`)

// R-ONB-5
export const OnboardingInputSchema = z
  .object({
    hireDate: date.nullable(),
    kTass: z.boolean(),
    seniorityTier: z.enum(SENIORITY_TIERS),
    unionMember: z.boolean(),
    nightDedicated: z.object({ from: date, to: date }).nullable(),
    annual: half(0, 30, '올해 연차'),
    nightBank: z.number().int('잔여 N은 정수입니다.').min(0, '잔여 N은 0 이상입니다.').max(99),
    offCarry: half(-60, 60, '이월 오프'),
    training: z
      .object({
        kind: z.enum(TRAINEE_KINDS),
        preceptorId: z.string().uuid('프리셉터를 선택해 주세요.'),
        startDate: date,
        endDate: date,
        tripleStaffUntil: date,
      })
      .nullable(),
  })
  .partial()
  .superRefine((v, ctx) => {
    if (v.nightDedicated && v.nightDedicated.from > v.nightDedicated.to)
      ctx.addIssue({
        code: 'custom',
        path: ['nightDedicated'],
        message: '야간 전담 시작일이 종료일보다 늦습니다.',
      })
    const t = v.training
    if (t && !(t.startDate <= t.tripleStaffUntil && t.tripleStaffUntil <= t.endDate))
      ctx.addIssue({
        code: 'custom',
        path: ['training'],
        message: '트레이닝 시작 ≤ 3인 근무 종료 ≤ 트레이닝 종료 순서여야 합니다.',
      })
  })
export type OnboardingInput = z.infer<typeof OnboardingInputSchema>

async function currentTraining(db: Db | Tx, userId: string, today: string) {
  const [t] = await db
    .select()
    .from(trainings)
    .where(and(eq(trainings.traineeId, userId), gte(trainings.endDate, today)))
    .orderBy(desc(trainings.startDate))
    .limit(1)
  return t ?? null
}

// R-ONB-4: 지금 값(잔여치는 근무표와 같은 오늘 달 월말 예정)
export async function currentValues(db: Db, userId: string, today: string): Promise<OnboardingValues> {
  const [u] = await db.select().from(users).where(eq(users.id, userId))
  if (!u) throw new Error('사용자 없음')
  const b = await loadLeaveBalance(db, { viewerId: userId, today })
  const t = await currentTraining(db, userId, today)
  return {
    hireDate: u.hireDate,
    kTass: u.kTass,
    seniorityTier: u.seniorityTier as SeniorityTier,
    unionMember: u.unionMember,
    nightDedicated:
      u.nightDedicatedFrom && u.nightDedicatedTo
        ? { from: u.nightDedicatedFrom, to: u.nightDedicatedTo }
        : null,
    annual: b.annual,
    nightBank: b.nightBank,
    offCarry: b.offCarry,
    training: t
      ? {
          kind: t.kind as TraineeKind,
          preceptorId: t.preceptorId,
          startDate: t.startDate,
          endDate: t.endDate,
          tripleStaffUntil: t.tripleStaffUntil,
        }
      : null,
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export type OnboardingView = {
  name: string
  head: boolean
  mode: 'initial' | 'annual'
  year: number
  fields: Key[]
  values: OnboardingValues
  preceptors: { id: string; name: string }[]
  nightDedicatedOn: boolean
  monthLabel: string
}

export async function loadOnboarding(
  db: Db,
  a: { userId: string; today: string; mode: 'initial' | 'annual'; nightDedicatedOn: boolean },
): Promise<OnboardingView> {
  const [u] = await db.select().from(users).where(eq(users.id, a.userId))
  const head = u!.rotation === 'fixed_weekday'
  const preceptors = await db
    .select({ id: users.id, name: users.name, rotation: users.rotation })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.seniorityRank))
  return {
    name: u!.name,
    head,
    mode: a.mode,
    year: Number(a.today.slice(0, 4)),
    fields: fieldsFor(head, a.mode),
    values: await currentValues(db, a.userId, a.today),
    preceptors: preceptors
      .filter((p) => p.rotation === 'rotating' && p.id !== a.userId)
      .map(({ id, name }) => ({ id, name })),
    nightDedicatedOn: a.nightDedicatedOn,
    monthLabel: `${Number(a.today.slice(5, 7))}월 말`,
  }
}

async function setTraining(tx: Tx, userId: string, t: TrainingValue | null, today: string, by: string) {
  const cur = await currentTraining(tx, userId, today)
  if (!t) {
    if (!cur) return
    // 2-4 updateStaff와 같게: 시작 전이면 지우고, 진행 중이면 어제 끝낸다
    if (cur.startDate > today) await tx.delete(trainings).where(eq(trainings.id, cur.id))
    else {
      const y = new Date(`${today}T00:00:00Z`)
      y.setUTCDate(y.getUTCDate() - 1)
      await tx
        .update(trainings)
        .set({ endDate: y.toISOString().slice(0, 10) })
        .where(eq(trainings.id, cur.id))
    }
    return
  }
  if (cur) await tx.update(trainings).set(t).where(eq(trainings.id, cur.id))
  else await tx.insert(trainings).values({ traineeId: userId, ...t, createdBy: by })
}

async function applyValues(
  tx: Tx,
  userId: string,
  changed: Partial<OnboardingValues>,
  before: Partial<OnboardingValues>,
  ledger: { reason: 'self_input' | 'admin_adjust'; note: string; by: string },
  today: string,
) {
  const patch: Partial<typeof users.$inferInsert> = {}
  if ('hireDate' in changed) patch.hireDate = changed.hireDate ?? null
  if ('kTass' in changed) patch.kTass = changed.kTass!
  if ('seniorityTier' in changed) patch.seniorityTier = changed.seniorityTier!
  if ('unionMember' in changed) patch.unionMember = changed.unionMember!
  if ('nightDedicated' in changed) {
    patch.nightDedicatedFrom = changed.nightDedicated?.from ?? null
    patch.nightDedicatedTo = changed.nightDedicated?.to ?? null
  }
  if (Object.keys(patch).length)
    await tx
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
  const rows = NUMERIC.filter((k) => k in changed)
    .map((k) => ({ account: ACCOUNT[k], delta: round1((changed[k] as number) - (before[k] as number)) }))
    .filter((r) => r.delta !== 0)
  if (rows.length)
    await tx.insert(balanceEntries).values(
      rows.map((r) => ({
        userId,
        account: r.account,
        delta: String(r.delta),
        reason: ledger.reason,
        note: ledger.note,
        createdBy: ledger.by,
      })),
    )
  if ('training' in changed) await setTraining(tx, userId, changed.training ?? null, today, ledger.by)
}

export type SaveResult = { ok: true; changed: number } | { ok: false; message: string; field?: string }

// R-ONB-6: 한 트랜잭션(사용자 행 잠금) — 다시 읽기 → 차이 → 반영 → 제출 기록 → onboardedYear
export async function saveOnboarding(
  db: Db,
  // year: onboardedYear에 쓸 해. 세션 단계 판정(validateSession)과 같은 실제 서울 날짜의 해(E2E 가짜 시계와 무관)
  a: { userId: string; today: string; mode: 'initial' | 'annual'; input: unknown; year?: number },
): Promise<SaveResult> {
  const parsed = OnboardingInputSchema.safeParse(a.input)
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return {
      ok: false,
      message: i?.message ?? '입력을 확인해 주세요.',
      ...(i?.path[0] ? { field: String(i.path[0]) } : {}),
    }
  }
  const year = a.year ?? Number(a.today.slice(0, 4))
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, a.userId)).for('update')
    if (!u) return { ok: false as const, message: '사용자를 찾을 수 없습니다.' }
    const fields = fieldsFor(u.rotation === 'fixed_weekday', a.mode)
    const missing = fields.find((k) => !(k in parsed.data))
    if (missing)
      return { ok: false as const, message: `${FIELD_LABEL[missing]}을(를) 입력해 주세요.`, field: missing }
    const t = parsed.data.training
    if (
      t &&
      (t.preceptorId === a.userId ||
        !(
          await tx
            .select()
            .from(users)
            .where(and(eq(users.id, t.preceptorId), eq(users.active, true), eq(users.rotation, 'rotating')))
        ).length)
    )
      return { ok: false as const, message: '프리셉터를 다시 선택해 주세요.', field: 'training' }

    const cur = await currentValues(tx as unknown as Db, a.userId, a.today)
    const before: Partial<OnboardingValues> = {}
    const after: Partial<OnboardingValues> = {}
    for (const k of fields)
      if (!same(cur[k], parsed.data[k])) {
        ;(before as Record<string, unknown>)[k] = cur[k]
        ;(after as Record<string, unknown>)[k] = parsed.data[k]
      }
    const changed = Object.keys(after).length
    if (changed) {
      await applyValues(
        tx,
        a.userId,
        after,
        before,
        { reason: 'self_input', note: '본인 초기 설정', by: a.userId },
        a.today,
      )
      await tx.insert(onboardingSubmissions).values({
        userId: a.userId,
        year,
        kind: a.mode,
        before: before as Record<string, unknown>,
        after: after as Record<string, unknown>,
      })
    }
    await tx.update(users).set({ onboardedYear: year, updatedAt: new Date() }).where(eq(users.id, a.userId))
    return { ok: true as const, changed }
  })
}

// R-ONB-7: 간호사 관리의 미확인 제출
export type PendingSubmission = {
  id: string
  userId: string
  submittedAt: Date
  items: { key: Key; label: string; before: string; after: string }[]
}

export function showValue(k: Key, v: unknown, names: Map<string, string>): string {
  if (v === null || v === undefined)
    return k === 'nightDedicated' ? '교대 근무' : k === 'training' ? '아님' : '—'
  if (typeof v === 'boolean') return v ? '예' : '아니오'
  if (k === 'seniorityTier')
    return { senior: '고연차', mid: '중간연차', junior: '저연차' }[v as SeniorityTier]
  if (k === 'nightDedicated') {
    const n = v as { from: string; to: string }
    return `야간 전담 ${n.from}~${n.to}`
  }
  if (k === 'training') {
    const t = v as TrainingValue
    return `${t.kind === 'new_grad' ? '완전 신규' : '경력자'} · 프리셉터 ${names.get(t.preceptorId) ?? '?'} · ${t.startDate}~${t.endDate} (3인 ~${t.tripleStaffUntil})`
  }
  return String(v)
}

export async function pendingSubmissions(db: Db): Promise<PendingSubmission[]> {
  const rows = await db
    .select()
    .from(onboardingSubmissions)
    .where(isNull(onboardingSubmissions.reviewedAt))
    .orderBy(asc(onboardingSubmissions.submittedAt))
  const names = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  )
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    submittedAt: r.submittedAt,
    items: (Object.keys(r.after) as Key[]).map((k) => ({
      key: k,
      label: FIELD_LABEL[k],
      before: showValue(k, r.before[k], names),
      after: showValue(k, r.after[k], names),
    })),
  }))
}

export async function reviewSubmission(
  db: Db,
  a: { id: string; adminId: string; decision: 'confirmed' | 'reverted'; note?: string; today: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const note = a.note?.trim()
  if (a.decision === 'reverted' && !note) return { ok: false, message: '되돌리는 사유를 적어 주세요.' }
  return db.transaction(async (tx) => {
    const [q] = await tx
      .select()
      .from(onboardingSubmissions)
      .where(eq(onboardingSubmissions.id, a.id))
      .for('update')
    if (!q) return { ok: false as const, message: '제출을 찾을 수 없습니다.' }
    if (q.reviewedAt) return { ok: false as const, message: '이미 확인한 제출입니다.' }
    await tx.select({ id: users.id }).from(users).where(eq(users.id, q.userId)).for('update')
    if (a.decision === 'reverted') {
      // 되돌리기: 제출 전 값으로. 잔여치는 지금 값과 상관없이 제출한 만큼 반대로 쌓는다(그 사이 관리자 조정 보존)
      const after = q.after as Partial<OnboardingValues>
      const before = q.before as Partial<OnboardingValues>
      await applyValues(
        tx,
        q.userId,
        before,
        after,
        { reason: 'admin_adjust', note: `본인 초기 설정 되돌림: ${note}`, by: a.adminId },
        a.today,
      )
    }
    await tx
      .update(onboardingSubmissions)
      .set({ reviewedAt: new Date(), reviewedBy: a.adminId, review: a.decision, reviewNote: note || null })
      .where(eq(onboardingSubmissions.id, a.id))
    return { ok: true as const }
  })
}
