import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { createSession, validateSession } from '../auth/service'
import { balanceEntries, onboardingSubmissions, privacyConsents, trainings, users } from '../db/schema'
import { recordConsent } from '../privacy/service'
import { PRIVACY_NOTICE_VERSION } from '../privacy/notice'
import { seedDev } from '../seed/dev'
import { currentValues, pendingSubmissions, reviewSubmission, saveOnboarding } from './service'

// Build Spec 2-11 R-CONSENT·R-ONB. 종이 10월(가명) 시드
const db = setupTestDb()
const TODAY = '2026-10-09'
const NOW = new Date('2026-10-09T09:00:00+09:00')

async function user(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return u!
}
// 시드 사용자를 처음 로그인하는 상태로(동의 없음·초기 설정 전)
async function fresh(no: string) {
  const u = await user(no)
  await db.delete(privacyConsents).where(eq(privacyConsents.userId, u.id))
  await db.update(users).set({ onboardedYear: null }).where(eq(users.id, u.id))
  return u
}
async function step(userId: string) {
  const s = await createSession(db, { userId, keep: false, userAgent: null, now: NOW })
  return (await validateSession(db, s.token, NOW, { renew: false }))!.pendingStep
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('로그인 뒤 단계 (R-CONSENT-1, R-ONB-1)', () => {
  it('동의 → 비밀번호 → 초기 설정 → 없음, 해가 바뀌면 연차만', async () => {
    const u = await fresh('00103')
    expect(await step(u.id)).toBe('consent')
    expect(
      await recordConsent(db, { userId: u.id, required: true, sensitive: false, ip: null, now: NOW }),
    ).toMatchObject({ ok: false })
    expect(
      await recordConsent(db, { userId: u.id, required: true, sensitive: true, ip: '1.2.3.4', now: NOW }),
    ).toEqual({ ok: true })
    expect(await step(u.id)).toBe('onboarding')
    await db.update(users).set({ onboardedYear: 2025 }).where(eq(users.id, u.id))
    expect(await step(u.id)).toBe('annual')
    await db.update(users).set({ onboardedYear: 2026 }).where(eq(users.id, u.id))
    expect(await step(u.id)).toBeNull()
    // 동의서 버전이 바뀌면 다시 동의
    await db.update(privacyConsents).set({ version: 'old' }).where(eq(privacyConsents.userId, u.id))
    expect(await step(u.id)).toBe('consent')
    expect(PRIVACY_NOTICE_VERSION).not.toBe('old')
  })
})

describe('초기 설정 저장 (R-ONB-4~9)', () => {
  it('미리 채운 값을 그대로 저장하면 기록 없이 끝, onboardedYear만', async () => {
    const u = await fresh('00104')
    const cur = await currentValues(db, u.id, TODAY)
    expect(
      await saveOnboarding(db, { userId: u.id, today: TODAY, mode: 'initial', input: cur, year: 2026 }),
    ).toEqual({
      ok: true,
      changed: 0,
    })
    expect((await user('00104')).onboardedYear).toBe(2026)
    expect(await db.select().from(onboardingSubmissions)).toHaveLength(0)
  })

  it('바꾼 잔여치는 차이만 원장(self_input)에, 인적 항목은 users에, 제출 기록 → 관리자 되돌리기', async () => {
    const u = await fresh('00105')
    const head = await user('00101')
    const cur = await currentValues(db, u.id, TODAY)
    const input = {
      ...cur,
      kTass: !cur.kTass,
      nightBank: cur.nightBank + 2,
      offCarry: cur.offCarry - 1.5,
      annual: cur.annual + 1,
    }
    expect(
      await saveOnboarding(db, { userId: u.id, today: TODAY, mode: 'initial', input, year: 2026 }),
    ).toMatchObject({
      ok: true,
      changed: 4,
    })
    const after = await currentValues(db, u.id, TODAY)
    expect([after.kTass, after.nightBank, after.offCarry, after.annual]).toEqual([
      !cur.kTass,
      cur.nightBank + 2,
      cur.offCarry - 1.5,
      cur.annual + 1,
    ])
    const self = await db
      .select()
      .from(balanceEntries)
      .where(and(eq(balanceEntries.userId, u.id), eq(balanceEntries.reason, 'self_input')))
    expect(self.map((e) => [e.account, Number(e.delta)]).sort()).toEqual(
      [
        ['annual_leave', 1],
        ['night_bank', 2],
        ['off_carry', -1.5],
      ].sort(),
    )
    const [p] = await pendingSubmissions(db)
    expect(p!.items.map((i) => i.key).sort()).toEqual(['annual', 'kTass', 'nightBank', 'offCarry'])

    expect(
      await reviewSubmission(db, { id: p!.id, adminId: head.id, decision: 'reverted', today: TODAY }),
    ).toMatchObject({ ok: false })
    expect(
      await reviewSubmission(db, {
        id: p!.id,
        adminId: head.id,
        decision: 'reverted',
        note: '확인 결과 기존 값',
        today: TODAY,
      }),
    ).toEqual({ ok: true })
    const back = await currentValues(db, u.id, TODAY)
    expect([back.kTass, back.nightBank, back.offCarry, back.annual]).toEqual([
      cur.kTass,
      cur.nightBank,
      cur.offCarry,
      cur.annual,
    ])
    expect(await pendingSubmissions(db)).toHaveLength(0)
    expect(
      await reviewSubmission(db, { id: p!.id, adminId: head.id, decision: 'confirmed', today: TODAY }),
    ).toMatchObject({ ok: false })
  })

  it('신규 트레이닝을 만들고, 프리셉터가 본인·수간호사면 거부, 날짜 순서 검사', async () => {
    const u = await fresh('00111')
    const pre = await user('00102')
    const head = await user('00101')
    const cur = await currentValues(db, u.id, TODAY)
    const training = {
      kind: 'new_grad' as const,
      preceptorId: pre.id,
      startDate: '2026-10-12',
      endDate: '2027-01-11',
      tripleStaffUntil: '2026-11-01',
    }
    const save = (t: unknown) =>
      saveOnboarding(db, {
        userId: u.id,
        today: TODAY,
        mode: 'initial',
        input: { ...cur, training: t },
        year: 2026,
      })
    expect(await save({ ...training, preceptorId: head.id })).toMatchObject({ ok: false, field: 'training' })
    expect(await save({ ...training, preceptorId: u.id })).toMatchObject({ ok: false, field: 'training' })
    expect(await save({ ...training, tripleStaffUntil: '2027-02-01' })).toMatchObject({
      ok: false,
      field: 'training',
    })
    expect(await save(training)).toMatchObject({ ok: true, changed: 1 })
    const [t] = await db.select().from(trainings).where(eq(trainings.traineeId, u.id))
    expect(t).toMatchObject({
      preceptorId: pre.id,
      startDate: '2026-10-12',
      tripleStaffUntil: '2026-11-01',
      createdBy: u.id,
    })
  })

  it('수간호사는 교대 항목 없이, 해마다 모드는 연차만 받는다', async () => {
    const h = await fresh('00101')
    const cur = await currentValues(db, h.id, TODAY)
    const { hireDate, kTass, unionMember, annual } = cur
    expect(
      await saveOnboarding(db, {
        userId: h.id,
        today: TODAY,
        mode: 'initial',
        input: { hireDate, kTass, unionMember },
        year: 2026,
      }),
    ).toMatchObject({
      ok: false,
      field: 'annual',
    })
    expect(
      await saveOnboarding(db, {
        userId: h.id,
        today: TODAY,
        mode: 'initial',
        input: { hireDate, kTass, unionMember, annual },
        year: 2026,
      }),
    ).toMatchObject({ ok: true })
    const n = await user('00106')
    expect(
      await saveOnboarding(db, {
        userId: n.id,
        today: '2027-01-02',
        mode: 'annual',
        input: { annual: 16 },
        year: 2027,
      }),
    ).toMatchObject({
      ok: true,
      changed: 1,
    })
    expect((await user('00106')).onboardedYear).toBe(2027)
  })
})
