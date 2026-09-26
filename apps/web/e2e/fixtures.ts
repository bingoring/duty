import type { Page } from '@playwright/test'

export const DEV_PASSWORD = 'duty-dev-1234'
export const NURSE = { employeeNo: '00103', name: '정하늘' }
export const ADMIN = { employeeNo: '00101', name: '한수정' }
export const E2E_TEMP_USER = { employeeNo: '00111', name: '문가을', tempPassword: 'TempPass2345' }

export async function login(page: Page, employeeNo: string, password = DEV_PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('사번').fill(employeeNo)
  await page.getByLabel('비밀번호').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
}
