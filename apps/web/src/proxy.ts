// 낙관적 검사: 세션 쿠키가 없으면 로그인으로 보낸다. 실제 인증·권한 판정은 서버 가드(requireUser/requireAdmin)가 한다.
import { NextResponse, type NextRequest } from 'next/server'
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE } from './server/auth/cookies'

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (!request.cookies.has(SESSION_COOKIE) && !request.cookies.has(LEGACY_SESSION_COOKIE)) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname + search)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  // /privacy: 로그인 없이 보는 개인정보 처리 안내(2-11 R-CONSENT-6)
  // 3-12: 홈 화면 추가 파일(manifest·아이콘)은 브라우저가 쿠키 없이 가져온다
  matcher: [
    '/((?!_next/|api/|login|privacy|fonts/|favicon.ico|manifest.webmanifest|pwa-icon|icon|apple-icon).*)',
  ],
}
