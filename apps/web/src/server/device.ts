// 3-12 모바일 대응: 화면 트리를 하나만 그리려고 요청마다 기기를 판정한다(proxy.ts가 x-device 헤더로 넘긴다).
// 뷰포트 쿠키(ViewportSync가 화면 폭을 보고 씀) → user-agent 순. 태블릿은 데스크톱 화면을 쓴다
export type Device = 'mobile' | 'desktop'

export const VIEWPORT_COOKIE = 'duty_vp'
export const DEVICE_HEADER = 'x-device'

// iPad UA에도 "Mobile/"이 들어 있어 먼저 뺀다. Android 태블릿은 "Mobile"이 없다
const TABLET = /iPad|Tablet/i
const PHONE = /iPhone|iPod|Android.*Mobile|Mobi/i

export function detectDevice(a: { cookie: string | undefined; ua: string }): Device {
  if (a.cookie === 'mobile' || a.cookie === 'desktop') return a.cookie
  if (TABLET.test(a.ua)) return 'desktop'
  return PHONE.test(a.ua) ? 'mobile' : 'desktop'
}
