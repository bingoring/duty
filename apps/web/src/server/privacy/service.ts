import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { privacyConsents } from '../db/schema'
import { PRIVACY_NOTICE_VERSION } from './notice'

// Build Spec 2-11 R-CONSENT-2·4 — 필수·민감정보 두 동의를 모두 받아야 기록한다. 같은 버전은 한 번만
export async function recordConsent(
  db: Db,
  input: { userId: string; required: boolean; sensitive: boolean; ip: string | null; now: Date },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!input.required || !input.sensitive)
    return { ok: false, message: '두 항목에 모두 동의해야 계속할 수 있습니다.' }
  const [done] = await db
    .select({ id: privacyConsents.id })
    .from(privacyConsents)
    .where(and(eq(privacyConsents.userId, input.userId), eq(privacyConsents.version, PRIVACY_NOTICE_VERSION)))
    .limit(1)
  if (!done)
    await db.insert(privacyConsents).values({
      userId: input.userId,
      version: PRIVACY_NOTICE_VERSION,
      requiredAt: input.now,
      sensitiveAt: input.now,
      ip: input.ip,
    })
  return { ok: true }
}

// 간호사 관리(S10)의 "동의 {M/D}" 열: 사용자별 현재 버전 동의 시각
export async function consentTimes(db: Db): Promise<Map<string, Date>> {
  const rows = await db
    .select({ userId: privacyConsents.userId, at: privacyConsents.requiredAt })
    .from(privacyConsents)
    .where(eq(privacyConsents.version, PRIVACY_NOTICE_VERSION))
    .orderBy(desc(privacyConsents.requiredAt))
  const out = new Map<string, Date>()
  for (const r of rows) if (!out.has(r.userId)) out.set(r.userId, r.at)
  return out
}
