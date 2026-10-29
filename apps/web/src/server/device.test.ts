import { describe, expect, it } from 'vitest'
import { config } from '../proxy'
import { detectDevice, shouldRefresh, viewportDevice } from './device'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1'
// Playwright devices['Pixel 7']
const ANDROID_PHONE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Mobile Safari/537.36'
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1'
const ANDROID_TABLET_UA =
  'Mozilla/5.0 (Linux; Android 8.1.0; SM-T837A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36'
// Playwright devices['Desktop Chrome']
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36'

describe('3-12 기기 판정', () => {
  it('쿠키가 user-agent보다 앞선다', () => {
    expect(detectDevice({ cookie: 'desktop', ua: IPHONE_UA })).toBe('desktop')
    expect(detectDevice({ cookie: 'mobile', ua: DESKTOP_UA })).toBe('mobile')
  })

  it('쿠키가 없거나 이상하면 user-agent: 휴대폰 = mobile, 태블릿·데스크톱 = desktop', () => {
    expect(detectDevice({ cookie: undefined, ua: IPHONE_UA })).toBe('mobile')
    expect(detectDevice({ cookie: 'x', ua: ANDROID_PHONE_UA })).toBe('mobile')
    expect(detectDevice({ cookie: undefined, ua: IPAD_UA })).toBe('desktop')
    expect(detectDevice({ cookie: undefined, ua: ANDROID_TABLET_UA })).toBe('desktop')
    expect(detectDevice({ cookie: undefined, ua: DESKTOP_UA })).toBe('desktop')
    expect(detectDevice({ cookie: undefined, ua: '' })).toBe('desktop')
  })

  it('matcher가 홈 화면 추가 파일을 로그인 검사에서 뺀다', () => {
    const re = new RegExp(`^${config.matcher[0]}$`)
    for (const p of [
      '/manifest.webmanifest',
      '/pwa-icon/192',
      '/pwa-icon/512',
      '/icon',
      '/apple-icon',
      '/login',
      '/privacy',
    ])
      expect(re.test(p), p).toBe(false)
    for (const p of ['/', '/requests', '/doctor', '/more']) expect(re.test(p), p).toBe(true)
  })
})

describe('3-12 뷰포트 보정(ViewportSync)', () => {
  it('좁은 화면 또는 가로로 돌린 휴대폰(낮은 높이 + 터치) = mobile', () => {
    expect(viewportDevice({ narrow: true, landscapePhone: false })).toBe('mobile')
    expect(viewportDevice({ narrow: false, landscapePhone: true })).toBe('mobile')
    expect(viewportDevice({ narrow: false, landscapePhone: false })).toBe('desktop')
  })
  it('서버 판정과 같으면 다시 받지 않는다', () =>
    expect(shouldRefresh({ want: 'mobile', device: 'mobile', refreshedFrom: null })).toBe(false))
  it('다르면 다시 받는다', () =>
    expect(shouldRefresh({ want: 'mobile', device: 'desktop', refreshedFrom: null })).toBe(true))
  it('쿠키가 막혀 같은 판정이 또 오면 멈춘다(무한 refresh 없음)', () =>
    expect(shouldRefresh({ want: 'mobile', device: 'desktop', refreshedFrom: 'desktop' })).toBe(false))
  it('한 번 바뀐 뒤 다시 돌아가는 것은 허용(창을 다시 넓힘·휴대폰을 다시 세움)', () =>
    expect(shouldRefresh({ want: 'desktop', device: 'mobile', refreshedFrom: 'desktop' })).toBe(true))
})
