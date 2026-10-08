import { existsSync } from 'node:fs'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { and, eq, ne } from 'drizzle-orm'
import { adjustCheckInput } from '../../src/server/adjust/service'
import { createDb } from '../../src/server/db/client'
import { monthPlans, users } from '../../src/server/db/schema'
import { ADMIN, loginAndWait, setToday, waitHydrated } from '../fixtures'
import { findSafeEdit, findSwapPair, lab, mdOf } from '../search'

// Build Spec 2-9 §1.1 — 11월 한 달 흐름. 쿠키로 "오늘"을 옮기며 화면 조작으로만 진행한다(DB는 편집 후보를 찾을 때 읽기만).
// 시드 상태에서 시작한다(cycle-reset). A 신청, B 연차
const A = { employeeNo: '00107', name: '임소라' }
const B = { employeeNo: '00108', name: '배지현' }
const REQ_DATE = '2026-11-10'
const LEAVE_DATE = '2026-11-05'

if (existsSync('.env')) process.loadEnvFile('.env')
const url = process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e'

type Actor = { context: BrowserContext; page: Page }
const actors = new Map<string, Actor>()
let base = ''

async function as(browser: Browser, employeeNo: string, today: string, path: string) {
  let a = actors.get(employeeNo)
  if (!a) {
    const context = await browser.newContext()
    a = { context, page: await context.newPage() }
    actors.set(employeeNo, a)
    await setToday(context, today, base)
    await loginAndWait(a.page, employeeNo)
  }
  await setToday(a.context, today, base)
  await a.page.goto(path)
  return a.page
}

test.afterAll(async () => {
  for (const a of actors.values()) await a.context.close()
})

test('11월 한 달: 신청·휴가 → 생성·확정 → 교환·관리자 조정 → 협의 기간 끝 → 12월 확정 → 마감 → 12월 이월', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  base = test.info().project.use.baseURL!

  await test.step('10/13 A 근무 신청 제출', async () => {
    const me = await as(browser, A.employeeNo, '2026-10-13', '/requests?ym=2026-11')
    await waitHydrated(me)
    await expect(me.getByText('신청 중 · 마감 10/15 (2일 남음)')).toBeVisible()
    await me.getByRole('button', { name: `${A.name} ${REQ_DATE}` }).click()
    await me.getByRole('dialog').getByRole('button', { name: 'OFF', exact: true }).click()
    await me.getByRole('dialog').getByRole('button', { name: '임시 저장' }).click()
    await me.getByRole('button', { name: '신청 제출' }).click()
    await expect(me.getByRole('status')).toHaveText('1건을 제출했습니다.')
  })

  await test.step('10/13 B 연차 신청 → 10/14 관리자 승인', async () => {
    const b = await as(browser, B.employeeNo, '2026-10-13', '/requests?ym=2026-11')
    await waitHydrated(b)
    await b.getByRole('button', { name: `${B.name} ${LEAVE_DATE}` }).click()
    const pop = b.getByRole('dialog')
    await pop.getByRole('button', { name: '휴가' }).click()
    await pop.getByRole('button', { name: '임시 저장' }).click()
    await b.getByRole('button', { name: '신청 제출' }).click()
    await expect(b.getByRole('status')).toContainText('제출했습니다')

    const admin = await as(browser, ADMIN.employeeNo, '2026-10-14', '/requests?ym=2026-11')
    await waitHydrated(admin)
    const card = admin.getByRole('article', { name: `${B.name} 휴가` })
    await expect(card).toContainText('11월 · 신청 중')
    await card.getByRole('button', { name: '승인' }).click()
    await expect(admin.getByRole('article', { name: `${B.name} 휴가` })).toHaveCount(0)
  })

  await test.step('10/16 신청 마감 → 생성 → 확정 → 근무표 공개(신청·휴가 반영)', async () => {
    const admin = await as(browser, ADMIN.employeeNo, '2026-10-16', '/admin/generate?ym=2026-11')
    await waitHydrated(admin)
    await expect(admin.getByRole('heading', { name: '11월 듀티 생성' })).toBeVisible()
    await admin.getByRole('button', { name: '생성' }).click()
    const result = admin.getByRole('region', { name: '생성 결과' })
    await expect(result.getByText('생성 결과 · 1번째 안')).toBeVisible({ timeout: 60_000 })
    await expect(result.getByText('필수 규칙 위반 0')).toBeVisible()
    admin.once('dialog', (d) => d.accept())
    await admin.getByRole('button', { name: '이 안으로 확정' }).click()
    await expect(admin.getByRole('link', { name: '근무표 보기 →' })).toBeVisible()

    const me = await as(browser, A.employeeNo, '2026-10-16', '/?ym=2026-11')
    const grid = me.getByRole('grid')
    await expect(
      grid.getByRole('row', { name: A.name }).locator(`[data-date="${REQ_DATE}"]`),
    ).toHaveAttribute('data-tip', /off[\s\S]*신청 반영/)
    await expect(
      grid.getByRole('row', { name: B.name }).locator(`[data-date="${LEAVE_DATE}"]`),
    ).toHaveAttribute('data-tip', /휴/)
  })

  // 생성 결과에 따라 칸이 달라지므로 규칙을 통과하는 교환·편집을 도메인 검사기로 고른다
  const { db, close } = createDb(url)
  const [nov] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, 2026), eq(monthPlans.month, 11)))
  const people = await db
    .select({ id: users.id, no: users.employeeNo, name: users.name })
    .from(users)
    .where(ne(users.employeeNo, ADMIN.employeeNo))
  const byId = new Map(people.map((p) => [p.id, p]))
  const pair = findSwapPair(await adjustCheckInput(db, nov!), [...byId.keys()], '2026-11-01')
  const [S, T] = [byId.get(pair.a)!, byId.get(pair.b)!]

  await test.step('10/17 협의 기간 교환 요청 → 상대 수락 → 즉시 반영', async () => {
    const s = await as(browser, S.no, '2026-10-17', '/adjust?ym=2026-11')
    await waitHydrated(s)
    await expect(s.getByText('협의 기간 10/16 – 10/20 · 4일 남음')).toBeVisible()
    await s.getByRole('button', { name: '근무 조정' }).click()
    await s.getByRole('checkbox', { name: `${T.name} 선택` }).click()
    await s.getByRole('button', { name: `${mdOf(pair.date)} 재배정` }).click()
    const pop = s.getByRole('dialog', { name: `${mdOf(pair.date)} 근무 재배정` })
    await pop.getByRole('button', { name: `${S.name} 변경 후 ${pair.ca}` }).click()
    await pop.getByRole('button', { name: `${T.name} 변경 후 ${pair.cb}` }).click()
    await expect(pop.getByText('규칙 검사 통과')).toBeVisible()
    await pop.getByRole('button', { name: '요청 보내기' }).click()
    await expect(s.getByRole('status')).toContainText(`${T.name}에게 교환을 요청했습니다`)

    const t = await as(browser, T.no, '2026-10-17', '/adjust?ym=2026-11')
    await waitHydrated(t)
    const card = t.getByRole('article').filter({ hasText: `${S.name} 님의 요청` })
    await card.getByRole('button', { name: '수락' }).click()
    await expect(t.getByRole('status')).toContainText('모두 수락해 근무표에 반영했습니다')
    await t.goto('/?ym=2026-11')
    await expect(
      t.getByRole('grid').getByRole('row', { name: T.name }).locator(`[data-date="${pair.date}"]`),
    ).toHaveAttribute('data-tip', new RegExp(`${lab(pair.ca)}[\\s\\S]*교환 반영`))
  })

  // 교환 당사자는 빼야 편집이 교환을 되돌려 안내가 비는 경우(X→Y→X)가 없다
  const others = [...byId.keys()].filter((id) => id !== pair.a && id !== pair.b)
  const edit = findSafeEdit(await adjustCheckInput(db, nov!), others, '2026-11-01')
  const E = byId.get(edit.userId)!
  await close()

  await test.step('10/18 관리자 칸 편집 → 저장·재배포 → 당사자 안내', async () => {
    const admin = await as(browser, ADMIN.employeeNo, '2026-10-18', '/adjust?ym=2026-11')
    await waitHydrated(admin)
    await admin.getByRole('button', { name: `${E.name} ${edit.date}` }).click()
    const dock = admin.getByRole('region', { name: `${E.name} ${mdOf(edit.date)} 근무 편집` })
    await dock.getByRole('button', { name: edit.after, exact: true }).click()
    await expect(dock).toContainText(`적용됨 · ${lab(edit.before)} → ${lab(edit.after)}`)
    await admin.getByRole('button', { name: '저장 · 재배포' }).click()
    await expect(admin.getByRole('status')).toContainText('1건을 저장했습니다')

    const e = await as(browser, E.no, '2026-10-18', '/?ym=2026-11')
    const bar = e.getByRole('status', { name: '바뀐 근무' })
    await expect(bar).toContainText(`${lab(edit.before)} → ${lab(edit.after)}`)
    await expect(
      e.getByRole('grid').getByRole('row', { name: E.name }).locator(`[data-date="${edit.date}"]`),
    ).toHaveAttribute('data-tip', /관리자 수정/)
  })

  await test.step('10/21 협의 기간이 끝나면 교환 요청을 보낼 수 없다', async () => {
    const s = await as(browser, S.no, '2026-10-21', '/adjust?ym=2026-11')
    await waitHydrated(s)
    await expect(s.getByRole('button', { name: '근무 조정' })).toBeDisabled()
  })

  await test.step('11/16 12월 생성·확정 (11월 말에 이어서)', async () => {
    const admin = await as(browser, ADMIN.employeeNo, '2026-11-16', '/admin/generate?ym=2026-12')
    await waitHydrated(admin)
    await admin.getByRole('button', { name: '생성' }).click()
    await expect(
      admin.getByRole('region', { name: '생성 결과' }).getByText('생성 결과 · 1번째 안'),
    ).toBeVisible({ timeout: 60_000 })
    admin.once('dialog', (d) => d.accept())
    await admin.getByRole('button', { name: '이 안으로 확정' }).click()
    await expect(admin.getByRole('link', { name: '근무표 보기 →' })).toBeVisible()
  })

  await test.step('12/1 10월·11월 마감 (앞 달 먼저)', async () => {
    const admin = await as(browser, ADMIN.employeeNo, '2026-12-01', '/adjust?ym=2026-11')
    await waitHydrated(admin)
    const close11 = admin.getByRole('button', { name: '월 마감' })
    await expect(close11).toBeDisabled()
    await expect(close11).toHaveAttribute('title', '10월을 먼저 마감하세요.')
    for (const m of [10, 11]) {
      await admin.goto(`/adjust?ym=2026-${m}`)
      await waitHydrated(admin)
      await admin.getByRole('button', { name: '월 마감' }).click()
      await admin
        .getByRole('dialog', { name: `${m}월 마감` })
        .getByRole('button', { name: '마감', exact: true })
        .click()
      await expect(admin.getByRole('status')).toContainText(`${m}월을 마감했습니다`)
    }
    await expect(admin.getByText('마감한 달입니다. 마감 취소 후 수정하세요.')).toBeVisible()
  })

  await test.step('12/1 12월 근무표의 이월 off·이월 N = 11월 마감 누적 off·잔여 N', async () => {
    const me = await as(browser, A.employeeNo, '2026-12-01', '/?ym=2026-11')
    const nov = me.getByRole('grid').getByRole('row', { name: A.name })
    const accOff = (await nov.locator('[data-col="acc"]').textContent())!.trim()
    const nLeft = (await nov.locator('[data-col="n-left"]').textContent())!.trim()
    await me.goto('/?ym=2026-12')
    const dec = me.getByRole('grid').getByRole('row', { name: A.name })
    await expect(dec.locator('[data-col="carry-off"]')).toHaveText(
      accOff.replace(/^\+/, '').replace('−', '-'),
    )
    await expect(dec.locator('[data-col="carry-n"]')).toHaveText(nLeft)
  })
})
