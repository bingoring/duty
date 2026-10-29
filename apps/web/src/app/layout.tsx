import type { Metadata, Viewport } from 'next'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './globals.css'
import { HydrationMark } from '@/components/shell/HydrationMark'

export const metadata: Metadata = {
  title: '벌써 근무표짤 때가 됐어?',
  description: '응급실 간호사 3교대 근무표',
  // 3-12 홈 화면에 추가: iOS는 manifest 아이콘 대신 apple-touch-icon을 쓴다
  icons: { apple: '/pwa-icon/180' },
  appleWebApp: { capable: true, title: '근무표', statusBarStyle: 'default' },
}

// 3-12: 아래 탭이 홈 표시줄(안전 영역)을 피하도록 viewport-fit=cover
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f6e63',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <HydrationMark />
      </body>
    </html>
  )
}
