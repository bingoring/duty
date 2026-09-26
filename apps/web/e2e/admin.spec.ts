import { expect, test } from '@playwright/test'
import { ADMIN, NURSE, login, loginAndWait } from './fixtures'

// Build Spec 2-4 §4 E2E. 다른 스펙에 영향을 주지 않도록 만든 데이터는 테스트 안에서 되돌린다
test.describe('S10 간호사 관리', () => {
  test('신규 간호사 추가 → 임시 비밀번호 1회 → 첫 로그인 비밀번호 변경 → 제거', async ({ page, browser }) => {
    await loginAndWait(page, ADMIN.employeeNo)
    await page.goto('/admin/staff')
    await expect(page.getByRole('heading', { name: '간호사 관리 · 응급실 11명' })).toBeVisible()
    const panel = page.getByRole('complementary', { name: '간호사 추가' })
    await panel.getByLabel('사번').fill('00150')
    await panel.getByLabel('성명').fill('추가테스트')
    await panel.getByLabel('입사일').fill('2026-10-01')
    await panel.getByText('신규 간호사 · 트레이닝 3개월').click()
    await panel.getByLabel('프리셉터').selectOption({ label: NURSE.name })
    await panel.getByRole('button', { name: '추가 · 초기 비밀번호 발급' }).click()
    const pw = (await page.getByTestId('temp-password').textContent())!.trim()
    expect(pw).toHaveLength(12)
    await page.getByRole('button', { name: '확인' }).click()
    const row = page.getByRole('row', { name: '추가테스트' })
    await expect(row).toContainText('신규')
    await expect(row).toContainText(`~2026-12-31 · 프리셉터 ${NURSE.name}`)
    await expect(page.getByRole('row', { name: NURSE.name })).toContainText('프리셉터')

    // 새 계정의 첫 로그인
    const other = await browser.newPage()
    await login(other, '00150', pw)
    await expect(other).toHaveURL('/password')
    await other.close()

    // 제거
    await row.getByRole('button', { name: '추가테스트 메뉴' }).click()
    await page.getByRole('button', { name: '제거' }).click()
    await page.getByRole('dialog', { name: '간호사 제거' }).getByRole('button', { name: '제거' }).click()
    await expect(page.getByRole('row', { name: '추가테스트' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '간호사 관리 · 응급실 11명' })).toBeVisible()
  })

  test('중복 사번은 필드 오류', async ({ page }) => {
    await loginAndWait(page, ADMIN.employeeNo)
    await page.goto('/admin/staff')
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.screenshot({ path: 'test-results/staff-1280x760.png', caret: 'initial' })
    const panel = page.getByRole('complementary', { name: '간호사 추가' })
    await panel.getByLabel('사번').fill(NURSE.employeeNo)
    await panel.getByLabel('성명').fill('중복')
    await panel.getByRole('button', { name: '추가 · 초기 비밀번호 발급' }).click()
    await expect(panel.getByText('이미 등록된 사번입니다.')).toBeVisible()
  })
})

test.describe('S11 규칙 설정', () => {
  test('수치 변경 → 저장 전 표시 → 저장 → 이력', async ({ page }) => {
    await loginAndWait(page, ADMIN.employeeNo)
    await page.goto('/admin/rules')
    await expect(page.getByText('다음 듀티 생성(11월)부터 적용')).toBeVisible()
    await page.getByRole('button', { name: '최대 연속 오프 늘리기' }).click()
    await expect(page.getByText('변경 1건 저장 전')).toBeVisible()
    await expect(page.getByText('15 → 16 변경, 저장 전')).toBeVisible()
    await page.getByRole('button', { name: '저장 · 규칙 안내 반영' }).click()
    await expect(page.getByRole('status')).toContainText('저장했습니다')
    await expect(page.getByText('최대 연속 오프 15 → 16')).toBeVisible()
    await expect(page.getByRole('button', { name: '저장 · 규칙 안내 반영' })).toBeDisabled()
  })

  test('범위를 벗어나면 저장되지 않고 항목에 오류', async ({ page }) => {
    await loginAndWait(page, ADMIN.employeeNo)
    await page.goto('/admin/rules')
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.screenshot({ path: 'test-results/rules-1280x820.png', caret: 'initial' })
    await page.getByLabel('근무 간 최소 휴식', { exact: true }).fill('30')
    await page.getByRole('button', { name: '저장 · 규칙 안내 반영' }).click()
    await expect(page.getByText('근무 간 최소 휴식은 8~24시간 사이여야 합니다.')).toBeVisible()
  })

  test('병원 지정일을 추가하면 근무표의 빨간 날이 되고, 삭제하면 돌아온다', async ({ page }) => {
    await loginAndWait(page, ADMIN.employeeNo)
    await page.goto('/admin/rules?year=2026')
    const section = page.getByRole('region', { name: '공휴일·병원 지정일' })
    await expect(section.getByRole('button', { name: '공공데이터에서 가져오기' })).toBeDisabled()
    await section.getByLabel('날짜').fill('2026-10-14')
    await section.getByLabel('이름').fill('병원 휴무 테스트')
    await section.getByRole('button', { name: '추가' }).click()
    await expect(section.getByRole('row', { name: '2026-10-14 병원 휴무 테스트' })).toBeVisible()

    await page.goto('/?ym=2026-10')
    const head = page.getByRole('grid').locator('div', { hasText: /^14$/ })
    await expect(head.first()).toHaveClass(/bg-weekend-head/)

    await page.goto('/admin/rules?year=2026')
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: '병원 휴무 테스트 삭제' }).click()
    await expect(page.getByRole('row', { name: '2026-10-14 병원 휴무 테스트' })).toHaveCount(0)
  })

  test('간호사는 관리자 화면에서 403', async ({ page }) => {
    await loginAndWait(page, NURSE.employeeNo)
    const res = await page.goto('/admin/rules')
    expect(res?.status()).toBe(403)
  })
})
