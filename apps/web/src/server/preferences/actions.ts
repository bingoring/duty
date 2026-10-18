'use server'

import { eq } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { getSession } from '../auth/session'
import { getDb } from '../db/client'
import { users } from '../db/schema'

// 3-6: 본인이 규칙 안내에서 주말 통 OFF를 받을지 정한다(처음엔 받음). 다음 생성부터 반영
export async function setWeekendPairWantedAction(input: unknown) {
  const s = await getSession()
  if (!s || s.pendingStep) return { ok: false as const, message: '다시 로그인해 주세요.' }
  const p = z.boolean().safeParse(input)
  if (!p.success) return { ok: false as const, message: '입력 형식이 올바르지 않습니다.' }
  await getDb()
    .update(users)
    .set({ weekendPairWanted: p.data, updatedAt: new Date() })
    .where(eq(users.id, s.user.id))
  refresh()
  return { ok: true as const }
}
