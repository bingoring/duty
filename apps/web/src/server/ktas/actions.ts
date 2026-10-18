'use server'

import { getSession } from '../auth/session'
import { requestToday } from '../clock'
import { getDb } from '../db/client'
import { ackKtasReminder } from './reminder'

export async function ackKtasReminderAction() {
  const s = await getSession()
  if (!s || s.pendingStep) return { ok: false as const }
  await ackKtasReminder(getDb(), s.user.id, await requestToday())
  return { ok: true as const }
}
