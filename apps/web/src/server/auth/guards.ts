import 'server-only'
import { headers } from 'next/headers'
import { forbidden, redirect } from 'next/navigation'
import type { ValidSession } from './service'
import { getSession } from './session'

async function loginUrl() {
  const path = (await headers()).get('x-pathname')
  return path ? `/login?next=${encodeURIComponent(path)}` : '/login'
}

// business-logic-model §1 가드. 권한 판정의 SoT (proxy.ts는 쿠키 유무만 본다)
export async function requireUser(opts: { allowMustChange?: boolean } = {}): Promise<ValidSession> {
  const s = await getSession()
  if (!s) redirect(await loginUrl())
  if (s.mustChangePassword && !opts.allowMustChange) redirect('/password')
  return s
}

export async function requireAdmin(): Promise<ValidSession> {
  const s = await requireUser()
  if (s.user.role !== 'admin') forbidden()
  return s
}
