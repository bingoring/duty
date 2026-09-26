export const SESSION_COOKIE = 'duty_session'

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
