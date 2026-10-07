import 'server-only'
import { cookies } from 'next/headers'
import { appToday, FAKE_TODAY_COOKIE } from './schedule/month'

// 요청 경로(페이지·서버 액션)의 "오늘". 2-9 E2E는 쿠키로 날짜를 옮긴다(운영에서는 무시 — appToday)
export async function requestToday() {
  return appToday(process.env, new Date(), (await cookies()).get(FAKE_TODAY_COOKIE)?.value)
}
