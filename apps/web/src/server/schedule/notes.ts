import { formatMD, type LeaveType } from '@duty/domain'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  cellEditLogs,
  leaveRequests,
  shiftRequests,
  swapRequestItems,
  swapRequests,
  users,
} from '../db/schema'
import { leaveKindLabel } from '../requests/dto'
import type { ScheduleCellRow } from './types'

// Build Spec 2-11 R-TIP-2~4 — 칸 툴팁의 출처 줄. 근무표 조회 때 달 단위로 한 번에 읽는다.
// 코멘트·메모·사유는 본인과 관리자만(R-1 ①)

type Snap = { code?: string; offKind?: string | null }
const SPECIAL_LABEL: Record<string, string> = { AL: '연차', EDU_CONT: '보수교육', EDU_UNION: '노조교육' }
const codeLabel = (c: Snap | null) =>
  !c?.code ? '—' : c.code === 'OFF' ? 'off' : c.code === 'AL' || c.code === 'LEAVE' ? '휴' : c.code
// "10/2 09:30" (서울)
const at = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`
}
const key = (userId: string, date: string) => `${userId}|${date}`

export type NotesArgs = {
  planId: string
  year: number
  month: number
  cells: ScheduleCellRow[]
  viewer: { id: string; admin: boolean }
  // R-HEAD-5: 솔버가 인원 부족으로 D를 넣은 수간호사 칸
  headFill?: ReadonlySet<string>
}

export async function loadCellNotes(db: Db, a: NotesArgs): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const push = (k: string, line: string) => out.set(k, [...(out.get(k) ?? []), line])
  const sees = (userId: string) => a.viewer.admin || a.viewer.id === userId
  const bySource = (s: ScheduleCellRow['source']) => a.cells.filter((c) => c.source === s)
  const names = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  )
  const first = `${a.year}-${String(a.month).padStart(2, '0')}-01`
  const last = a.cells.reduce((m, c) => (c.date > m ? c.date : m), first)

  // 관리자 수정: 칸마다 최신 편집 기록 1건
  const admin = bySource('admin')
  if (admin.length) {
    const logs = await db
      .select()
      .from(cellEditLogs)
      .where(eq(cellEditLogs.monthPlanId, a.planId))
      .orderBy(desc(cellEditLogs.editedAt))
    const seen = new Set<string>()
    const want = new Set(admin.map((c) => key(c.userId, c.date)))
    for (const l of logs) {
      const k = key(l.userId, l.date)
      if (!want.has(k) || seen.has(k)) continue
      seen.add(k)
      push(
        k,
        `관리자 수정 · ${names.get(l.editedBy) ?? ''} · ${at(l.editedAt)} · 이전 ${codeLabel(l.before as Snap)}`,
      )
      if (l.note && sees(l.userId)) push(k, `메모: ${l.note}`)
    }
    for (const k of want) if (!seen.has(k)) push(k, '관리자 수정')
  }

  // 교환: 그 칸이 들어간 반영된 요청(최신)
  const swapped = bySource('swap')
  if (swapped.length) {
    const reqs = await db
      .select()
      .from(swapRequests)
      .where(and(eq(swapRequests.monthPlanId, a.planId), eq(swapRequests.status, 'APPLIED')))
      .orderBy(desc(swapRequests.closedAt))
    const items = reqs.length
      ? await db
          .select()
          .from(swapRequestItems)
          .where(
            inArray(
              swapRequestItems.requestId,
              reqs.map((r) => r.id),
            ),
          )
      : []
    for (const c of swapped) {
      const k = key(c.userId, c.date)
      const q = reqs.find(
        (r) => r.date === c.date && items.some((i) => i.requestId === r.id && i.userId === c.userId),
      )
      if (!q) {
        push(k, '교환 반영')
        continue
      }
      const others = items
        .filter((i) => i.requestId === q.id && i.userId !== c.userId)
        .map((i) => names.get(i.userId) ?? '')
      push(
        k,
        `교환 반영 · 상대 ${others.join('·')} · ${q.closedAt ? at(q.closedAt) : ''}`.replace(/ · $/, ''),
      )
      const mine = items.some((i) => i.requestId === q.id && i.userId === a.viewer.id)
      if (q.comment && (a.viewer.admin || mine)) push(k, `코멘트: ${q.comment}`)
    }
  }

  // 신청 반영: 근무 신청과 승인 휴가
  const requested = bySource('requested')
  if (requested.length) {
    const ids = [...new Set(requested.map((c) => c.userId))]
    const reqs = await db
      .select()
      .from(shiftRequests)
      .where(
        and(
          eq(shiftRequests.year, a.year),
          eq(shiftRequests.month, a.month),
          inArray(shiftRequests.userId, ids),
        ),
      )
    const leaves = await db
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.status, 'APPROVED'),
          inArray(leaveRequests.userId, ids),
          lte(leaveRequests.startDate, last),
          gte(leaveRequests.endDate, first),
        ),
      )
    for (const c of requested) {
      const k = key(c.userId, c.date)
      const l = leaves.find((x) => x.userId === c.userId && x.startDate <= c.date && c.date <= x.endDate)
      if (l) {
        const kind = sees(c.userId)
          ? leaveKindLabel(l.type as LeaveType, l.reasonCode)
          : leaveKindLabel(l.type as LeaveType, null)
        const span =
          l.startDate === l.endDate
            ? formatMD(l.startDate)
            : `${formatMD(l.startDate)}–${formatMD(l.endDate)}`
        push(k, `${kind} 신청 · ${span}`)
        if (l.comment && sees(c.userId)) push(k, `코멘트: ${l.comment}`)
        continue
      }
      const r = reqs.find((x) => x.userId === c.userId && x.date === c.date)
      if (!r) {
        push(k, '신청 반영')
        continue
      }
      const what = r.special ? (SPECIAL_LABEL[r.special] ?? r.special) : r.options.join('/')
      push(k, `신청 반영 · 신청: ${what}`)
      if (r.comment && sees(c.userId)) push(k, `코멘트: ${r.comment}`)
    }
  }

  for (const k of a.headFill ?? []) push(k, '인원 부족 보충')
  return out
}
