'use server'

// 3-7 의사 서버 액션. 각 액션은 첫 줄에서 의사 직군(·관리자)을 확인한다 — 간호사 관리자는 쓸 수 없다
import { DOCTOR_OPTION_VALUES } from '@duty/domain'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { groupSession } from '../auth/session'
import { requestToday } from '../clock'
import { getDb } from '../db/client'
import { confirmDoctorCandidate, generateDoctorCandidate, setDoctorExtras } from './generate'
import { saveDoctorPrefs, saveDoctorRequests, type DoctorActor } from './requests'
import {
  changeDoctorLoginId,
  createDoctor,
  reissueDoctorPassword,
  removeDoctor,
  saveDoctorRules,
  setDoctorRole,
} from './staff'
import {
  adminEditDoctorShift,
  cancelDoctorSwap,
  createDoctorSwap,
  previewDoctorSwap,
  respondDoctorSwap,
} from './swaps'

const DENIED = { ok: false as const, message: '권한이 없습니다.' }
const BAD = { ok: false as const, message: '입력 형식이 올바르지 않습니다.' }

async function doctor(): Promise<DoctorActor | null> {
  const s = await groupSession('doctor')
  if (!s || s.pendingStep) return null
  return { id: s.user.id, role: s.user.role === 'admin' ? 'admin' : 'member' }
}

async function doctorAdmin(): Promise<DoctorActor | null> {
  const a = await doctor()
  return a?.role === 'admin' ? a : null
}

const Ym = z.object({ year: z.number().int().min(2020).max(2100), month: z.number().int().min(1).max(12) })
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Chip = z.object({ date: IsoDate, slot: z.enum(['D', 'N']) })
const Uuid = z.string().uuid()

// ── 신청·조건 ──
const RequestsInput = Ym.extend({
  userId: Uuid,
  items: z
    .array(
      z.object({
        date: IsoDate,
        options: z.array(z.enum(DOCTOR_OPTION_VALUES)).max(4),
        comment: z.string().max(200).nullable(),
      }),
    )
    .max(31),
  exceptions: z.array(IsoDate).max(31),
})

export async function saveDoctorRequestsAction(input: unknown) {
  const a = await doctor()
  if (!a) return DENIED
  const p = RequestsInput.safeParse(input)
  if (!p.success) return BAD
  const r = await saveDoctorRequests(getDb(), a, p.data, await requestToday())
  if (r.ok) refresh()
  return r
}

export async function saveDoctorPrefsAction(userId: unknown, prefs: unknown) {
  const a = await doctor()
  if (!a) return DENIED
  const id = Uuid.safeParse(userId)
  if (!id.success) return BAD
  const r = await saveDoctorPrefs(getDb(), a, id.data, prefs)
  if (r.ok) refresh()
  return r
}

// ── 생성 ──
export async function generateDoctorAction(input: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = Ym.safeParse(input)
  if (!p.success) return BAD
  const r = await generateDoctorCandidate(getDb(), a, p.data)
  if (r.ok) refresh()
  return r
}

export async function confirmDoctorAction(candidateId: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const id = Uuid.safeParse(candidateId)
  if (!id.success) return BAD
  const r = await confirmDoctorCandidate(getDb(), a, id.data)
  if (r.ok) refresh()
  return r
}

export async function setDoctorExtrasAction(input: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = Ym.extend({ extras: z.object({ D: z.array(Uuid).max(10), N: z.array(Uuid).max(10) }) }).safeParse(input)
  if (!p.success) return BAD
  const r = await setDoctorExtras(getDb(), a, p.data, p.data.extras)
  if (r.ok) refresh()
  return r
}

// ── 조정·교환 ──
const AdminEdit = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('assign'), chip: Chip, userId: Uuid }),
  z.object({ kind: z.literal('swap'), a: Chip, b: Chip }),
])

export async function adminEditDoctorShiftAction(input: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = Ym.extend({ edit: AdminEdit, note: z.string().max(200).nullable() }).safeParse(input)
  if (!p.success) return BAD
  const r = await adminEditDoctorShift(getDb(), a, p.data, p.data.edit, p.data.note)
  if (r.ok) refresh()
  return r
}

const SwapInput = Ym.extend({ a: Chip, b: Chip, comment: z.string().max(200).nullable() })

export async function previewDoctorSwapAction(input: unknown) {
  const a = await doctor()
  if (!a) return DENIED
  const p = SwapInput.safeParse(input)
  if (!p.success) return BAD
  return previewDoctorSwap(getDb(), a, p.data, p.data.a, p.data.b, await requestToday())
}

export async function createDoctorSwapAction(input: unknown) {
  const a = await doctor()
  if (!a) return DENIED
  const p = SwapInput.safeParse(input)
  if (!p.success) return BAD
  const r = await createDoctorSwap(getDb(), a, p.data, p.data.a, p.data.b, p.data.comment, await requestToday())
  if (r.ok) refresh()
  return r
}

export async function respondDoctorSwapAction(id: unknown, accept: unknown) {
  const a = await doctor()
  if (!a) return DENIED
  const p = z.object({ id: Uuid, accept: z.boolean() }).safeParse({ id, accept })
  if (!p.success) return BAD
  const r = await respondDoctorSwap(getDb(), a, p.data.id, p.data.accept, await requestToday())
  if (r.ok) refresh()
  return r
}

export async function cancelDoctorSwapAction(id: unknown) {
  const a = await doctor()
  if (!a) return DENIED
  const p = Uuid.safeParse(id)
  if (!p.success) return BAD
  const r = await cancelDoctorSwap(getDb(), a, p.data)
  if (r.ok) refresh()
  return r
}

// ── 의사 관리·규칙 ──
export async function createDoctorAction(input: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = z.object({ loginId: z.string().max(20), name: z.string().max(40), admin: z.boolean() }).safeParse(input)
  if (!p.success) return BAD
  const r = await createDoctor(getDb(), a, p.data)
  if (r.ok) refresh()
  return r
}

export async function changeDoctorLoginIdAction(userId: unknown, loginId: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = z.object({ userId: Uuid, loginId: z.string().max(20) }).safeParse({ userId, loginId })
  if (!p.success) return BAD
  const r = await changeDoctorLoginId(getDb(), a, p.data.userId, p.data.loginId)
  if (r.ok) refresh()
  return r
}

export async function setDoctorRoleAction(userId: unknown, admin: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = z.object({ userId: Uuid, admin: z.boolean() }).safeParse({ userId, admin })
  if (!p.success) return BAD
  const r = await setDoctorRole(getDb(), a, p.data.userId, p.data.admin)
  if (r.ok) refresh()
  return r
}

export async function reissueDoctorPasswordAction(userId: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = Uuid.safeParse(userId)
  if (!p.success) return BAD
  return reissueDoctorPassword(getDb(), a, p.data)
}

export async function removeDoctorAction(userId: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = Uuid.safeParse(userId)
  if (!p.success) return BAD
  const r = await removeDoctor(getDb(), a, p.data)
  if (r.ok) refresh()
  return r
}

export async function saveDoctorRulesAction(input: unknown) {
  const a = await doctorAdmin()
  if (!a) return DENIED
  const p = z.object({ params: z.unknown(), baseVersion: z.number().int().min(0) }).safeParse(input)
  if (!p.success) return BAD
  const r = await saveDoctorRules(getDb(), a, { params: p.data.params, baseVersion: p.data.baseVersion })
  if (r.ok) refresh()
  return r
}
