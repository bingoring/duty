import { expect, test } from '@playwright/test'
import { ADMIN, E2E_TEMP_USER, NURSE, login } from './fixtures'

test('미인증 사용자는 로그인으로 이동하고, 로그인 후 원래 경로로 돌아간다', async ({ page }) => {
  await page.goto('/requests')
  await expect(page).toHaveURL(/\/login\?next=%2Frequests/)
  await page.getByLabel('사번').fill(NURSE.employeeNo)
  await page.getByLabel('비밀번호').fill('duty-dev-1234')
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL('/requests')
  await expect(page.getByRole('heading', { name: '근무 신청' })).toBeVisible()
})

test('간호사 셸: 이름·사번, 관리자 메뉴 대신 "권한 없음"', async ({ page }) => {
  await login(page, NURSE.employeeNo)
  await expect(page).toHaveURL('/')
  const nav = page.getByRole('navigation')
  await expect(nav.getByText(NURSE.name)).toBeVisible()
  await expect(nav.getByText(`응급실 · 사번 ${NURSE.employeeNo}`)).toBeVisible()
  await expect(nav.getByText('권한 없음')).toBeVisible()
  await expect(nav.getByRole('link', { name: '듀티 생성' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: '근무표' })).toHaveAttribute('aria-current', 'page')
})

test('관리자 셸: 관리자 메뉴 3개와 "관리자" 표시 (핸드오프 v2)', async ({ page }) => {
  await login(page, ADMIN.employeeNo)
  const nav = page.getByRole('navigation')
  for (const label of ['듀티 생성', '간호사 관리', '규칙 설정']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible()
  }
  await expect(nav.getByText('관리자', { exact: true }).last()).toBeVisible()
  await nav.getByRole('link', { name: '간호사 관리' }).click()
  await expect(page.getByRole('heading', { name: '간호사 관리' })).toBeVisible()
})

test('간호사가 관리자 화면에 들어가면 403', async ({ page }) => {
  await login(page, NURSE.employeeNo)
  await expect(page).toHaveURL('/')
  const res = await page.goto('/admin/staff')
  expect(res?.status()).toBe(403)
  await expect(page.getByRole('heading', { name: '권한이 없습니다' })).toBeVisible()
})

test('틀린 비밀번호는 같은 오류 문구를 보여 준다', async ({ page }) => {
  await login(page, NURSE.employeeNo, 'wrong-password')
  await expect(page.locator('form').getByRole('alert')).toHaveText('사번 또는 비밀번호가 올바르지 않습니다.')
  await expect(page.getByLabel('사번')).toHaveValue(NURSE.employeeNo)
})

test('"비밀번호를 잊으셨나요?"는 관리자 재발급 안내를 보여 준다', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: '비밀번호를 잊으셨나요?' }).click()
  await expect(page.getByRole('status')).toHaveText('관리자(수간호사)에게 비밀번호 재발급을 요청해 주세요.')
})

test('첫 로그인은 비밀번호 변경을 강제한다', async ({ page }) => {
  await login(page, E2E_TEMP_USER.employeeNo, E2E_TEMP_USER.tempPassword)
  await expect(page).toHaveURL('/password')
  await page.goto('/requests')
  await expect(page).toHaveURL('/password')
  await page.getByLabel('새 비밀번호', { exact: true }).fill('my-new-pass-1')
  await page.getByLabel('새 비밀번호 확인').fill('my-new-pass-1')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('navigation').getByText(E2E_TEMP_USER.name)).toBeVisible()
})

test('로그아웃하면 다시 로그인해야 한다', async ({ page }) => {
  await login(page, NURSE.employeeNo)
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page).toHaveURL('/login')
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('로그인 화면 스크린샷 (1d와 수동 비교용)', async ({ page }) => {
  await page.goto('/login')
  await page.screenshot({ path: 'test-results/login-1280x720.png', caret: 'initial' })
  await login(page, ADMIN.employeeNo)
  await expect(page).toHaveURL('/')
  await page.screenshot({ path: 'test-results/shell-admin-1280x720.png', caret: 'initial' })
})
