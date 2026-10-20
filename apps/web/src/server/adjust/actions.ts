'use server'

import { isIsoDate } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { groupSession } from '../auth/session'
import { getDb } from '../db/client'
import { monthPlans } from '../db/schema'
import { cancelApprovedLeave } from '../requests/service'
import { closeMonth, previewClose, reopenMonth } from './close'
import { rerollFrom, rerollPreview } from './reroll'
import { saveEdits, updateNegotiation } from './service'
import { requestToday } from '../clock'

// Build Spec 2-7 — 근무 조정 서버 액션. 각 액션은 첫 줄에서 관리자를 확인한다(페이지 가드에 기대지 않음)
const DENIED = { ok: false as const, message: '권한이 없습니다.' }
const BAD = { ok: false as const, message: '입력 형식이 올바르지 않습니다.' }

async function adminOnly() {
  const s = await groupSession('nurse')
  return s && !s.pendingStep && s.user.role === 'admin' ? { id: s.user.id, role: 'admin' as const } : null
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
  kind: z.enum(['manual', 'swap', 'replacement', 'reroll']),
})
const Before = EditSchema.shape.before
// 3-10 9: 저장 전 휴가
const LeaveInput = z.object({
  userId: uuid,
  type: z.enum(['annual', 'family', 'sick', 'official', 'special', 'checkup', 'founding']),
  reasonCode: z.string().max(40).optional(),
  startDate: date,
  endDate: date.optional(),
})
const DraftLeaveSchema = LeaveInput.extend({
  endDate: date,
  cells: z.array(z.object({ date, before: Before })).max(31),
})

export async function saveEditsAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z
    .object({
      planId: uuid,
      edits: z.array(EditSchema).max(400),
      leaves: z.array(DraftLeaveSchema).max(20).default([]),
    })
    .safeParse(input)
  if (!parsed.success) return BAD
  const { planId, edits, leaves } = parsed.data
  const r = await saveEdits(getDb(), admin, planId, edits, leaves, await requestToday())
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

// 3-9 4: 확정된 달 부분 리롤 — 결과는 저장하지 않고 「저장 전 편집」으로 돌려준다(3-10 9: 휴가도)
export async function rerollPreviewAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ planId: uuid, from: date }).safeParse(input)
  if (!parsed.success) return BAD
  return rerollPreview(getDb(), admin, parsed.data)
}

export async function rerollFromAction(input: unknown) {
  const admin = await adminOnly()
  if (!admin) return DENIED
  // 3-10 8·9: 새 휴가(저장하지 않음) + 지금 저장 전 편집·휴가(그대로 둔다)
  const parsed = z
    .object({
      planId: uuid,
      leave: LeaveInput,
      edits: z.array(EditSchema).max(400).default([]),
      leaves: z.array(LeaveInput).max(20).default([]),
    })
    .safeParse(input)
  if (!parsed.success) return BAD
  return rerollFrom(getDb(), admin, { ...parsed.data, today: await requestToday() })
}
