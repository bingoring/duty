import { DEFAULT_RULES } from '@duty/domain'
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { authenticate } from '../auth/service'
import { credentials, holidays, ruleVersions, users, wards } from '../db/schema'
import { bootstrap } from './bootstrap'
import { DEV_PASSWORD, DEV_ROSTER, seedDev } from './dev'
import { SEED_HOLIDAYS } from './holidays'
import { importRoster, type RosterRow } from './roster'

const db = setupTestDb()
const T0 = new Date('2026-10-01T09:00:00+09:00')

async function counts() {
  const tables = ['wards', 'users', 'credentials', 'holidays', 'rule_versions']
  const out: Record<string, number> = {}
  for (const t of tables) {
    const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`))
    out[t] = (r[0] as { n: number }).n
  }
  return out
}

beforeEach(() => resetDb(db))

describe('seedDev', () => {
  it('병동·규칙 v1·공휴일·가명 11명을 넣는다', async () => {
    await seedDev(db)
    expect(await counts()).toEqual({
      wards: 1,
      users: 11,
      credentials: 11,
      holidays: SEED_HOLIDAYS.length,
      rule_versions: 1,
    })
  })

  it('두 번 실행해도 행 수가 같다 (INV5)', async () => {
    await seedDev(db)
    const first = await counts()
    await seedDev(db)
    expect(await counts()).toEqual(first)
  })

  it('규칙 v1이 DEFAULT_RULES와 같다 (INV6)', async () => {
    await seedDev(db)
    const [v1] = await db.select().from(ruleVersions)
    expect({ params: v1!.params, toggles: v1!.toggles, forbiddenPatterns: v1!.forbiddenPatterns }).toEqual(
      DEFAULT_RULES,
    )
    expect([v1!.version, v1!.diff, v1!.changedBy]).toEqual([1, [], null])
  })

  it('가명 계정은 개발 비밀번호로 바로 로그인된다 (R-SEED-4)', async () => {
    await seedDev(db)
    const r = await authenticate(db, { employeeNo: '00103', password: DEV_PASSWORD, now: T0 })
    expect(r).toMatchObject({ ok: true, mustChangePassword: false })
  })

  it('수간호사는 관리자·고정 평일 근무다', async () => {
    await seedDev(db)
    const [head] = await db.select().from(users).where(eq(users.employeeNo, '00101'))
    expect(head).toMatchObject({
      name: '한수정',
      role: 'admin',
      rotation: 'fixed_weekday',
      seniorityRank: 1,
      kTass: true,
    })
  })

  it('명단 구성이 요구사항 원문과 같다: K-tass 7명, 노조 4명, 연차 구분 6/2/3', async () => {
    expect(DEV_ROSTER.filter((u) => u.kTass)).toHaveLength(7)
    expect(DEV_ROSTER.filter((u) => u.unionMember)).toHaveLength(4)
    const tiers = DEV_ROSTER.map((u) => u.seniorityTier)
    expect([
      tiers.filter((t) => t === 'senior').length,
      tiers.filter((t) => t === 'mid').length,
      tiers.filter((t) => t === 'junior').length,
    ]).toEqual([6, 2, 3])
  })
})

describe('bootstrap', () => {
  it('병동·규칙·공휴일과 관리자 1명을 만들고 임시 비밀번호를 한 번 돌려준다 (R-BOOT-1·2)', async () => {
    const r = await bootstrap(db, { employeeNo: '12345', name: '관리자' })
    expect(r.created).toBe(true)
    expect(r.created && r.tempPassword).toMatch(/^[A-Za-z2-9]{12}$/)
    expect(await counts()).toEqual({
      wards: 1,
      users: 1,
      credentials: 1,
      holidays: SEED_HOLIDAYS.length,
      rule_versions: 1,
    })
    const [cred] = await db.select().from(credentials)
    expect(cred!.mustChangePassword).toBe(true)
    const [admin] = await db.select().from(users)
    expect(admin).toMatchObject({
      role: 'admin',
      rotation: 'fixed_weekday',
      seniorityRank: 1,
      seniorityTier: 'senior',
    })
  })

  it('관리자가 이미 있으면 계정을 만들지 않는다', async () => {
    await bootstrap(db, { employeeNo: '12345', name: '관리자' })
    const r = await bootstrap(db, { employeeNo: '99999', name: '다른 사람' })
    expect(r.created).toBe(false)
    expect((await counts()).users).toBe(1)
  })
})

describe('importRoster', () => {
  const rows: RosterRow[] = [
    {
      employeeNo: '00101',
      name: '한수정',
      role: 'admin',
      rotation: 'fixed_weekday',
      seniorityRank: 1,
      seniorityTier: 'senior',
      hireDate: null,
      kTass: true,
      unionMember: true,
    },
    {
      employeeNo: '00109',
      name: '서예린',
      role: 'nurse',
      rotation: 'rotating',
      seniorityRank: 9,
      seniorityTier: 'junior',
      hireDate: '2025-03-02',
      kTass: false,
      unionMember: false,
    },
  ]

  it('새 사용자만 계정과 임시 비밀번호를 만든다 (R-ROSTER-1)', async () => {
    await bootstrap(db, { employeeNo: '00101', name: '한수정' })
    const r = await importRoster(db, rows)
    expect(r.created.map((c) => c.employeeNo)).toEqual(['00109'])
    expect(r.created[0]!.tempPassword).toHaveLength(12)
    expect(r.updated).toBe(1)
  })

  it('기존 사용자의 속성은 갱신하되 비밀번호는 건드리지 않는다', async () => {
    await bootstrap(db, { employeeNo: '00101', name: '임시이름' })
    const [before] = await db.select().from(credentials)
    await importRoster(db, rows)
    const [head] = await db.select().from(users).where(eq(users.employeeNo, '00101'))
    const [after] = await db.select().from(credentials).where(eq(credentials.userId, head!.id))
    expect(head!.name).toBe('한수정')
    expect(after!.passwordHash).toBe(before!.passwordHash)
  })

  it('앞자리 0을 보존해 저장한다 (INV1)', async () => {
    await bootstrap(db, { employeeNo: '00101', name: '한수정' })
    await importRoster(db, rows)
    const saved = (await db.select({ no: users.employeeNo }).from(users)).map((u) => u.no).sort()
    expect(saved).toEqual(['00101', '00109'])
  })

  it('CSV에 없는 기존 사용자를 비활성화하지 않는다 (R-ROSTER-2)', async () => {
    await seedDev(db)
    await importRoster(db, rows.slice(0, 1))
    expect((await db.select().from(users).where(eq(users.active, false))).length).toBe(0)
  })

  it('병동이 없으면 실패한다', async () => {
    await expect(importRoster(db, rows)).rejects.toThrow('병동')
    expect((await db.select().from(wards)).length).toBe(0)
  })
})

it('공휴일은 source=seed로 저장된다', async () => {
  await seedDev(db)
  const rows = await db.select().from(holidays)
  expect(rows.every((h) => h.source === 'seed')).toBe(true)
})
