import { DEFAULT_RULES, type RuleSet } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { monthPlans, ruleVersions, scheduleCells, users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { loadRuleEditor, saveRules } from './service'

const db = setupTestDb()

async function adminId() {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, '00101'))
  return u!.id
}
const edit = (p: Partial<RuleSet['params']>, extra: Partial<RuleSet> = {}): RuleSet => ({
  ...DEFAULT_RULES,
  ...extra,
  params: { ...DEFAULT_RULES.params, ...p },
})

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('saveRules (R-RULE-SAVE-1·2)', () => {
  it('바뀐 항목만 diff로 새 버전 저장, 이전 버전은 그대로', async () => {
    const r = await saveRules(db, { rules: edit({ maxConsecutiveOff: 16 }), baseVersion: 1 }, await adminId())
    expect(r).toEqual({ ok: true, version: 2 })
    const rows = await db.select().from(ruleVersions).orderBy(ruleVersions.version)
    expect(rows.map((x) => x.version)).toEqual([1, 2])
    expect(rows[0]!.params.maxConsecutiveOff).toBe(15)
    expect(rows[1]!.diff).toEqual([{ key: 'maxConsecutiveOff', before: 15, after: 16 }])
    expect(rows[1]!.changedBy).toBe(await adminId())
  })

  it('금지 패턴은 정규화·중복 제거 후 저장', async () => {
    const rules = edit({}, { forbiddenPatterns: [...DEFAULT_RULES.forbiddenPatterns, 'n-off-e', 'N-OFF-E'] })
    await saveRules(db, { rules, baseVersion: 1 }, await adminId())
    const [v2] = await db.select().from(ruleVersions).where(eq(ruleVersions.version, 2))
    expect(v2!.forbiddenPatterns).toEqual(['E-D', 'N-E', 'N-OFF-D', 'E-S', 'N-OFF-E'])
  })

  it('바뀐 것이 없으면 저장하지 않는다', async () => {
    expect(await saveRules(db, { rules: DEFAULT_RULES, baseVersion: 1 }, await adminId())).toEqual({
      ok: false,
      message: '바뀐 항목이 없습니다.',
    })
  })

  it('범위 오류는 항목별로 돌려준다', async () => {
    const r = await saveRules(db, { rules: edit({ minRestHours: 30 }), baseVersion: 1 }, await adminId())
    expect(r).toEqual({
      ok: false,
      errors: { minRestHours: '근무 간 최소 휴식은 8~24시간 사이여야 합니다.' },
    })
  })

  it('편집을 시작한 뒤 다른 저장이 있었으면 거부', async () => {
    await saveRules(db, { rules: edit({ maxConsecutiveOff: 16 }), baseVersion: 1 }, await adminId())
    expect(
      await saveRules(db, { rules: edit({ maxConsecutiveOff: 17 }), baseVersion: 1 }, await adminId()),
    ).toEqual({
      ok: false,
      message: '다른 관리자가 먼저 저장했습니다. 새로고침 후 다시 저장해 주세요.',
    })
  })
})

describe('loadRuleEditor (R-RULE-APPLY-1, R-RULE-HIST-1)', () => {
  it('현재 규칙·버전·적용 시작 달·이력', async () => {
    await saveRules(
      db,
      { rules: edit({ maxConsecutiveOff: 16, maxNightPerMonth: 6 }), baseVersion: 1 },
      await adminId(),
    )
    const e = await loadRuleEditor(db, '2026-10-13')
    expect(e.version).toBe(2)
    expect(e.rules.params.maxConsecutiveOff).toBe(16)
    expect(e.applyFromMonth).toBe(11) // 10월이 확정 → 다음은 11월
    expect(e.history[0]!.lines).toEqual(['최대 연속 오프 15 → 16', '월 나이트 상한 7 → 6'])
    expect(e.history[0]!.who).toBe('한수정')
    expect(e.history.at(-1)!.lines).toEqual(['초기 설정'])
  })

  it('계획이 하나도 없으면 오늘의 다음 달', async () => {
    await db.delete(scheduleCells)
    await db.delete(monthPlans)
    expect((await loadRuleEditor(db, '2026-10-13')).applyFromMonth).toBe(11)
    expect((await loadRuleEditor(db, '2026-12-20')).applyFromMonth).toBe(1)
  })
})
