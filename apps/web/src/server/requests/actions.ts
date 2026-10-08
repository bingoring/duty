'use server'

import { LEAVE_TYPES, REQUEST_OPTIONS, REQUEST_SPECIALS, isIsoDate } from '@duty/domain'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { getSession } from '../auth/session'
import { getDb } from '../db/client'
import {
  cancelLeave,
  decideLeave,
  deleteShiftRequest,
  saveLeave,
  saveShiftRequest,
  submitRequests,
  type Actor,
} from './service'
import { requestToday } from '../clock'

// Build Spec 2-5 — 신청 서버 액션. 세션 확인은 첫 줄, 본인·관리자 권한은 service가 판단한다
const DENIED = { ok: false as const, message: '로그인이 필요합니다.' }
const BAD = { ok: false as const, message: '입력 형식이 올바르지 않습니다.' }

async function sessionActor(): Promise<Actor | null> {
  const s = await getSession()
  if (!s || s.pendingStep) return null
  return { id: s.user.id, role: s.user.role === 'admin' ? 'admin' : 'nurse' }
}

const date = z.string().refine(isIsoDate)
const uuid = z.string().uuid()

const ShiftSchema = z.object({
  userId: uuid,
  date,
  options: z.array(z.enum(REQUEST_OPTIONS)).max(4),
  special: z.enum(REQUEST_SPECIALS).optional(),
  comment: z.string().max(500).optional(),
})

export async function saveShiftRequestAction(input: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const p = ShiftSchema.safeParse(input)
  if (!p.success) return BAD
  const r = await saveShiftRequest(getDb(), actor, p.data, await requestToday())
  if (r.ok) refresh()
  return r
}

export async function deleteShiftRequestAction(input: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const p = z.object({ userId: uuid, date }).safeParse(input)
  if (!p.success) return BAD
  const r = await deleteShiftRequest(getDb(), actor, p.data, await requestToday())
  if (r.ok) refresh()
  return r
}

const LeaveSchema = z.object({
  userId: uuid,
  type: z.enum(LEAVE_TYPES),
  reasonCode: z.string().max(40).optional(),
  startDate: date,
  endDate: date.optional(),
  comment: z.string().max(500).optional(),
})

export async function saveLeaveAction(input: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const p = LeaveSchema.safeParse(input)
  if (!p.success) return BAD
  const r = await saveLeave(getDb(), actor, p.data, await requestToday())
  if (r.ok) refresh()
  return r
}

export async function cancelLeaveAction(id: string) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const p = uuid.safeParse(id)
  if (!p.success) return BAD
  const r = await cancelLeave(getDb(), actor, p.data, await requestToday())
  if (r.ok) refresh()
  return r
}

export async function submitRequestsAction(input: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const p = z
    .object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) })
    .safeParse(input)
  if (!p.success) return BAD
  const r = await submitRequests(getDb(), actor, p.data, await requestToday())
  if (r.ok) refresh()
  return r
}

export async function decideLeaveAction(input: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const p = z
    .object({ id: uuid, decision: z.enum(['approve', 'reject']), reason: z.string().max(200).optional() })
    .safeParse(input)
  if (!p.success) return BAD
  const r = await decideLeave(getDb(), actor, p.data.id, p.data)
  if (r.ok) refresh()
  return r
}
