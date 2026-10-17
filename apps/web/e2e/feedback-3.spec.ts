import { expect, test } from '@playwright/test'
import { ADMIN, NURSE, loginAndWait, waitHydrated } from './fixtures'

// 3-6 운영 피드백 3. 오늘은 2026-10-13 고정
test('주말 통 OFF를 본인이 끄면 관리자 규칙 설정에 이름이 보이고, 다시 켜면 사라진다', async ({
  browser,
}) => {
  const me = await browser.newPage()
  await loginAndWait(me, NURSE.employeeNo)
  await me.goto('/rules')
  await waitHydrated(me)
  const toggle = me.getByRole('checkbox', { name: /주말 이틀 통 OFF를 받겠습니다/ })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await expect(me.getByRole('status')).toContainText('받지 않습니다')

  const admin = await browser.newPage()
  await loginAndWait(admin, ADMIN.employeeNo)
  await admin.goto('/admin/rules')
  await waitHydrated(admin)
  await expect(admin.getByLabel('주말 통 OFF를 끈 사람')).toHaveText(`본인이 끈 사람 1명: ${NURSE.name}`)

  await toggle.check()
  await expect(me.getByRole('status')).toContainText('받습니다')
  await admin.reload()
  await expect(admin.getByLabel('주말 통 OFF를 끈 사람')).toHaveText('본인이 끈 사람 없음')
  await Promise.all([me.close(), admin.close()])
})

test('내 설정에서 KTAS 취득일·갱신일을 넣으면 만료 예정일이 계산된다', async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await page.goto('/settings')
  await waitHydrated(page)
  await page.getByLabel('KTAS 취득일').fill('2020-05-01')
  await page.getByLabel('KTAS 갱신일').fill('2025-05-01')
  await expect(page.getByLabel('KTAS 만료 예정일')).toHaveText('2028-04-30')
  await page.getByRole('button', { name: 'KTAS 저장' }).click()
  await expect(page.getByRole('status')).toContainText('관리자에게 확인 요청')
})
