import { ImageResponse } from 'next/og'

// 3-12 홈 화면 아이콘. manifest가 고정 주소로 가리키도록 Route Handler로 만든다(180 = apple-touch-icon).
// 그림은 가운데 60% 안에 두어 maskable(둥근 마스크)로 잘려도 보인다
const SIZES = new Set([180, 192, 512])

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const size = Number((await ctx.params).size)
  if (!SIZES.has(size)) return new Response('Not Found', { status: 404 })
  const u = size / 100
  const chip = (bg: string) => (
    <div style={{ width: 13 * u, height: 13 * u, borderRadius: 3 * u, background: bg }} />
  )
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f6e63',
      }}
    >
      {/* 달력 한 장: 위 띠 + D·E·N 칩(글꼴 없이 그려 운영 서버가 글꼴을 내려받지 않게) */}
      <div
        style={{
          width: 56 * u,
          height: 52 * u,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 8 * u,
          background: '#ffffff',
          overflow: 'hidden',
        }}
      >
        <div style={{ height: 12 * u, background: '#1b1f1e' }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 * u }}>
          {chip('#f2c55c')}
          {chip('#5fb3a6')}
          {chip('#8f86d6')}
        </div>
      </div>
    </div>,
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  )
}
