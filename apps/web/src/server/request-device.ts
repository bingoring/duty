import 'server-only'
import { headers } from 'next/headers'
import { getSession } from './auth/session'
import { deviceFor, type Device } from './device'

// 요청 경로(레이아웃·페이지)의 기기. 3-13: 세션의 보정값 → user-agent(요청 안에서 세션은 캐시)
export async function requestDevice(): Promise<Device> {
  const [session, h] = await Promise.all([getSession(), headers()])
  return deviceFor({
    saved: session?.viewport,
    ua: h.get('user-agent') ?? '',
  })
}
