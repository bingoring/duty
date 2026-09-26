'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '../db/client'
import { authenticate, changePassword, createSession, deleteSession } from './service'
import { clearSessionCookie, getSession, getSessionToken, writeSessionCookie } from './session'
import { safeNext } from './tokens'

export type LoginState = {
  error?: string
  fieldErrors?: { employeeNo?: string; password?: string }
  employeeNo?: string
}

const LoginSchema = z.object({
  employeeNo: z.string().trim().min(1, '사번을 입력해 주세요.').max(20, '사번을 확인해 주세요.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
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
    const r = await authenticate(db, { ...parsed.data, now })
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
    destination = r.mustChangePassword ? '/password' : safeNext(String(formData.get('next') ?? ''))
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
  if (forced) redirect('/')
  return { done: true }
}
