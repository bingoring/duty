'use client'

// R-1: 최상위 레이아웃까지 실패했을 때의 화면. 자체 html·body가 필요하다
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: 'sans-serif', padding: 32, background: '#f6f4ef', color: '#1b1f1e' }}>
        <h1 style={{ fontSize: 22 }}>화면을 불러오지 못했습니다</h1>
        <p style={{ fontSize: 14, color: '#6b7270' }}>
          잠시 뒤 다시 시도해 주세요{error.digest ? ` (오류 번호 ${error.digest})` : ''}.
        </p>
        <button type="button" onClick={() => retry()} style={{ height: 36, padding: '0 16px' }}>
          다시 시도
        </button>
      </body>
    </html>
  )
}
