'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { getSession } from '../auth/session'
import { getDb } from '../db/client'
import { confirmCandidate, generate } from './service'
import { requestToday } from '../clock'

// Build Spec 2-6 — 듀티 생성 서버 액션. 각 액션은 첫 줄에서 관리자를 확인한다(페이지 가드에 기대지 않음)
const DENIED = { ok: false as const, kind: 'blocked' as const, message: '권한이 없습니다.' }
const BAD = { ok: false as const, kind: 'blocked' as const, message: '입력 형식이 올바르지 않습니다.' }

async function adminOnly() {
  const s = await getSession()
  return s && !s.pendingStep && s.user.role === 'admin' ? { id: s.user.id, role: 'admin' as const } : null
}

const GenerateSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  priorities: z.object({
    requests: z.boolean(),
    offAfterNight: z.boolean(),
    weekendPair: z.boolean(),
    avoidJuniorOnly: z.boolean(),
    minimizeRepeatPairs: z.boolean(),
  }),
})

export async function generateAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = GenerateSchema.safeParse(input)
  if (!parsed.success) return BAD
  const { year, month, priorities } = parsed.data
  const r = await generate(getDb(), admin, { year, month }, { priorities, today: await requestToday() })
  if (r.ok) refresh()
  return r
}

export async function confirmCandidateAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ candidateId: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return BAD
  const r = await confirmCandidate(getDb(), admin, parsed.data.candidateId, await requestToday())
  if (r.ok) refresh()
  return r
}
