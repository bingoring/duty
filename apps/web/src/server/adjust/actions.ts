'use server'

import { isIsoDate } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { getSession } from '../auth/session'
import { getDb } from '../db/client'
import { monthPlans } from '../db/schema'
import { cancelApprovedLeave } from '../requests/service'
import { closeMonth, previewClose, reopenMonth } from './close'
import { saveEdits, updateNegotiation } from './service'
import { requestToday } from '../clock'

// Build Spec 2-7 — 근무 조정 서버 액션. 각 액션은 첫 줄에서 관리자를 확인한다(페이지 가드에 기대지 않음)
const DENIED = { ok: false as const, message: '권한이 없습니다.' }
const BAD = { ok: false as const, message: '입력 형식이 올바르지 않습니다.' }

async function adminOnly() {
  const s = await getSession()
  return s && !s.mustChangePassword && s.user.role === 'admin'
    ? { id: s.user.id, role: 'admin' as const }
    : null
}

const date = z.string().refine(isIsoDate)
const uuid = z.string().uuid()
const Code = z.enum(['D', 'E', 'N', 'S', 'OFF', 'AL', 'LEAVE'])
const EditSchema = z.object({
  userId: uuid,
  date,
  before: z.object({
    code: Code,
    offKind: z.enum(['regular', 'sleeping', 'edu_cont', 'edu_union', 'special', 'founding']).optional(),
    leaveKind: z.enum(['family', 'sick', 'official']).optional(),
  }),
  after: z.object({
    code: z.enum(['D', 'E', 'N', 'S', 'OFF']),
    offKind: z.enum(['regular', 'sleeping']).optional(),
  }),
  override: z.object({ reason: z.string().max(200) }).optional(),
  kind: z.enum(['manual', 'swap', 'replacement']),
})

export async function saveEditsAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ planId: uuid, edits: z.array(EditSchema).max(400) }).safeParse(input)
  if (!parsed.success) return BAD
  const r = await saveEdits(getDb(), admin, parsed.data.planId, parsed.data.edits)
  if (r.ok) refresh()
  return r
}

export async function updateNegotiationAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ planId: uuid, start: date, end: date }).safeParse(input)
  if (!parsed.success) return BAD
  const r = await updateNegotiation(getDb(), admin, parsed.data.planId, parsed.data)
  if (r.ok) refresh()
  return r
}

export async function previewCloseAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ planId: uuid }).safeParse(input)
  if (!parsed.success) return BAD
  const db = getDb()
  const [plan] = await db.select().from(monthPlans).where(eq(monthPlans.id, parsed.data.planId))
  if (!plan) return BAD
  return { ok: true as const, rows: await previewClose(db, plan) }
}

export async function closeMonthAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ planId: uuid }).safeParse(input)
  if (!parsed.success) return BAD
  const r = await closeMonth(getDb(), admin, parsed.data.planId, await requestToday())
  if (r.ok) refresh()
  return r
}

export async function reopenMonthAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ planId: uuid }).safeParse(input)
  if (!parsed.success) return BAD
  const r = await reopenMonth(getDb(), admin, parsed.data.planId)
  if (r.ok) refresh()
  return r
}

export async function cancelApprovedLeaveAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ leaveId: uuid }).safeParse(input)
  if (!parsed.success) return BAD
  const r = await cancelApprovedLeave(getDb(), admin, parsed.data.leaveId)
  if (r.ok) refresh()
  return r
}
