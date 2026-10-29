import { describe, expect, it } from 'vitest'
import manifest from './manifest'

describe('3-12 홈 화면 추가', () => {
  it('앱 정보', () => {
    const m = manifest()
    expect(m).toMatchObject({
      name: '벌써 근무표짤 때가 됐어?',
      short_name: '근무표',
      display: 'standalone',
      start_url: '/',
      theme_color: '#0f6e63',
      background_color: '#f6f4ef',
      lang: 'ko',
    })
    expect(m.icons?.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(m.icons?.some((i) => i.purpose === 'maskable')).toBe(true)
    // 아이콘은 고정 주소(proxy matcher가 로그인 검사에서 뺀 경로)
    for (const i of m.icons ?? []) expect(i.src).toMatch(/^\/pwa-icon\/\d+$/)
  })
})
