import { existsSync } from 'node:fs'
import { applyEdits, checkSchedule, newViolations, swappable, swapToEdits, type SwapCode } from '@duty/domain'
import { expect, test } from '@playwright/test'
import { and, eq } from 'drizzle-orm'
import { adjustCheckInput } from '../src/server/adjust/service'
import { createDb } from '../src/server/db/client'
import { monthPlans, users } from '../src/server/db/schema'
import { loginAndWait, waitHydrated } from './fixtures'

// Build Spec 2-8 §4 E2E. 오늘(10/13 고정)에 협의 기간인 확정된 달을 만들려고 10월 협의 기간을 10/10–10/20으로 바꾸고 끝나면 되돌린다
if (existsSync('.env')) process.loadEnvFile('.env')
const url = process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e'

test('교환 요청: 요청 보내기 → 상대 근무표 띠·메뉴 배지 → 수락 → 즉시 반영', async ({ browser }) => {
  test.setTimeout(120_000)
  const { db, close } = createDb(url)
  const [oct] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, 2026), eq(monthPlans.month, 10)))
  const orig = { negotiationStart: oct!.negotiationStart, negotiationEnd: oct!.negotiationEnd }
  await db
    .update(monthPlans)
    .set({ negotiationStart: '2026-10-10', negotiationEnd: '2026-10-20' })
    .where(eq(monthPlans.id, oct!.id))

  // 교환해도 새 필수 위반이 없는 두 사람·날짜(10/14 이후)를 찾는다
  const people = await db.select({ id: users.id, no: users.employeeNo, name: users.name }).from(users)
  const byId = new Map(people.filter((p) => p.no !== '00101').map((p) => [p.id, p]))
  const input = await adjustCheckInput(db, oct!)
  const base = checkSchedule(input)
  let pair: { date: string; a: string; b: string; ca: SwapCode; cb: SwapCode } | null = null
  const dates = [...new Set(input.cells.map((c) => c.date))].sort().filter((d) => d >= '2026-10-14')
  search: for (const date of dates)
    for (const a of byId.keys())
      for (const b of byId.keys()) {
        if (a >= b) continue
        const ca = input.cells.find((c) => c.userId === a && c.date === date)
        const cb = input.cells.find((c) => c.userId === b && c.date === date)
        if (!swappable(ca) || !swappable(cb) || ca!.code === cb!.code) continue
        const edits = swapToEdits(date, [
          { userId: a, before: { code: ca!.code as SwapCode }, after: { code: cb!.code as SwapCode } },
          { userId: b, before: { code: cb!.code as SwapCode }, after: { code: ca!.code as SwapCode } },
        ])
        if (
          !newViolations(base, checkSchedule({ ...input, cells: applyEdits(input.cells, edits) }))
            .hardViolations.length
        ) {
          pair = { date, a, b, ca: ca!.code as SwapCode, cb: cb!.code as SwapCode }
          break search
        }
      }
  if (!pair) throw new Error('교환 쌍 없음')
  const A = byId.get(pair.a)!
  const B = byId.get(pair.b)!
  const mdOf = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
  const lab = (c: SwapCode) => (c === 'OFF' ? 'off' : c)

  try {
    const me = await browser.newPage()
    await loginAndWait(me, A.no)
    await me.goto('/adjust')
    await waitHydrated(me)
    await expect(me.getByRole('heading', { name: '2026년 10월 · 근무 조정' })).toBeVisible()
    await expect(me.getByText('협의 기간 10/10 – 10/20 · 8일 남음')).toBeVisible()
    await me.getByRole('button', { name: '근무 조정' }).click()
    await me.getByRole('checkbox', { name: `${B.name} 선택` }).click()
    await me.getByRole('button', { name: `${mdOf(pair.date)} 재배정` }).click()
    const pop = me.getByRole('dialog', { name: `${mdOf(pair.date)} 근무 재배정` })
    await pop.getByRole('button', { name: `${A.name} 변경 후 ${pair.ca}` }).click()
    await pop.getByRole('button', { name: `${B.name} 변경 후 ${pair.cb}` }).click()
    await expect(pop.getByText('규칙 검사 통과')).toBeVisible()
    await pop.getByLabel('코멘트').fill('이날 바꿔 주실 수 있을까요?')
    await pop.getByRole('button', { name: '요청 보내기' }).click()
    await expect(me.getByRole('status')).toContainText(`${B.name}에게 교환을 요청했습니다`)
    await me.getByRole('button', { name: /^보낸 요청/ }).click()
    await expect(me.getByRole('complementary', { name: '조정 요청' })).toContainText('대기')

    const other = await browser.newPage()
    await loginAndWait(other, B.no)
    await expect(
      other
        .getByRole('status', { name: '받은 교환 요청' })
        .or(other.getByRole('status', { name: '바뀐 근무' })),
    ).toContainText('받은 교환 요청 1건')
    await expect(other.getByRole('link', { name: /근무 조정/ }).first()).toContainText('1')
    await other.goto('/adjust')
    await waitHydrated(other)
    const card = other.getByRole('article').filter({ hasText: `${A.name} 님의 요청` })
    await expect(card).toContainText('이날 바꿔 주실 수 있을까요?')
    await expect(card).toContainText(`${A.name} ${pair.ca}→${pair.cb}`)
    await card.getByRole('button', { name: '수락' }).click()
    await expect(other.getByRole('status')).toContainText('모두 수락해 근무표에 반영했습니다')

    await other.goto('/?ym=2026-10')
    const row = other.getByRole('grid').getByRole('row', { name: B.name })
    await expect(row.locator(`[data-date="${pair.date}"]`)).toHaveAttribute(
      'title',
      new RegExp(`${lab(pair.ca)}.*교환 반영`),
    )
    await Promise.all([me.close(), other.close()])
  } finally {
    await db.update(monthPlans).set(orig).where(eq(monthPlans.id, oct!.id))
    await close()
  }
})

test('협의 기간 밖이면 「근무 조정」 버튼이 비활성', async ({ page }) => {
  await loginAndWait(page, '00103')
  await page.goto('/adjust?ym=2026-10')
  await waitHydrated(page)
  await expect(page.getByText('협의 기간 아님 (9/16 – 9/20)')).toBeVisible()
  await expect(page.getByRole('button', { name: '근무 조정' })).toBeDisabled()
})
