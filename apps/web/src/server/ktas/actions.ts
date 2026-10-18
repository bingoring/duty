'use server'

import { groupSession } from '../auth/session'
import { requestToday } from '../clock'
import { getDb } from '../db/client'
import { ackKtasReminder } from './reminder'

export async function ackKtasReminderAction() {
  // 3-7a: KTAS는 간호사만
  const s = await groupSession('nurse')
  if (!s || s.pendingStep) return { ok: false as const }
  await ackKtasReminder(getDb(), s.user.id, await requestToday())
  return { ok: true as const }
}
