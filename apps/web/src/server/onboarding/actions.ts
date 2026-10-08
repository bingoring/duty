'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '../auth/session'
import { requestToday } from '../clock'
import { getDb } from '../db/client'
import { todaySeoul } from '../schedule/month'
import { reviewSubmission, saveOnboarding, type SaveResult } from './service'

// Build Spec 2-11 R-ONB-1·6 — 초기 설정 단계가 남은 본인만
export async function saveOnboardingAction(input: unknown): Promise<SaveResult> {
  const s = await getSession()
  if (!s) redirect('/login')
  const step = s.pendingStep
  if (step !== 'onboarding' && step !== 'annual')
    return { ok: false, message: '이미 초기 설정을 마쳤습니다.' }
  const r = await saveOnboarding(getDb(), {
    userId: s.user.id,
    today: await requestToday(),
    mode: step === 'annual' ? 'annual' : 'initial',
    input,
    year: Number(todaySeoul().slice(0, 4)),
  })
  if (!r.ok) return r
  redirect('/')
}

// R-ONB-7: 관리자 확인·되돌리기
export async function reviewSubmissionAction(input: unknown) {
  const s = await getSession()
  if (!s || s.pendingStep || s.user.role !== 'admin')
    return { ok: false as const, message: '권한이 없습니다.' }
  const p = z
    .object({
      id: z.string().uuid(),
      decision: z.enum(['confirmed', 'reverted']),
      note: z.string().max(200).optional(),
    })
    .safeParse(input)
  if (!p.success) return { ok: false as const, message: '입력을 확인해 주세요.' }
  const r = await reviewSubmission(getDb(), { ...p.data, adminId: s.user.id, today: await requestToday() })
  return r
}
