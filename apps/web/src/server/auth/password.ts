import { hash, verify } from '@node-rs/argon2'

// R-PW-1: argon2id, OWASP 권고 이상 (memoryCost 19 MiB, timeCost 2)
const OPTIONS = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

export type PasswordError = { field: 'next' | 'confirm'; message: string }

// business-rules §2 새 비밀번호 검증
export function validateNewPassword(
  next: string,
  confirm: string,
  ctx: { employeeNo: string; current?: string },
): PasswordError | null {
  if (next.length < 8) return { field: 'next', message: '비밀번호는 8자 이상이어야 합니다.' }
  if (next.length > 72) return { field: 'next', message: '비밀번호는 72자 이하여야 합니다.' }
  if (next === ctx.employeeNo) return { field: 'next', message: '사번과 다른 비밀번호를 사용해 주세요.' }
  if (ctx.current !== undefined && next === ctx.current) {
    return { field: 'next', message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' }
  }
  if (next !== confirm) return { field: 'confirm', message: '비밀번호가 서로 다릅니다.' }
  return null
}
