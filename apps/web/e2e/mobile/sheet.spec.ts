import { expect, test, type Locator, type Page } from '@playwright/test'
import { NURSE, loginAndWait, waitHydrated } from '../fixtures'

// 3-12 3차: 바텀 시트 — 손잡이를 충분히 끌면 닫히고, 조금만 끌거나 손잡이 밖을 끌면 남는다.
// 신청 가능 여부와 상관없이 시트는 열리므로 12월(신청 기간 아님)로 연다
async function drag(page: Page, from: Locator, dy: number) {
  const box = (await from.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + (dy * i) / 10, { steps: 2 })
  await page.mouse.up()
}

async function openSheet(page: Page) {
  await page.getByRole('group', { name: '12월 신청 달력' }).getByRole('button', { name: /^10일/ }).click()
  const sheet = page.getByRole('dialog', { name: '12/10 (목) 신청' })
  // 올라오는 애니메이션이 끝난 뒤 끈다(중간에 잡으면 손잡이가 아직 화면 아래에 있다)
  await expect(sheet).toHaveAttribute('data-state', 'open')
  return sheet
}

test.beforeEach(async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await page.goto('/requests?ym=2026-12')
  await waitHydrated(page)
})

test('손잡이를 200px 끌어내리면 시트가 내려가며 닫힌다', async ({ page }) => {
  const sheet = await openSheet(page)
  await drag(page, sheet.getByRole('button', { name: '끌어서 닫기' }), 200)
  await expect(sheet).toBeHidden()
})

test('손잡이를 조금만 끌면 제자리로 돌아온다', async ({ page }) => {
  const sheet = await openSheet(page)
  await drag(page, sheet.getByRole('button', { name: '끌어서 닫기' }), 30)
  await page.waitForTimeout(400)
  await expect(sheet).toBeVisible()
})

test('손잡이가 아닌 내용을 끌면 닫히지 않는다', async ({ page }) => {
  const sheet = await openSheet(page)
  await drag(page, sheet.getByRole('region', { name: '이 날 신청한 동료' }), 250)
  await page.waitForTimeout(400)
  await expect(sheet).toBeVisible()
})

test('배경을 누르거나 Escape를 누르면 닫힌다', async ({ page }) => {
  let sheet = await openSheet(page)
  await page.mouse.click(20, 40)
  await expect(sheet).toBeHidden()
  sheet = await openSheet(page)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('내려가는 동안에는 시트를 누를 수 없다(inert)', async ({ page }) => {
  const sheet = await openSheet(page)
  // 닫히는 순간을 놓치지 않게 속성 변화를 기록해 둔다
  await sheet.evaluate((el) => {
    const w = window as unknown as { inertSeen: boolean }
    w.inertSeen = false
    new MutationObserver(() => {
      if (el.hasAttribute('inert')) w.inertSeen = true
    }).observe(el, { attributes: true })
  })
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  expect(await page.evaluate(() => (window as unknown as { inertSeen: boolean }).inertSeen)).toBe(true)
})
