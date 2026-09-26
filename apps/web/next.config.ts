import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // 모노레포: standalone 출력에 packages/domain까지 추적되도록 루트를 지정
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // 개발 표시기가 사이드바 하단(사용자 블록·로그아웃)을 덮는다
  devIndicators: false,
  transpilePackages: ['@duty/domain'],
  serverExternalPackages: ['@node-rs/argon2'],
  experimental: {
    // forbidden() 사용 (Next 16 실험 옵션)
    authInterrupts: true,
  },
}

export default nextConfig
