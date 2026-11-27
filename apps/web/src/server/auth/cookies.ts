// 3-13: Firebase Hosting은 Cloud Run으로 `__session` 쿠키만 넘긴다(옛 이름 duty_session 읽기는 6단계에서 없앴다)
export const SESSION_COOKIE = '__session'

export type SessionCookie = {
  name: string
  value: string
  httpOnly: true
  sameSite: 'lax'
  path: '/'
  secure: boolean
  maxAge?: number
}

// R-AUTH-7·9: 로그인 유지면 maxAge, 아니면 브라우저 세션 쿠키
export function sessionCookie(input: {
  token: string
  persistent: boolean
  expiresAt: Date
  secure: boolean
  now: Date
}): SessionCookie {
  const base = {
    name: SESSION_COOKIE,
    value: input.token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: input.secure,
  } as const
  if (!input.persistent) return base
  return { ...base, maxAge: Math.floor((input.expiresAt.getTime() - input.now.getTime()) / 1000) }
}
