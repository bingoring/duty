import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { sessions } from '../db/schema'
import type { Device } from '../device'
import { hashSessionToken } from './tokens'

// 3-13: 화면 폭 보정값을 그 세션 행에 저장한다(Firebase Hosting은 duty_vp 쿠키를 넘기지 않는다)
export async function setSessionViewport(db: Db, token: string, device: Device): Promise<void> {
  await db
    .update(sessions)
    .set({ viewport: device })
    .where(eq(sessions.id, hashSessionToken(token)))
}
