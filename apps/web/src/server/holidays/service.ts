import type { HolidayKind } from '@duty/domain'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { holidays } from '../db/schema'
import type { FieldErrors, HolidayInput } from '../admin/schemas'
import { fetchRestDays } from './api'
import { reconcileFoundingOff } from './founding'

// Build Spec 2-4 business-rules §1.3
export type HolidayRow = { id: string; date: string; name: string; kind: HolidayKind; source: string }

const inYear = (year: number) => and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`))

export async function listHolidays(db: Db, year: number): Promise<HolidayRow[]> {
  const rows = await db.select().from(holidays).where(inYear(year)).orderBy(asc(holidays.date))
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    name: r.name,
    kind: r.kind as HolidayKind,
    source: r.source,
  }))
}

export async function addHoliday(
  db: Db,
  input: HolidayInput,
  adminId: string,
): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
  const year = Number(input.date.slice(0, 4))
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: holidays.id }).from(holidays).where(eq(holidays.date, input.date))
    if (dup) return { ok: false as const, errors: { date: '이미 등록된 날짜입니다.' } }
    if (input.kind === 'founding_day') {
      const [f] = await tx
        .select({ id: holidays.id })
        .from(holidays)
        .where(and(inYear(year), eq(holidays.kind, 'founding_day')))
      if (f) return { ok: false as const, errors: { date: `${year}년 개원기념일이 이미 있습니다.` } }
    }
    await tx.insert(holidays).values({ ...input, source: 'admin', createdBy: adminId })
    if (input.kind === 'founding_day') await reconcileFoundingOff(tx, year, { createdBy: adminId })
    return { ok: true as const }
  })
}

export async function deleteHoliday(db: Db, id: string, adminId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [h] = await tx.delete(holidays).where(eq(holidays.id, id)).returning()
    if (h?.kind === 'founding_day')
      await reconcileFoundingOff(tx, Number(h.date.slice(0, 4)), { createdBy: adminId })
  })
}

export type ImportResult =
  { ok: true; added: number; updated: number; kept: number } | { ok: false; message: string }

// R-HOL-API-2: 새 날짜는 추가, seed·api 항목은 갱신, admin 항목과 API에 없는 항목은 그대로
export async function importHolidays(
  db: Db,
  year: number,
  key: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<ImportResult> {
  const r = await fetchRestDays(year, key, opts)
  if (!r.ok) return r
  return db.transaction(async (tx) => {
    const existing = new Map((await tx.select().from(holidays).where(inYear(year))).map((h) => [h.date, h]))
    let added = 0
    let updated = 0
    let kept = 0
    for (const item of r.items) {
      const h = existing.get(item.date)
      if (!h) {
        await tx.insert(holidays).values({ ...item, source: 'api' })
        added++
      } else if (h.source !== 'admin' && (h.name !== item.name || h.kind !== item.kind)) {
        await tx
          .update(holidays)
          .set({ name: item.name, kind: item.kind, source: 'api' })
          .where(eq(holidays.id, h.id))
        updated++
      } else kept++
    }
    return { ok: true as const, added, updated, kept }
  })
}
