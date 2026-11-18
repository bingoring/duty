'use server'

import { getSessionToken } from './session'
import { setSessionViewport } from './viewport'
import { getDb } from '../db/client'

// 3-13: 화면 폭 보정값을 세션에 저장(ViewportSync가 서버 판정과 실제 화면이 어긋날 때만 부른다).
// 토큰이 가리키는 세션 행만 바꾸고, 다른 데이터는 건드리지 않는다
export async function saveViewportAction(device: unknown): Promise<{ ok: boolean }> {
  if (device !== 'mobile' && device !== 'desktop') return { ok: false }
  const token = await getSessionToken()
  if (!token) return { ok: false }
  await setSessionViewport(getDb(), token, device)
  return { ok: true }
}
