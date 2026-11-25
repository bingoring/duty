import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // 모노레포: standalone 출력에 packages/domain·contract까지 추적되도록 루트를 지정
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // 개발 표시기가 사이드바 하단(사용자 블록·로그아웃)을 덮는다
  devIndicators: false,
  transpilePackages: ['@duty/domain', '@duty/contract'],
  serverExternalPackages: ['@node-rs/argon2'],
  // R-1: 클릭재킹(확정·마감 버튼)·MIME 추측·리퍼러 노출 방지
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          // 3-13: HSTS는 앱이 붙인다(VM 시절에는 Caddy가 붙였다)
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
            : []),
        ],
      },
    ]
  },
  experimental: {
    // forbidden() 사용 (Next 16 실험 옵션)
    authInterrupts: true,
  },
}

export default nextConfig
