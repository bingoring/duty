'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { groupSession } from '../auth/session'
import { getDb } from '../db/client'
import { revokeConfirmation, revokePreview } from './revoke'
import { dispatchGeneration } from './dispatch'
import { readGenerationJob, runGenerationJob, startGeneration } from './jobs'
import { confirmCandidate } from './service'
import { requestToday } from '../clock'

// Build Spec 2-6 — 듀티 생성 서버 액션. 각 액션은 첫 줄에서 관리자를 확인한다(페이지 가드에 기대지 않음)
const DENIED = { ok: false as const, kind: 'blocked' as const, message: '권한이 없습니다.' }
const BAD = { ok: false as const, kind: 'blocked' as const, message: '입력 형식이 올바르지 않습니다.' }

async function adminOnly() {
  const s = await groupSession('nurse')
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

// 3-13: 생성 작업을 시작만 하고 바로 돌아온다(Firebase Hosting 60초 제한). 화면은 generationJobAction으로 진행을 확인한다
export async function startGenerateAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = GenerateSchema.safeParse(input)
  if (!parsed.success) return BAD
  const { year, month, priorities } = parsed.data
  const db = getDb()
  const r = await startGeneration(db, admin, { year, month }, priorities, await requestToday())
  if (!r.ok) return r
  try {
    await dispatchGeneration(r.jobId, process.env, { run: (id) => runGenerationJob(db, id) })
  } catch (e) {
    console.error('generation_dispatch_failed', { jobId: r.jobId, error: String(e) })
    return {
      ok: false as const,
      kind: 'unreachable' as const,
      message: '생성을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    }
  }
  return r
}

export async function generationJobAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.string().uuid().safeParse(input)
  if (!parsed.success) return BAD
  const job = await readGenerationJob(getDb(), parsed.data)
  if (!job) return { ok: false as const, kind: 'blocked' as const, message: '생성 작업을 찾을 수 없습니다.' }
  return { ok: true as const, ...job }
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

// 3-8 확정 철회: 미리 보기(사라질 교환·관리자 수정 수) → 확인 → 철회
const YmSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
})

export async function revokePreviewAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = YmSchema.safeParse(input)
  if (!parsed.success) return BAD
  return revokePreview(getDb(), parsed.data)
}

export async function revokeConfirmationAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = YmSchema.safeParse(input)
  if (!parsed.success) return BAD
  const r = await revokeConfirmation(getDb(), admin, parsed.data)
  if (r.ok) refresh()
  return r
}
