import { existsSync } from 'node:fs'
import { expect, test, type Browser } from '@playwright/test'
import { and, eq } from 'drizzle-orm'
import { adjustCheckInput } from '../../src/server/adjust/service'
import { createDb } from '../../src/server/db/client'
import { monthPlans, users } from '../../src/server/db/schema'
import { ADMIN, DEV_PASSWORD, login, loginAndWait, waitHydrated } from '../fixtures'
import { findLeaveShortage, findSafeEdit, lab } from '../search'

// 3-12 3차 모바일 관리자: 관리 탭 휴가 승인 → 대체 지정 시트, 근무표 「전체」에서 급한 변경, 마감 달 안내, 의사 관리자.
// 오늘 10/13 고정. 앞선 데스크톱 스펙이 바꿔 둔 DB 상태(대체 근무·바뀐 근무 안내)에 기대지 않게 쓴다
if (existsSync('.env')) process.loadEnvFile('.env')
const url = process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e'
const CHAE = { employeeNo: '00106', name: '윤채원' }

async function as(browser: Browser, employeeNo: string, path: string) {
  const page = await browser.newPage()
  await loginAndWait(page, employeeNo)
  await page.goto(path)
  await waitHydrated(page)
  return page
}

test('관리 탭: 휴대폰으로 낸 병가 → 배지·카드 → 승인 · 대체 지정 → 근무표 대체 지정 시트에서 저장', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  // 간호사가 휴대폰 신청 시트로 10/2 병가를 넣고 제출(확정된 달 = 휴가만)
  const me = await as(browser, CHAE.employeeNo, '/requests?ym=2026-10')
  await me.getByRole('group', { name: '10월 신청 달력' }).getByRole('button', { name: /^2일/ }).click()
  const sheet = me.getByRole('dialog', { name: '10/2 (금) 신청' })
  await sheet.getByRole('button', { name: '병가' }).click()
  await sheet.getByRole('button', { name: '임시 저장' }).click()
  await expect(sheet).toBeHidden()
  await me.getByRole('button', { name: '신청 제출' }).click()
  await expect(me.getByRole('status')).toContainText('제출했습니다')

  const admin = await as(browser, ADMIN.employeeNo, '/')
  const tab = admin.getByRole('navigation', { name: '아래 탭' }).getByRole('link', { name: /관리/ })
  await expect(tab.getByLabel(/승인 대기 휴가 \d+건/)).toBeVisible()
  await tab.click()
  await admin.waitForURL('/manage')
  const card = admin.getByRole('article', { name: `${CHAE.name} 휴가` })
  await expect(card).toContainText('10월 · 확정된 달')
  // 앞선 데스크톱 스펙이 10/2에 대체 근무를 이미 넣었으면 인원 부족이 없다 → 승인하면 카드만 사라진다
  const short = (await card.textContent())?.includes('대체 필요')
  await card.getByRole('button', { name: '승인 · 대체 지정' }).click()
  if (!short) {
    await expect(card).toBeHidden()
    await Promise.all([me.close(), admin.close()])
    return
  }

  await admin.waitForURL('/?ym=2026-10&tab=all&date=2026-10-02&shift=D')
  const edit = admin.getByRole('dialog', { name: '급한 근무 변경' })
  await expect(edit).toContainText('10/2 D 대체 지정')
  await edit
    .getByRole('button', { name: / 지정$/ })
    .and(admin.locator(':enabled'))
    .first()
    .click()
  await expect(edit).toContainText('저장 전 변경 1건')
  await edit.getByRole('button', { name: '저장 · 바로 공개' }).click()
  await expect(edit).toBeHidden()
  await expect(admin.getByText('1건을 저장했습니다')).toBeVisible()
  await Promise.all([me.close(), admin.close()])
})

test('급한 변경: 「전체」에서 이름 → 안전한 근무로 바꿔 저장 → 되돌려 저장', async ({ page }) => {
  test.setTimeout(120_000)
  const { db, close } = createDb(url)
  const [oct] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, 2026), eq(monthPlans.month, 10)))
  const people = await db.select({ id: users.id, no: users.employeeNo, name: users.name }).from(users)
  const byId = new Map(people.filter((p) => p.no !== '00101').map((p) => [p.id, p]))
  const e = findSafeEdit(await adjustCheckInput(db, oct!), [...byId.keys()], '2026-10-14')
  await close()
  const who = byId.get(e.userId)!

  await loginAndWait(page, ADMIN.employeeNo)
  const change = async (to: string) => {
    await page.goto(`/?ym=2026-10&tab=all&date=${e.date}`)
    await waitHydrated(page)
    await page.getByRole('button', { name: `${who.name} 근무 바꾸기` }).click()
    const sheet = page.getByRole('dialog', { name: '급한 근무 변경' })
    await sheet.getByRole('button', { name: new RegExp(`^${to}`) }).click()
    await expect(sheet).toContainText('저장 전 변경 1건')
    await sheet.getByRole('button', { name: '저장 · 바로 공개' }).click()
    await expect(sheet).toBeHidden()
    // 「바뀐 근무」 안내도 status라 문구로 찾는다
    await expect(page.getByText('1건을 저장했습니다')).toBeVisible()
  }
  await change(e.after)
  await expect(
    page.getByRole('region', { name: lab(e.after) === 'off' ? '쉬는 사람' : e.after }),
  ).toContainText(who.name)
  await change(e.before)
})

test('확정되지 않은 달(11월 신청 중)에는 「전체」에 바꿀 이름이 없다', async ({ page }) => {
  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto('/?ym=2026-11&tab=all&date=2026-11-10')
  await waitHydrated(page)
  await expect(page.getByText('이 날 근무표가 없습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: / 근무 바꾸기$/ })).toHaveCount(0)
})

test('의사 관리자: 관리 탭 「근무 바꾸기」 → 칩을 누르면 편집 시트', async ({ page }) => {
  await login(page, '800101', DEV_PASSWORD)
  await page.waitForURL('/doctor')
  await page.goto('/doctor/manage')
  await waitHydrated(page)
  await page.getByRole('link', { name: /근무 바꾸기/ }).click()
  await page.waitForURL(/\/doctor\/adjust/)
  await waitHydrated(page)
  await page
    .getByRole('gridcell', { name: /^22일 Day/ })
    .getByRole('button')
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: '근무 바꾸기' })
  await expect(sheet.getByRole('region', { name: '칸 편집' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

async function octContext() {
  const { db, close } = createDb(url)
  const [oct] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, 2026), eq(monthPlans.month, 10)))
  const people = await db.select({ id: users.id, no: users.employeeNo, name: users.name }).from(users)
  const byId = new Map(people.filter((p) => p.no !== '00101').map((p) => [p.id, p]))
  const input = await adjustCheckInput(db, oct!)
  await close()
  return { input, byId }
}

test('하루 휴가로 인원이 모자라면 같은 시트에서 대체 지정해 저장한다', async ({ page }) => {
  test.setTimeout(120_000)
  const { input, byId } = await octContext()
  const s = findLeaveShortage(input, [...byId.keys()], '2026-10-21')
  const who = byId.get(s.userId)!
  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto(`/?ym=2026-10&tab=all&date=${s.date}`)
  await waitHydrated(page)
  await page.getByRole('button', { name: `${who.name} 근무 바꾸기` }).click()
  const sheet = page.getByRole('dialog', { name: '급한 근무 변경' })
  await sheet.getByRole('button', { name: '병가', exact: true }).click()
  await sheet.getByRole('button', { name: '병가로 바꾸기' }).click()
  await expect(sheet).toContainText(`${s.shift} 대체 지정`)
  await sheet
    .getByRole('button', { name: / 지정$/ })
    .and(page.locator(':enabled'))
    .first()
    .click()
  await sheet.getByRole('button', { name: '저장 · 바로 공개' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText(/건을 저장했습니다/)).toBeVisible()
})

test('같은 칸을 바꾼 뒤 휴가로 바꿔도 저장된다(휴가가 앞선 편집을 대신한다)', async ({ page }) => {
  test.setTimeout(120_000)
  const { input, byId } = await octContext()
  const e = findSafeEdit(input, [...byId.keys()], '2026-10-27')
  test.skip(e.before !== 'OFF', '원래 OFF인 칸이어야 휴가로 인원이 줄지 않는다')
  const who = byId.get(e.userId)!
  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto(`/?ym=2026-10&tab=all&date=${e.date}`)
  await waitHydrated(page)
  await page.getByRole('button', { name: `${who.name} 근무 바꾸기` }).click()
  const sheet = page.getByRole('dialog', { name: '급한 근무 변경' })
  await sheet.getByRole('button', { name: new RegExp(`^${e.after}`) }).click()
  await expect(sheet).toContainText('저장 전 변경 1건')
  await sheet.getByRole('button', { name: '특휴', exact: true }).click()
  await sheet.getByRole('button', { name: '특휴로 바꾸기' }).click()
  await sheet.getByRole('button', { name: '저장 · 바로 공개' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText(/건을 저장했습니다/)).toBeVisible()
})

test('의사 관리자: 휴대폰에서도 두 칩을 차례로 눌러 맞바꾼다', async ({ page }) => {
  await login(page, '800101', DEV_PASSWORD)
  await page.waitForURL('/doctor')
  await page.goto('/doctor/adjust')
  await waitHydrated(page)
  await page
    .getByRole('gridcell', { name: /^22일 Day/ })
    .getByRole('button')
    .first()
    .click()
  await page
    .getByRole('gridcell', { name: /^23일 Day/ })
    .getByRole('button')
    .first()
    .click()
  await expect(page.getByRole('region', { name: '칸 편집' })).toContainText('맞바꾸기')
})
