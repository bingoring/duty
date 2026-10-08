'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '../db/client'
import {
  STEP_PATH,
  authenticate,
  changePassword,
  createSession,
  deleteSession,
  validateSession,
} from './service'
import { clearSessionCookie, getSession, getSessionToken, writeSessionCookie } from './session'
import { clientIp, loginLimiter } from './ip-limit'
import { safeNext } from './tokens'

export type LoginState = {
  error?: string
  fieldErrors?: { employeeNo?: string; password?: string }
  employeeNo?: string
}

const LoginSchema = z.object({
  employeeNo: z.string().trim().min(1, '사번을 입력해 주세요.').max(20, '사번을 확인해 주세요.'),
  // 상한: 비로그인 요청마다 argon2를 돌리므로 아주 긴 입력을 막는다(R-1)
  password: z.string().min(1, '비밀번호를 입력해 주세요.').max(128, '비밀번호를 확인해 주세요.'),
})

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => {
  const kst = new Date(d.getTime() + 9 * 3600_000)
  return `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const employeeNo = String(formData.get('employeeNo') ?? '')
  const parsed = LoginSchema.safeParse({ employeeNo, password: String(formData.get('password') ?? '') })
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors
    return { employeeNo, fieldErrors: { employeeNo: fe.employeeNo?.[0], password: fe.password?.[0] } }
  }

  let destination: string
  try {
    const now = new Date()
    const db = getDb()
    // 3-1 R-OPS-7: 한 IP에서 실패가 많으면 계정과 무관하게 잠시 막는다(프록시 뒤에서만 IP를 안다)
    const ip = clientIp(await headers())
    const ipBlocked = ip ? loginLimiter.blockedUntil(ip, now.getTime()) : null
    if (ipBlocked)
      return {
        employeeNo,
        error: `이 네트워크에서 로그인 실패가 많아 잠시 막았습니다. ${hhmm(new Date(ipBlocked))} 이후 다시 시도해 주세요.`,
      }
    const r = await authenticate(db, { ...parsed.data, now })
    if (!r.ok && ip) loginLimiter.recordFailure(ip, now.getTime())
    if (!r.ok) {
      return r.error === 'locked'
        ? {
            employeeNo,
            error: `로그인 시도가 많아 잠시 잠겼습니다. ${hhmm(r.lockedUntil)} 이후 다시 시도하거나 관리자에게 문의해 주세요.`,
          }
        : { employeeNo, error: '사번 또는 비밀번호가 올바르지 않습니다.' }
    }
    const keep = formData.get('keep') === 'on'
    const s = await createSession(db, {
      userId: r.userId,
      keep,
      userAgent: (await headers()).get('user-agent'),
      now,
    })
    await writeSessionCookie(s.token, s.persistent, s.expiresAt)
    // 2-11 R-ONB-1: 남은 단계(동의 → 비밀번호 → 초기 설정)가 있으면 그 화면으로
    const v = await validateSession(db, s.token, now, { renew: false })
    destination = v?.pendingStep ? STEP_PATH[v.pendingStep] : safeNext(String(formData.get('next') ?? ''))
  } catch (e) {
    console.error('login failed', e instanceof Error ? e.name : 'unknown')
    return { employeeNo, error: '일시적인 오류입니다. 잠시 후 다시 시도해 주세요.' }
  }
  redirect(destination)
}

export async function logoutAction(): Promise<void> {
  const token = await getSessionToken()
  if (token) await deleteSession(getDb(), token)
  await clearSessionCookie()
  redirect('/login')
}

export type PasswordState = {
  error?: string
  fieldErrors?: { current?: string; next?: string; confirm?: string }
  done?: boolean
}

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const s = await getSession()
  const token = await getSessionToken()
  if (!s || !token) redirect('/login')
  // 2-11: 동의 전에는 비밀번호도 바꿀 수 없다(동의 화면으로)
  if (s.pendingStep === 'consent') redirect('/consent')
  const forced = s.mustChangePassword
  const current = formData.get('current')
  const r = await changePassword(getDb(), {
    userId: s.user.id,
    sessionToken: token,
    ...(!forced && typeof current === 'string' ? { current } : {}),
    next: String(formData.get('next') ?? ''),
    confirm: String(formData.get('confirm') ?? ''),
    now: new Date(),
  })
  if (!r.ok) return { fieldErrors: { [r.field]: r.message } }
  // 다음 단계(초기 설정)가 남았으면 가드가 그쪽으로 보낸다
  if (forced) redirect('/')
  return { done: true }
}
