'use server'

import { RuleSetSchema } from '@duty/domain'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { getSession } from '../auth/session'
import { getDb } from '../db/client'
import { addHoliday, deleteHoliday, importHolidays, type ImportResult } from '../holidays/service'
import { getCurrentRules } from '../rules'
import { saveRules, type SaveResult } from '../rules/service'
import { appToday } from '../schedule/month'
import {
  adjustBalances,
  createStaff,
  reissuePassword,
  removeStaff,
  updateStaff,
  type CreateResult,
  type Result,
} from '../staff/service'
import {
  BalanceAdjustSchema,
  HolidayInputSchema,
  StaffCreateSchema,
  StaffUpdateSchema,
  type FieldErrors,
} from './schemas'

// Build Spec 2-4 — 관리자 서버 액션. 각 액션은 첫 줄에서 관리자를 확인한다(페이지 가드에 기대지 않음)
const DENIED = { ok: false as const, message: '권한이 없습니다.' }

async function adminOnly(): Promise<string | null> {
  const s = await getSession()
  return s && !s.mustChangePassword && s.user.role === 'admin' ? s.user.id : null
}

function fieldErrors(e: z.ZodError): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of e.issues) {
    const key = issue.path.at(-1)
    if (typeof key === 'string' && !out[key]) out[key] = issue.message
  }
  return out
}

async function staffCtx(adminId: string) {
  return { adminId, today: appToday(), rules: await getCurrentRules() }
}

export async function createStaffAction(input: unknown): Promise<CreateResult | typeof DENIED> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = StaffCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) }
  const r = await createStaff(getDb(), parsed.data, await staffCtx(admin))
  if (r.ok) refresh()
  return r
}

export async function updateStaffAction(userId: string, input: unknown): Promise<Result> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = StaffUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) }
  const r = await updateStaff(getDb(), z.string().uuid().parse(userId), parsed.data, await staffCtx(admin))
  if (r.ok) refresh()
  return r
}

export async function removeStaffAction(userId: string): Promise<Result> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const r = await removeStaff(getDb(), z.string().uuid().parse(userId), await staffCtx(admin))
  if (r.ok) refresh()
  return r
}

export async function reissuePasswordAction(
  userId: string,
): Promise<{ ok: true; tempPassword: string } | typeof DENIED> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const r = await reissuePassword(getDb(), z.string().uuid().parse(userId))
  return { ok: true, ...r }
}

export async function adjustBalancesAction(input: unknown): Promise<Result> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = BalanceAdjustSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) }
  await adjustBalances(getDb(), parsed.data, admin)
  refresh()
  return { ok: true }
}

export async function saveRulesAction(input: unknown): Promise<SaveResult> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = z.object({ rules: RuleSetSchema, baseVersion: z.number().int().min(0) }).safeParse(input)
  if (!parsed.success) return { ok: false, message: '입력 형식이 올바르지 않습니다.' }
  const r = await saveRules(getDb(), parsed.data, admin)
  if (r.ok) refresh()
  return r
}

export async function addHolidayAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; errors?: FieldErrors; message?: string }> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const parsed = HolidayInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) }
  const r = await addHoliday(getDb(), parsed.data, admin)
  if (r.ok) refresh()
  return r
}

export async function deleteHolidayAction(id: string): Promise<Result> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  await deleteHoliday(getDb(), z.string().uuid().parse(id), admin)
  refresh()
  return { ok: true }
}

export async function importHolidaysAction(year: number): Promise<ImportResult> {
  const admin = await adminOnly()
  if (!admin) return DENIED
  const key = process.env.HOLIDAY_API_KEY
  if (!key) return { ok: false, message: '공공데이터포털 인증키를 .env에 설정하면 가져올 수 있습니다.' }
  const r = await importHolidays(getDb(), z.number().int().min(2000).max(2100).parse(year), key)
  if (r.ok) refresh()
  return r
}
