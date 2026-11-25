// 3-12 모바일 대응: 화면 트리를 하나만 그리려고 요청마다 기기를 판정한다.
// 세션에 저장한 보정값(ViewportSync가 화면 폭을 보고 저장) → user-agent 순. 태블릿은 데스크톱 화면을 쓴다
export type Device = 'mobile' | 'desktop'

// iPad UA에도 "Mobile/"이 들어 있어 먼저 뺀다. Android 태블릿은 "Mobile"이 없다
const TABLET = /iPad|Tablet/i
const PHONE = /iPhone|iPod|Android.*Mobile|Mobi/i

// 3-13: 세션에 저장한 보정값 → user-agent 순(Firebase Hosting은 duty_vp 같은 쿠키를 넘기지 않아 6단계에서 없앴다)
export function deviceFor(a: { saved: string | null | undefined; ua: string }): Device {
  if (a.saved === 'mobile' || a.saved === 'desktop') return a.saved
  return detectDevice(a.ua)
}

export function detectDevice(ua: string): Device {
  if (TABLET.test(ua)) return 'desktop'
  return PHONE.test(ua) ? 'mobile' : 'desktop'
}

// 클라이언트 보정(ViewportSync): 좁은 화면, 또는 가로로 돌린 휴대폰(터치 + 낮은 높이)은 모바일 화면을 유지한다
export const NARROW_QUERY = '(max-width: 767px)'
export const LANDSCAPE_PHONE_QUERY = '(pointer: coarse) and (max-height: 500px)'

export function viewportDevice(a: { narrow: boolean; landscapePhone: boolean }): Device {
  return a.narrow || a.landscapePhone ? 'mobile' : 'desktop'
}

// refreshedFrom = 직전에 다시 받을 때의 서버 판정. 저장되지 않아(로그인 전 등) 같은 판정이 또 오면 멈추고(무한 refresh 방지),
// 판정이 바뀐 뒤 다시 어긋나면(창을 다시 넓힘·휴대폰을 다시 세움) 한 번 더 받는다
export function shouldRefresh(a: { want: Device; device: Device; refreshedFrom: Device | null }): boolean {
  return a.want !== a.device && a.refreshedFrom !== a.device
}
