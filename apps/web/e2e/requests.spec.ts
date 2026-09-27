import { expect, test, type Browser } from '@playwright/test'
import { ADMIN, NURSE, loginAndWait, waitHydrated } from './fixtures'

// Build Spec 2-5 §4 E2E. 오늘은 2026-10-13 고정 → 대상 11월(마감 10/15), 10월은 확정된 달
const PEER = { employeeNo: '00104', name: '오민지' }
const CHAE = { employeeNo: '00106', name: '윤채원' }

async function as(browser: Browser, employeeNo: string, path = '/requests') {
  const page = await browser.newPage()
  await loginAndWait(page, employeeNo)
  await page.goto(path)
  await waitHydrated(page)
  return page
}

test.describe('S4 근무 신청', () => {
  test('복수 옵션 임시 저장 → 제출 → 동료는 코멘트 없이, 관리자는 코멘트 전문', async ({ browser }) => {
    const me = await as(browser, NURSE.employeeNo)
    await expect(me.getByRole('heading', { name: '2026년 11월 · 근무 신청' })).toBeVisible()
    await expect(me.getByText('신청 중 · 마감 10/15 (2일 남음)')).toBeVisible()
    await me.getByRole('button', { name: `${NURSE.name} 2026-11-13` }).click()
    const pop = me.getByRole('dialog')
    await pop.getByRole('button', { name: 'OFF', exact: true }).click()
    await pop.getByRole('button', { name: 'D', exact: true }).click()
    await pop.getByLabel('코멘트').fill('오후 3시 병원 진료')
    await pop.getByRole('button', { name: '임시 저장' }).click()
    await expect(me.getByRole('button', { name: `${NURSE.name} 2026-11-13` })).toHaveText('O/D')
    await expect(me.getByText('제출하지 않은 신청 1건')).toBeVisible()

    const peer = await as(browser, PEER.employeeNo)
    await expect(peer.getByRole('button', { name: `${NURSE.name} 2026-11-13` })).toHaveText('')

    await me.getByRole('button', { name: '신청 제출' }).click()
    await expect(me.getByRole('status')).toHaveText('1건을 제출했습니다.')

    await peer.reload()
    await waitHydrated(peer)
    await expect(peer.getByRole('button', { name: `${NURSE.name} 2026-11-13` })).toHaveText('O/D')
    await expect(peer.locator('body')).not.toContainText('오후 3시 병원 진료')

    const admin = await as(browser, ADMIN.employeeNo)
    await admin.getByRole('button', { name: `${NURSE.name} 2026-11-13` }).hover()
    await expect(admin.getByLabel('코멘트', { exact: true })).toContainText('오후 3시 병원 진료')
    await Promise.all([me.close(), peer.close(), admin.close()])
  })

  test('경조사 휴가: 종료일 자동 → 제출 → 관리자 승인 → 채운 휴', async ({ browser }) => {
    const me = await as(browser, PEER.employeeNo)
    await me.getByRole('button', { name: `${PEER.name} 2026-11-19` }).click()
    const pop = me.getByRole('dialog')
    await pop.getByRole('button', { name: '휴가' }).click()
    await pop.getByRole('button', { name: '경조사' }).click()
    await pop.getByLabel('경조사 사유').selectOption('parent_death')
    await expect(pop.getByText('11/25 (수)')).toBeVisible()
    await expect(pop.getByText('11/19–25 · 7일 · 유급')).toBeVisible()
    await pop.getByRole('button', { name: '임시 저장' }).click()
    for (const d of ['2026-11-19', '2026-11-25'])
      await expect(me.getByRole('button', { name: `${PEER.name} ${d}` })).toHaveText('휴')
    await me.getByRole('button', { name: '신청 제출' }).click()
    await expect(me.getByRole('status')).toContainText('제출했습니다')

    const admin = await as(browser, ADMIN.employeeNo)
    const card = admin.getByRole('article', { name: `${PEER.name} 휴가` })
    await expect(card).toContainText('11월 · 신청 중')
    await expect(card).toContainText('경조사 · 본인·배우자 부모 사망')
    await card.getByRole('button', { name: '승인' }).click()
    await expect(admin.getByRole('article', { name: `${PEER.name} 휴가` })).toHaveCount(0)
    await expect(admin.getByText('처리 이력')).toBeVisible()

    await me.reload()
    await waitHydrated(me)
    await expect(me.getByRole('button', { name: `${PEER.name} 2026-11-19` }).locator('span')).toHaveClass(
      /bg-shift-leave/,
    )
    await Promise.all([me.close(), admin.close()])
  })

  test('연차 잔여를 넘으면 저장되지 않는다', async ({ browser }) => {
    const me = await as(browser, '00105')
    await me.getByRole('button', { name: '강도윤 2026-11-02' }).click()
    const pop = me.getByRole('dialog')
    await pop.getByRole('button', { name: '휴가' }).click()
    await pop.getByLabel('종료일').fill('2026-11-20')
    await pop.getByRole('button', { name: '임시 저장' }).click()
    await expect(pop.getByRole('alert')).toHaveText('연차 잔여를 넘습니다 (신청 19일 / 잔여 15일).')
    await me.close()
  })
})

test.describe('S4-A 확정된 달 휴가', () => {
  test('10월 병가 → 인원 영향 경고 → 승인하면 근무표에 휴', async ({ browser }) => {
    const me = await as(browser, CHAE.employeeNo, '/requests?ym=2026-10')
    await expect(me.getByText('확정된 달 · 휴가만 신청')).toBeVisible()
    await me.getByRole('button', { name: `${CHAE.name} 2026-10-02` }).click()
    const pop = me.getByRole('dialog')
    await expect(pop.getByRole('button', { name: 'OFF', exact: true })).toBeDisabled()
    await pop.getByRole('button', { name: '병가' }).click()
    await pop.getByRole('button', { name: '임시 저장' }).click()
    await me.getByRole('button', { name: '신청 제출' }).click()
    await expect(me.getByRole('status')).toContainText('제출했습니다')

    const admin = await as(browser, ADMIN.employeeNo)
    const card = admin.getByRole('article', { name: `${CHAE.name} 휴가` })
    await expect(card).toContainText('10월 · 확정된 달')
    await expect(card).toContainText('10/2 (금) D 인원 1명 · 최소 2명')
    await card.getByRole('button', { name: '승인' }).click()
    await expect(admin.getByRole('article', { name: `${CHAE.name} 휴가` })).toHaveCount(0)

    await admin.goto('/?ym=2026-10')
    const row = admin.getByRole('grid').getByRole('row', { name: CHAE.name })
    await expect(row.locator('[data-date="2026-10-02"]')).toHaveAttribute('title', /휴 · 병가/)
    await Promise.all([me.close(), admin.close()])
  })
})

test('간호사는 휴가 승인 패널을 보지 않는다', async ({ browser }) => {
  const me = await as(browser, NURSE.employeeNo)
  await expect(me.getByRole('complementary', { name: '휴가 승인' })).toHaveCount(0)
  await me.close()
})
