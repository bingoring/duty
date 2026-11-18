import 'server-only'
import { cookies, headers } from 'next/headers'
import { getSession } from './auth/session'
import { VIEWPORT_COOKIE, deviceFor, type Device } from './device'

// 요청 경로(레이아웃·페이지)의 기기. 3-13: 세션의 보정값 → duty_vp 쿠키 → user-agent(요청 안에서 세션은 캐시)
export async function requestDevice(): Promise<Device> {
  const [session, jar, h] = await Promise.all([getSession(), cookies(), headers()])
  return deviceFor({
    saved: session?.viewport,
    cookie: jar.get(VIEWPORT_COOKIE)?.value,
    ua: h.get('user-agent') ?? '',
  })
}
