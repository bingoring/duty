// 시드 공통: 병동·규칙 v1·공휴일을 멱등으로 넣는다 (R-SEED-2, R-BOOT-1)
import { DEFAULT_RULES } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { pathToFileURL } from 'node:url'
import type { Db } from '../db/client'
import { holidays, ruleVersions, wards } from '../db/schema'
import { SEED_HOLIDAYS } from './holidays'

export { WARD } from '../ward'
import { WARD } from '../ward'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

export async function ensureWard(db: DbOrTx): Promise<string> {
  await db.insert(wards).values(WARD).onConflictDoNothing({ target: wards.code })
  const [ward] = await db.select({ id: wards.id }).from(wards).where(eq(wards.code, WARD.code))
  return ward!.id
}

export async function ensureRuleV1(db: DbOrTx, wardId: string): Promise<void> {
  await db
    .insert(ruleVersions)
    .values({ wardId, version: 1, ...DEFAULT_RULES, diff: [], changedBy: null })
    .onConflictDoNothing({ target: [ruleVersions.wardId, ruleVersions.version] })
}

export async function ensureHolidays(db: DbOrTx): Promise<void> {
  await db
    .insert(holidays)
    .values(SEED_HOLIDAYS.map((h) => ({ ...h, source: 'seed' })))
    .onConflictDoNothing({ target: holidays.date })
}

export async function ensureBase(db: DbOrTx): Promise<string> {
  const wardId = await ensureWard(db)
  await ensureRuleV1(db, wardId)
  await ensureHolidays(db)
  return wardId
}

export function isMain(metaUrl: string): boolean {
  return process.argv[1] !== undefined && metaUrl === pathToFileURL(process.argv[1]).href
}
