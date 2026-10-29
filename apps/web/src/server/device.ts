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

// 클라이언트 보정(ViewportSync): 좁은 화면, 또는 가로로 돌린 휴대폰(터치 + 낮은 높이)은 모바일 화면을 유지한다
export const NARROW_QUERY = '(max-width: 767px)'
export const LANDSCAPE_PHONE_QUERY = '(pointer: coarse) and (max-height: 500px)'

export function viewportDevice(a: { narrow: boolean; landscapePhone: boolean }): Device {
  return a.narrow || a.landscapePhone ? 'mobile' : 'desktop'
}

// refreshedFrom = 직전에 다시 받을 때의 서버 판정. 쿠키가 막혀 같은 판정이 또 오면 멈추고(무한 refresh 방지),
// 판정이 바뀐 뒤 다시 어긋나면(창을 다시 넓힘·휴대폰을 다시 세움) 한 번 더 받는다
export function shouldRefresh(a: { want: Device; device: Device; refreshedFrom: Device | null }): boolean {
  return a.want !== a.device && a.refreshedFrom !== a.device
}
