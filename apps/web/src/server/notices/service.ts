import { formatMD, weekdayKo } from '@duty/domain'
import { and, desc, eq, gt, isNull, lt, ne, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db } from '../db/client'
import { cellEditLogs, users } from '../db/schema'

// Build Spec 2-7 R-NOTICE-1~3 (Q3) — 근무표 상단 "내 근무가 바뀌었습니다" 띠
const LOOKBACK_DAYS = 14
const MAX_ITEMS = 5

export type Notice = { date: string; label: string; after: string; by: string; at: string; ym: string }
type Snap = { code?: string; offKind?: string | null }

const label = (c: Snap | null) =>
  !c?.code
    ? '—'
    : c.code === 'OFF'
      ? c.offKind === 'sleeping'
        ? '슬리핑 off'
        : 'off'
      : c.code === 'AL' || c.code === 'LEAVE'
        ? '휴'
        : c.code
const at = (d: Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/\. /g, '/')
    .replace('.', '')

export async function loadNotices(
  db: Db,
  viewerId: string,
  now = new Date(),
): Promise<{ items: Notice[]; more: number; seenUpTo: string | null }> {
  const [me] = await db.select({ seen: users.changesSeenAt }).from(users).where(eq(users.id, viewerId))
  const since = me?.seen ?? new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000)
  const editor = alias(users, 'editor')
  const rows = await db
    .select({ log: cellEditLogs, by: editor.name })
    .from(cellEditLogs)
    .innerJoin(editor, eq(editor.id, cellEditLogs.editedBy))
    .where(
      and(
        eq(cellEditLogs.userId, viewerId),
        ne(cellEditLogs.editedBy, viewerId),
        gt(cellEditLogs.editedAt, since),
      ),
    )
    .orderBy(desc(cellEditLogs.editedAt))
    .limit(500)
  // 같은 칸이 여러 번 바뀌면 처음 before → 마지막 after
  const byCell = new Map<string, { first: Snap; last: Snap; by: string; at: Date }>()
  for (const r of [...rows].reverse()) {
    const cur = byCell.get(r.log.date)
    if (cur) Object.assign(cur, { last: r.log.after as Snap, by: r.by, at: r.log.editedAt })
    else
      byCell.set(r.log.date, {
        first: r.log.before as Snap,
        last: r.log.after as Snap,
        by: r.by,
        at: r.log.editedAt,
      })
  }
  const all = [...byCell.entries()]
    .filter(([, v]) => label(v.first) !== label(v.last))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      label: `${formatMD(date)} (${weekdayKo(date)}) ${label(v.first)} → ${label(v.last)}`,
      after: label(v.last),
      by: v.by,
      at: at(v.at),
      ym: date.slice(0, 7),
    }))
  // R-1: 「확인」은 이 화면이 읽은 변경까지만 닫는다(띠를 그린 뒤 생긴 변경이 함께 사라지지 않게)
  const seenUpTo = rows[0]?.log.editedAt.toISOString() ?? null
  return { items: all.slice(0, MAX_ITEMS), more: Math.max(0, all.length - MAX_ITEMS), seenUpTo }
}

export async function ackNotices(db: Db, viewerId: string, upTo: Date, now = new Date()) {
  const seen = upTo > now ? now : upTo
  // 이미 더 뒤까지 읽었으면 되돌리지 않는다
  await db
    .update(users)
    .set({ changesSeenAt: seen })
    .where(and(eq(users.id, viewerId), or(isNull(users.changesSeenAt), lt(users.changesSeenAt, seen))))
}
