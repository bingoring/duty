// 개발 시드: 종이 근무표 2026-10(가명)을 확정 근무표와 초기 원장으로 넣는다 (Build Spec 2-3 business-logic-model §4).
// 저장소 루트 fixtures/paper-2026-10.json을 읽는다. 이름·사번은 가명이다.
import { DEFAULT_RULES, addDays, defaultPlanDates, type HolidayDay, type Rotation } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { balanceEntries, monthPlans, scheduleCells, users } from '../db/schema'
import type { DbOrTx } from './core'

type PaperNurse = {
  employeeNo: string
  rotation: Rotation
  offCarryBefore: number
  nightBankBefore: number
  row: string
}
type PaperDoc = { year: number; month: number; holidays: HolidayDay[]; nurses: PaperNurse[] }

const FIXTURE = fileURLToPath(new URL('../../../../../fixtures/paper-2026-10.json', import.meta.url))

// 초기 입력은 대상 월 전날 생성된 것으로 둔다(원장 시점 합계가 10월 이전 값이 되도록)
const INITIAL = { annual_leave: 15, special_leave: 5, checkup: 0.5, sick_leave: 60 } as const

const CODE: Record<string, { code: string; offKind?: string }> = {
  D: { code: 'D' },
  E: { code: 'E' },
  N: { code: 'N' },
  S: { code: 'S' },
  O: { code: 'OFF', offKind: 'regular' },
  SO: { code: 'OFF', offKind: 'sleeping' },
}

export async function seedPaperSchedule(tx: DbOrTx, wardId: string): Promise<void> {
  if (!existsSync(FIXTURE)) return
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8')) as PaperDoc
  const existing = await tx
    .select({ id: monthPlans.id })
    .from(monthPlans)
    .where(and(eq(monthPlans.year, doc.year), eq(monthPlans.month, doc.month)))
  if (existing.length > 0) return

  const people = await tx.select({ id: users.id, employeeNo: users.employeeNo, role: users.role }).from(users)
  const idOf = new Map(people.map((u) => [u.employeeNo, u.id]))
  const adminId = people.find((u) => u.role === 'admin')?.id ?? null
  const start = `${doc.year}-${String(doc.month).padStart(2, '0')}-01`
  const initialAt = new Date(`${addDays(start, -1)}T00:00:00+09:00`)

  const [plan] = await tx
    .insert(monthPlans)
    .values({
      wardId,
      year: doc.year,
      month: doc.month,
      status: 'CONFIRMED',
      ...defaultPlanDates(doc.year, doc.month, DEFAULT_RULES.params),
      ruleVersion: 1,
      confirmedBy: adminId,
      confirmedAt: initialAt,
    })
    .returning({ id: monthPlans.id })

  for (const p of doc.nurses) {
    const userId = idOf.get(p.employeeNo)
    if (!userId) continue
    const tokens = p.row.split(' ')
    // 슬리핑오프는 종이에서 구분되지 않아 floor((이월N + 그달N)/6)개를 앞쪽 OFF부터 표시한다
    let sleeping = Math.floor((p.nightBankBefore + tokens.filter((t) => t === 'N').length) / 6)
    const cells = tokens.flatMap((t, i) => {
      if (t === '-') return []
      const key = t === 'O' && sleeping-- > 0 ? 'SO' : t
      return [{ monthPlanId: plan!.id, userId, date: addDays(start, i), ...CODE[key]!, source: 'auto' }]
    })
    await tx.insert(scheduleCells).values(cells)
    const initial = { off_carry: p.offCarryBefore, night_bank: p.nightBankBefore, ...INITIAL }
    await tx.insert(balanceEntries).values(
      Object.entries(initial).map(([account, delta]) => ({
        userId,
        account,
        delta: String(delta),
        reason: 'initial_input',
        createdBy: adminId,
        createdAt: initialAt,
      })),
    )
  }
}
