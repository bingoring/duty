import { expect, test } from '@playwright/test'
import { ADMIN, E2E_TEMP_USER, NURSE, login, loginAndWait, waitHydrated } from './fixtures'

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

test('첫 로그인: 동의(거부하면 로그아웃) → 비밀번호 → 초기 설정 → 근무표, 관리자가 되돌린다 → 내 설정 (2-11)', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000)
  await login(page, E2E_TEMP_USER.employeeNo, E2E_TEMP_USER.tempPassword)
  await expect(page).toHaveURL('/consent')
  await page.goto('/requests')
  await expect(page).toHaveURL('/consent')
  // R-CONSENT-3: 거부 → 로그아웃
  await page.getByRole('button', { name: '동의하지 않음' }).click()
  await expect(page).toHaveURL('/login?consent=declined')
  await expect(page.getByText('동의하지 않으면 근무표를 사용할 수 없습니다.')).toBeVisible()
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)

  // R-CONSENT-2: 두 항목 모두 동의해야 계속
  await login(page, E2E_TEMP_USER.employeeNo, E2E_TEMP_USER.tempPassword)
  await expect(page).toHaveURL('/consent')
  await waitHydrated(page)
  const agree = page.getByRole('button', { name: '동의하고 계속' })
  await page.getByLabel('개인정보 수집·이용 동의 (필수)').check()
  await expect(agree).toBeDisabled()
  await page
    .getByRole('button', { name: /전문 보기/ })
    .first()
    .click()
  await expect(page.getByText('퇴직 후 3년')).toBeVisible()
  await page.getByLabel('민감정보 처리 동의 (필수, 별도)').check()
  await agree.click()

  await expect(page).toHaveURL('/password')
  await page.getByLabel('새 비밀번호', { exact: true }).fill('my-new-pass-1')
  await page.getByLabel('새 비밀번호 확인').fill('my-new-pass-1')
  await page.getByRole('button', { name: '저장' }).click()

  // R-ONB-4: 미리 채운 값 확인·수정
  await expect(page).toHaveURL('/onboarding')
  await page.goto('/requests')
  await expect(page).toHaveURL('/onboarding')
  await waitHydrated(page)
  await expect(page.getByRole('heading', { name: '내 정보를 확인해 주세요' })).toBeVisible()
  const bank = page.getByLabel('잔여 나이트')
  const before = Number(await bank.inputValue())
  await bank.fill(String(before + 2))
  await expect(page.getByText(`처음 값: ${before}`)).toBeVisible()
  await page.getByRole('button', { name: '저장하고 근무표 보기' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('navigation').getByText(E2E_TEMP_USER.name)).toBeVisible()

  // R-ONB-7: 관리자에게 "본인 입력 확인 필요" → 되돌리기
  const admin = await browser.newPage()
  await loginAndWait(admin, ADMIN.employeeNo)
  await admin.goto('/admin/staff')
  await waitHydrated(admin)
  await expect(admin.getByRole('row', { name: E2E_TEMP_USER.name })).toContainText('본인 입력 확인 필요')
  const card = admin.getByRole('article', { name: `${E2E_TEMP_USER.name} 본인 입력` })
  await expect(card).toContainText(`잔여 N${before} → ${before + 2}`)
  await card.getByRole('button', { name: '되돌리기…' }).click()
  await card.getByLabel('되돌리는 사유').fill('9월 마감 값과 다름')
  await card.getByRole('button', { name: '되돌리기', exact: true }).click()
  await expect(admin.getByText('이전 값으로 되돌렸습니다.')).toBeVisible()
  await expect(admin.getByRole('row', { name: E2E_TEMP_USER.name })).not.toContainText('본인 입력 확인 필요')
  await admin.close()

  // 내 설정에서 스스로 바꾸기 → 새 비밀번호로 다시 로그인 (2-9 커버리지 보강)
  await page.goto('/settings')
  await page.getByLabel('현재 비밀번호').fill('my-new-pass-1')
  await page.getByLabel('새 비밀번호', { exact: true }).fill('my-new-pass-2')
  await page.getByLabel('새 비밀번호 확인').fill('my-new-pass-2')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('status')).toContainText('비밀번호를 바꿨습니다')
  await page.getByRole('button', { name: '로그아웃' }).click()
  await login(page, E2E_TEMP_USER.employeeNo, 'my-new-pass-2')
  await expect(page).toHaveURL('/')
})

test('개인정보 처리 안내는 로그인 없이 본다 (R-CONSENT-6)', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: '개인정보 처리 안내' }).click()
  await expect(page).toHaveURL('/privacy')
  await expect(page.getByRole('heading', { name: '민감정보 처리 동의 (필수, 별도)' })).toBeVisible()
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
