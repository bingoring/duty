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

// 3-7a: 직군마다 화면이 따로다. 다른 직군 화면에 오면 자기 홈으로 보낸다
export const HOME_OF = { nurse: '/', doctor: '/doctor' } as const

export async function requireNurse(): Promise<ValidSession> {
  const s = await requireUser()
  if (s.user.roleGroup !== 'nurse') redirect(HOME_OF.doctor)
  return s
}

export async function requireDoctor(): Promise<ValidSession> {
  const s = await requireUser()
  if (s.user.roleGroup !== 'doctor') redirect(HOME_OF.nurse)
  return s
}

// 관리자 = 같은 직군의 관리자만 (간호사 관리자는 의사 근무표를, 의사 관리자는 간호사 근무표를 고치지 못한다)
export async function requireAdmin(): Promise<ValidSession> {
  const s = await requireNurse()
  if (s.user.role !== 'admin') forbidden()
  return s
}

export async function requireDoctorAdmin(): Promise<ValidSession> {
  const s = await requireDoctor()
  if (s.user.role !== 'admin') forbidden()
  return s
}
