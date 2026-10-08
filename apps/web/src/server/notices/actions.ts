'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { getSession } from '../auth/session'
import { getDb } from '../db/client'
import { ackNotices } from './service'

// Build Spec 2-7 R-NOTICE-2 — 「확인」은 본인 안내만 닫는다
const DENIED = { ok: false as const, message: '로그인이 필요합니다.' }

async function sessionActor() {
  const s = await getSession()
  return s && !s.pendingStep ? { id: s.user.id } : null
}

export async function ackNoticesAction(seenUpTo: unknown) {
  const actor = await sessionActor()
  if (!actor) return DENIED
  const upTo = z.iso.datetime().safeParse(seenUpTo)
  if (!upTo.success) return { ok: false as const, message: '잘못된 요청입니다.' }
  await ackNotices(getDb(), actor.id, new Date(upTo.data))
  refresh()
  return { ok: true as const }
}
