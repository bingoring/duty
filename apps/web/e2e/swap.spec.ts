import { existsSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { and, eq } from 'drizzle-orm'
import { adjustCheckInput } from '../src/server/adjust/service'
import { createDb } from '../src/server/db/client'
import { monthPlans, users } from '../src/server/db/schema'
import { loginAndWait, setToday, waitHydrated } from './fixtures'
import { findSwapPair, lab, mdOf } from './search'

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
  const pair = findSwapPair(await adjustCheckInput(db, oct!), [...byId.keys()], '2026-10-14')
  const A = byId.get(pair.a)!
  const B = byId.get(pair.b)!

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

// 2-9 커버리지 보강: 거절·철회. 오늘을 쿠키로 10월 협의 기간(9/17)에 둔다 — DB 날짜를 바꾸지 않는다
test('교환 요청: 상대가 거절하면 종료, 요청자는 대기 요청을 철회할 수 있다', async ({ browser }) => {
  test.setTimeout(120_000)
  const base = test.info().project.use.baseURL!
  const { db, close } = createDb(url)
  const [oct] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, 2026), eq(monthPlans.month, 10)))
  const people = await db.select({ id: users.id, no: users.employeeNo, name: users.name }).from(users)
  const byId = new Map(people.filter((p) => p.no !== '00101').map((p) => [p.id, p]))
  const pair = findSwapPair(await adjustCheckInput(db, oct!), [...byId.keys()], '2026-10-01')
  await close()
  const A = byId.get(pair.a)!
  const B = byId.get(pair.b)!

  const open = async (no: string) => {
    const context = await browser.newContext()
    await setToday(context, '2026-09-17', base)
    const page = await context.newPage()
    await loginAndWait(page, no)
    await page.goto('/adjust?ym=2026-10')
    await waitHydrated(page)
    return page
  }
  const send = async (me: Page) => {
    await me.getByRole('button', { name: '근무 조정' }).click()
    await me.getByRole('checkbox', { name: `${B.name} 선택` }).click()
    await me.getByRole('button', { name: `${mdOf(pair.date)} 재배정` }).click()
    const pop = me.getByRole('dialog', { name: `${mdOf(pair.date)} 근무 재배정` })
    await pop.getByRole('button', { name: `${A.name} 변경 후 ${pair.ca}` }).click()
    await pop.getByRole('button', { name: `${B.name} 변경 후 ${pair.cb}` }).click()
    await pop.getByRole('button', { name: '요청 보내기' }).click()
    await expect(me.getByRole('status')).toContainText(`${B.name}에게 교환을 요청했습니다`)
  }

  const me = await open(A.no)
  await expect(me.getByText('협의 기간 9/16 – 9/20 · 4일 남음')).toBeVisible()
  await send(me)
  const other = await open(B.no)
  await other
    .getByRole('article')
    .filter({ hasText: `${A.name} 님의 요청` })
    .getByRole('button', { name: '거절' })
    .click()
  await expect(other.getByRole('status')).toContainText('요청을 거절했습니다')
  await me.reload()
  await waitHydrated(me)
  await me.getByRole('button', { name: /^보낸 요청/ }).click()
  const panel = me.getByRole('complementary', { name: '조정 요청' })
  await expect(panel.getByRole('article').first()).toContainText('거절됨')

  // 다시 보내고 상대가 답하기 전에 철회 → 상대는 응답할 수 없다
  await send(me)
  await me.getByRole('button', { name: /^보낸 요청/ }).click()
  await panel.getByRole('button', { name: '철회' }).click()
  await expect(me.getByRole('status')).toContainText('요청을 철회했습니다')
  await other.reload()
  await waitHydrated(other)
  await expect(other.getByRole('button', { name: '수락' })).toHaveCount(0)
  await Promise.all([me.context().close(), other.context().close()])
})
