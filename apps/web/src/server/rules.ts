import 'server-only'
import { DEFAULT_RULES, RuleSetSchema, type RuleSet } from '@duty/domain'
import { desc, eq } from 'drizzle-orm'
import { getDb } from './db/client'
import { ruleVersions, wards } from './db/schema'
import { WARD } from './ward'

// 병동의 최신 규칙 버전. 부트스트랩 전(규칙 없음)이면 기본값.
// R-1: DB 오류·저장된 규칙이 스키마와 맞지 않는 경우는 조용히 기본값으로 바꾸지 않는다(화면마다 다른 규칙을 쓰게 됨) — 기록하고 올린다
export async function getCurrentRules(): Promise<RuleSet & { version: number | null }> {
  const [row] = await getDb()
    .select({ v: ruleVersions })
    .from(ruleVersions)
    .innerJoin(wards, eq(wards.id, ruleVersions.wardId))
    .where(eq(wards.code, WARD.code))
    .orderBy(desc(ruleVersions.version))
    .limit(1)
  if (!row) return { ...DEFAULT_RULES, version: null }
  // 예전 버전에 없는 수치는 스키마 기본값으로 채운다
  const parsed = RuleSetSchema.safeParse({
    params: row.v.params,
    toggles: row.v.toggles,
    forbiddenPatterns: row.v.forbiddenPatterns,
  })
  if (!parsed.success) {
    console.error('rule_version_invalid', { version: row.v.version, issues: parsed.error.issues })
    throw new Error(`규칙 버전 v${row.v.version}을 읽을 수 없습니다.`)
  }
  return { ...parsed.data, version: row.v.version }
}
