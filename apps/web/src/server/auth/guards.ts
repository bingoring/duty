import 'server-only'
import { headers } from 'next/headers'
import { forbidden, redirect } from 'next/navigation'
import { STEP_PATH, type PendingStep, type ValidSession } from './service'
import { getSession } from './session'

async function loginUrl() {
  const path = (await headers()).get('x-pathname')
  return path ? `/login?next=${encodeURIComponent(path)}` : '/login'
}

// business-logic-model §1 가드. 권한 판정의 SoT (proxy.ts는 쿠키 유무만 본다).
// 2-11 R-ONB-1: 동의 → 비밀번호 → 초기 설정이 남았으면 그 화면으로. 단계 화면은 자기 단계만 허용한다
export async function requireUser(opts: { allowStep?: readonly PendingStep[] } = {}): Promise<ValidSession> {
  const s = await getSession()
  if (!s) redirect(await loginUrl())
  if (s.pendingStep && !opts.allowStep?.includes(s.pendingStep)) redirect(STEP_PATH[s.pendingStep])
  return s
}

export async function requireAdmin(): Promise<ValidSession> {
  const s = await requireUser()
  if (s.user.role !== 'admin') forbidden()
  return s
}
