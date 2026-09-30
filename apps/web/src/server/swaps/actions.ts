'use server'

import { SWAP_CODES } from '@duty/domain'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { getSession } from '../auth/session'
import { getDb } from '../db/client'
import { appToday } from '../schedule/month'
import { cancelSwap, createSwap, respondSwap } from './service'

// Build Spec 2-8 — 교환 요청 서버 액션. 세션 확인은 첫 줄, 당사자·요청자 권한은 service가 판단한다
const DENIED = { ok: false as const, message: '로그인이 필요합니다.' }
const BAD = { ok: false as const, message: '입력 형식이 올바르지 않습니다.' }

async function sessionActor() {
  const s = await getSession()
  if (!s || s.mustChangePassword) return null
  return { id: s.user.id, role: s.user.role === 'admin' ? ('admin' as const) : ('nurse' as const) }
}

const uuid = z.string().uuid()
const CreateSchema = z.object({
  planId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(z.object({ userId: uuid, after: z.enum(SWAP_CODES as [string, ...string[]]) }))
    .min(2)
    .max(10),
  comment: z.string().max(500).optional(),
})

export async function createSwapAction(input: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return BAD
  const r = await createSwap(getDb(), actor, parsed.data as Parameters<typeof createSwap>[2], appToday())
  if (r.ok) refresh()
  return r
}

export async function respondSwapAction(input: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const parsed = z.object({ id: uuid, decision: z.enum(['accept', 'reject']) }).safeParse(input)
  if (!parsed.success) return BAD
  const r = await respondSwap(getDb(), actor, parsed.data.id, parsed.data.decision, appToday())
  if (r.ok) refresh()
  return r
}

export async function cancelSwapAction(input: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const parsed = z.object({ id: uuid }).safeParse(input)
  if (!parsed.success) return BAD
  const r = await cancelSwap(getDb(), actor, parsed.data.id)
  if (r.ok) refresh()
  return r
}
