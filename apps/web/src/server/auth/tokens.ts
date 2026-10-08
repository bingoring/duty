import { createHash, randomBytes, randomInt } from 'node:crypto'

// R-AUTH-6: 32바이트 난수 토큰, DB에는 SHA-256 hex만 저장
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// R-BOOT-2: 혼동 문자 0 O o 1 l I 제외
export const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generateTempPassword(length = 12): string {
  let out = ''
  for (let i = 0; i < length; i++) out += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)]
  return out
}

const AUTH_PATHS = ['/login', '/password']

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  // URL 파서는 탭·개행을 지우고 \를 /로 읽는다 → "/\t/evil"·"/\\evil"이 //evil이 된다(R-1)
  if (/[\x00-\x20\x7f\\]/.test(next)) return '/'
  const pathname = next.split(/[?#]/)[0] ?? ''
  if (AUTH_PATHS.includes(pathname)) return '/'
  return next
}
