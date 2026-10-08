'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { clientIp } from '../auth/ip-limit'
import { deleteSession } from '../auth/service'
import { clearSessionCookie, getSession, getSessionToken } from '../auth/session'
import { getDb } from '../db/client'
import { recordConsent } from './service'

export type ConsentState = { error?: string }

// Build Spec 2-11 R-CONSENT-1·2 — 동의 화면에서만 부른다(동의 단계가 남은 세션)
export async function agreeConsentAction(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  const s = await getSession()
  if (!s) redirect('/login')
  if (s.pendingStep !== 'consent') redirect('/')
  const r = await recordConsent(getDb(), {
    userId: s.user.id,
    required: formData.get('required') === 'on',
    sensitive: formData.get('sensitive') === 'on',
    ip: clientIp(await headers()),
    now: new Date(),
  })
  if (!r.ok) return { error: r.message }
  // 다음 단계(비밀번호 → 초기 설정)는 가드가 이어서 보낸다
  redirect('/')
}

// R-CONSENT-3: 거부 → 로그아웃, 로그인 화면에 안내
export async function declineConsentAction(): Promise<void> {
  const token = await getSessionToken()
  if (token) await deleteSession(getDb(), token)
  await clearSessionCookie()
  redirect('/login?consent=declined')
}
