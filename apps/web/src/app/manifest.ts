import type { MetadataRoute } from 'next'

// 3-12 홈 화면에 추가(PWA). 서비스 워커·오프라인·푸시는 범위 밖
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '벌써 근무표짤 때가 됐어?',
    short_name: '근무표',
    description: '응급실 간호사 3교대 근무표',
    lang: 'ko',
    start_url: '/',
    display: 'standalone',
    theme_color: '#0f6e63',
    background_color: '#f6f4ef',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
