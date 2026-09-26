import 'server-only'
import { DEFAULT_RULES, type RuleSet } from '@duty/domain'
import { desc, eq } from 'drizzle-orm'
import { getDb } from './db/client'
import { ruleVersions, wards } from './db/schema'
import { WARD } from './ward'

// 병동의 최신 규칙 버전. 부트스트랩 전(규칙 없음)이면 기본값.
export async function getCurrentRules(): Promise<RuleSet & { version: number | null }> {
  try {
    const [row] = await getDb()
      .select({ v: ruleVersions })
      .from(ruleVersions)
      .innerJoin(wards, eq(wards.id, ruleVersions.wardId))
      .where(eq(wards.code, WARD.code))
      .orderBy(desc(ruleVersions.version))
      .limit(1)
    if (!row) return { ...DEFAULT_RULES, version: null }
    return {
      params: row.v.params,
      toggles: row.v.toggles,
      forbiddenPatterns: row.v.forbiddenPatterns,
      version: row.v.version,
    }
  } catch {
    return { ...DEFAULT_RULES, version: null }
  }
}
