// Build Spec 2-1 business-logic-model §1. 시계(now)는 인자로 받는다(잠금·만료 테스트용).
// 쿠키·리다이렉트는 여기서 다루지 않는다 — Next 문맥은 actions.ts / session.ts가 맡는다.
import { EmployeeNoSchema } from '@duty/domain'
import { and, eq, gte, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { credentials, privacyConsents, sessions, users, wards } from '../db/schema'
import { PRIVACY_NOTICE_VERSION } from '../privacy/notice'
import { todaySeoul } from '../schedule/month'
import { hashPassword, validateNewPassword, verifyPassword } from './password'
import { generateSessionToken, hashSessionToken } from './tokens'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const LOCK_THRESHOLD = 5
export const LOCK_DURATION_MS = 15 * MINUTE
export const PERSISTENT_TTL_MS = 30 * DAY
export const TRANSIENT_TTL_MS = 12 * HOUR
const RENEW_BELOW_MS = 15 * DAY
const LAST_SEEN_INTERVAL_MS = 5 * MINUTE

// R-AUTH-2: 사용자가 없을 때도 같은 비용의 검증을 한 번 해서 응답 시간을 맞춘다
let dummyHash: Promise<string> | undefined
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'))

export type AuthResult =
  | { ok: true; userId: string; mustChangePassword: boolean }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'locked'; lockedUntil: Date }

export async function authenticate(
  db: Db,
  input: { employeeNo: string; password: string; now: Date },
): Promise<AuthResult> {
  const parsed = EmployeeNoSchema.safeParse(input.employeeNo)
  const [row] = parsed.success
    ? await db
        .select({ user: users, cred: credentials })
        .from(users)
        .innerJoin(credentials, eq(credentials.userId, users.id))
        .where(eq(users.employeeNo, parsed.data))
    : []

  if (!row || !row.user.active) {
    await verifyPassword(await getDummyHash(), input.password)
    return { ok: false, error: 'invalid' }
  }

  const { cred } = row
  if (cred.lockedUntil && cred.lockedUntil > input.now) {
    return { ok: false, error: 'locked', lockedUntil: cred.lockedUntil }
  }

  if (!(await verifyPassword(cred.passwordHash, input.password))) {
    await recordFailure(db, cred.userId, input.now)
    return { ok: false, error: 'invalid' }
  }

  await db
    .update(credentials)
    .set({ failedCount: 0, lockedUntil: null })
    .where(eq(credentials.userId, cred.userId))
  return { ok: true, userId: row.user.id, mustChangePassword: cred.mustChangePassword }
}

// R-AUTH-3: 실패 횟수는 DB에서 원자적으로 올린다(동시 실패 요청이 서로의 증가를 덮지 않도록, R-1).
// 잠금이 끝난 뒤의 실패는 1부터 다시 센다
async function recordFailure(db: Db, userId: string, now: Date) {
  const [r] = await db
    .update(credentials)
    .set({
      failedCount: sql`case when ${credentials.lockedUntil} is not null then 1 else ${credentials.failedCount} + 1 end`,
      lockedUntil: null,
    })
    .where(eq(credentials.userId, userId))
    .returning({ failed: credentials.failedCount })
  if ((r?.failed ?? 0) >= LOCK_THRESHOLD)
    await db
      .update(credentials)
      .set({ failedCount: 0, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) })
      .where(and(eq(credentials.userId, userId), gte(credentials.failedCount, LOCK_THRESHOLD)))
}

export async function createSession(
  db: Db,
  input: { userId: string; keep: boolean; userAgent?: string | null; now: Date },
): Promise<{ token: string; expiresAt: Date; persistent: boolean }> {
  const token = generateSessionToken()
  const expiresAt = new Date(input.now.getTime() + (input.keep ? PERSISTENT_TTL_MS : TRANSIENT_TTL_MS))
  await db.insert(sessions).values({
    id: hashSessionToken(token),
    userId: input.userId,
    persistent: input.keep,
    expiresAt,
    createdAt: input.now,
    lastSeenAt: input.now,
    userAgent: input.userAgent?.slice(0, 200) ?? null,
  })
  return { token, expiresAt, persistent: input.keep }
}

export type SessionUser = {
  id: string
  name: string
  employeeNo: string
  role: string
  rotation: string
  wardName: string
}

// 2-11 R-ONB-1: 로그인 뒤 남은 단계(순서대로 하나씩). null이면 모든 화면·액션을 쓸 수 있다
export type PendingStep = 'consent' | 'password' | 'onboarding' | 'annual'
export const STEP_PATH: Record<PendingStep, string> = {
  consent: '/consent',
  password: '/password',
  onboarding: '/onboarding',
  annual: '/onboarding',
}

export type ValidSession = {
  user: SessionUser
  mustChangePassword: boolean
  pendingStep: PendingStep | null
  persistent: boolean
  expiresAt: Date
  /** R-AUTH-8로 연장됐으면 새 만료 시각. 호출자가 쿠키를 다시 써야 한다. */
  renewedExpiresAt?: Date
}

export async function validateSession(
  db: Db,
  token: string,
  now: Date,
  opts: { renew?: boolean } = {},
): Promise<ValidSession | null> {
  const id = hashSessionToken(token)
  const [row] = await db
    .select({
      session: sessions,
      user: users,
      wardName: wards.name,
      mustChange: credentials.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(wards, eq(wards.id, users.wardId))
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(eq(sessions.id, id))
  if (!row) return null

  if (row.session.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, id))
    return null
  }
  if (!row.user.active) return null

  let expiresAt = row.session.expiresAt
  let renewedExpiresAt: Date | undefined
  const patch: Partial<typeof sessions.$inferInsert> = {}
  const renew = opts.renew ?? true
  if (renew && row.session.persistent && expiresAt.getTime() - now.getTime() < RENEW_BELOW_MS) {
    expiresAt = renewedExpiresAt = new Date(now.getTime() + PERSISTENT_TTL_MS)
    patch.expiresAt = expiresAt
  }
  if (now.getTime() - row.session.lastSeenAt.getTime() >= LAST_SEEN_INTERVAL_MS) patch.lastSeenAt = now
  if (Object.keys(patch).length > 0) await db.update(sessions).set(patch).where(eq(sessions.id, id))

  const { user } = row
  const [consent] = await db
    .select({ id: privacyConsents.id })
    .from(privacyConsents)
    .where(and(eq(privacyConsents.userId, user.id), eq(privacyConsents.version, PRIVACY_NOTICE_VERSION)))
    .limit(1)
  const year = Number(todaySeoul(now).slice(0, 4))
  const pendingStep: PendingStep | null = !consent
    ? 'consent'
    : row.mustChange
      ? 'password'
      : user.onboardedYear === null
        ? 'onboarding'
        : user.onboardedYear < year
          ? 'annual'
          : null
  return {
    user: {
      id: user.id,
      name: user.name,
      employeeNo: user.employeeNo,
      role: user.role,
      rotation: user.rotation,
      wardName: row.wardName,
    },
    mustChangePassword: row.mustChange,
    pendingStep,
    persistent: row.session.persistent,
    expiresAt,
    ...(renewedExpiresAt ? { renewedExpiresAt } : {}),
  }
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)))
}

export type ChangePasswordResult =
  { ok: true } | { ok: false; field: 'current' | 'next' | 'confirm'; message: string }

export async function changePassword(
  db: Db,
  input: { userId: string; sessionToken: string; current?: string; next: string; confirm: string; now: Date },
): Promise<ChangePasswordResult> {
  const [row] = await db
    .select({ employeeNo: users.employeeNo, cred: credentials })
    .from(users)
    .innerJoin(credentials, eq(credentials.userId, users.id))
    .where(eq(users.id, input.userId))
  if (!row) return { ok: false, field: 'current', message: '사용자를 찾을 수 없습니다.' }

  // 임시 비밀번호 상태(첫 로그인)에서는 현재 비밀번호를 묻지 않는다
  if (!row.cred.mustChangePassword) {
    // R-1: 세션을 가진 사람이 현재 비밀번호를 무제한 추측하지 못하게 로그인과 같은 잠금을 쓴다
    if (row.cred.lockedUntil && row.cred.lockedUntil > input.now)
      return {
        ok: false,
        field: 'current',
        message: '현재 비밀번호를 여러 번 틀려 잠겼습니다. 15분 뒤 다시 시도해 주세요.',
      }
    if (input.current === undefined || !(await verifyPassword(row.cred.passwordHash, input.current))) {
      await recordFailure(db, input.userId, input.now)
      return { ok: false, field: 'current', message: '현재 비밀번호가 올바르지 않습니다.' }
    }
  }

  const policyError = validateNewPassword(input.next, input.confirm, {
    employeeNo: row.employeeNo,
    ...(input.current !== undefined ? { current: input.current } : {}),
  })
  if (policyError) return { ok: false, ...policyError }
  // 첫 로그인 강제 변경은 current를 받지 않으므로 해시로 직접 비교한다
  if (await verifyPassword(row.cred.passwordHash, input.next)) {
    return { ok: false, field: 'next', message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' }
  }

  const passwordHash = await hashPassword(input.next)
  const currentId = hashSessionToken(input.sessionToken)
  await db.transaction(async (tx) => {
    await tx
      .update(credentials)
      .set({
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: input.now,
        failedCount: 0,
        lockedUntil: null,
      })
      .where(eq(credentials.userId, input.userId))
    await tx.delete(sessions).where(and(eq(sessions.userId, input.userId), ne(sessions.id, currentId)))
  })
  return { ok: true }
}
