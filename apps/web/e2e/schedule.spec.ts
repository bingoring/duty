import { expect, test } from '@playwright/test'
import { ADMIN, NURSE, loginAndWait as login } from './fixtures'

// Build Spec 2-3 §5. 개발 시드의 종이 2026-10(가명) 확정 근무표를 쓴다
test.describe('S3 근무표', () => {
  test('간호사: 10월 격자 11행, 수간호사 첫 행·내 줄 둘째 행, 요약 카드', async ({ page }) => {
    await login(page, NURSE.employeeNo)
    await page.goto('/?ym=2026-10')
    await expect(page.getByRole('heading', { name: '2026년 10월 · 응급실 근무표' }).last()).toBeVisible()
    await expect(page.getByText('확정 · 담당 한수정')).toBeVisible()
    const rows = page.getByRole('grid').getByRole('row')
    await expect(rows).toHaveCount(11)
    await expect(rows.nth(0)).toHaveAttribute('aria-label', ADMIN.name)
    await expect(rows.nth(0)).toHaveAttribute('data-kind', 'head')
    await expect(rows.nth(1)).toHaveAttribute('aria-label', NURSE.name)
    await expect(rows.nth(1)).toHaveAttribute('data-kind', 'me')
    // 정하늘 누적 off = 종이 +4, 10/1 N
    await expect(rows.nth(1).locator('[data-col="acc"]')).toHaveText('+4')
    await expect(rows.nth(1).locator('[data-date="2026-10-01"]')).toHaveAttribute('title', '10/1 (목) · N')
    const cards = page.getByLabel('내 요약')
    for (const label of ['이번달 OFF', '누적 OFF (이월 포함)', '잔여 나이트', '연차 / 특휴'])
      await expect(cards.getByText(label)).toBeVisible()
    await expect(cards.getByText('다음 달 반납 4')).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.screenshot({ path: 'test-results/schedule-1280x760.png' })
  })

  test('월 이동과 근무표가 없는 달의 빈 상태', async ({ page }) => {
    await login(page, NURSE.employeeNo)
    await page.goto('/?ym=2026-10')
    await page.getByRole('link', { name: '다음 달' }).click()
    await expect(page).toHaveURL('/?ym=2026-11')
    await expect(page.getByText('2026년 11월 근무표가 아직 확정되지 않았습니다.')).toBeVisible()
    await page.getByRole('link', { name: '이전 달' }).click()
    await expect(page).toHaveURL('/?ym=2026-10')
    await page.getByRole('link', { name: '이전 달' }).click()
    await expect(page).toHaveURL('/?ym=2026-09')
    await expect(page.getByText('2026년 9월 근무표가 아직 확정되지 않았습니다.')).toBeVisible()
  })

  test('잘못된 ym은 이번 달(고정된 오늘 2026-10-13)로 보여 준다', async ({ page }) => {
    await login(page, NURSE.employeeNo)
    await page.goto('/?ym=2026-13')
    await expect(page.getByRole('heading', { name: '2026년 10월 · 응급실 근무표' }).last()).toBeVisible()
  })

  test('오늘 열 강조 (핸드오프 v3): 이번 달에만, 헤더와 모든 행의 칸', async ({ page }) => {
    await login(page, NURSE.employeeNo)
    await expect(page.getByRole('grid').locator('[data-today-head]')).toHaveCount(2)
    await expect(page.getByRole('grid').locator('[data-today="true"]')).toHaveCount(11)
    await expect(page.getByRole('grid').locator('[data-today="true"]').first()).toHaveAttribute(
      'data-date',
      '2026-10-13',
    )
    await expect(page.getByLabel('내 요약').getByText('오늘 10/13 (화)')).toBeVisible()
    await page.goto('/?ym=2026-09')
    await expect(page.locator('[data-today-head]')).toHaveCount(0)
  })

  test('인쇄 모드: 사이드바·카드·헤더 컨트롤을 숨기고 격자만', async ({ page }) => {
    await login(page, NURSE.employeeNo)
    await page.goto('/?ym=2026-10')
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('navigation')).toBeHidden()
    await expect(page.getByLabel('내 요약')).toBeHidden()
    await expect(page.getByRole('link', { name: '다음 달' })).toBeHidden()
    await expect(page.getByRole('grid')).toBeVisible()
    // A4 가로 1장 (1-3 §7). CSS @page 크기를 따른다
    const pdf = await page.pdf({
      path: 'test-results/schedule-print.pdf',
      preferCSSPageSize: true,
      printBackground: true,
    })
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1)
  })
})

test.describe('공통 셸 (핸드오프 v2)', () => {
  test('간호사도 근무 조정 메뉴, 휴가 신청 메뉴 없음, 「내 휴가 잔여」 카드', async ({ page }) => {
    await login(page, NURSE.employeeNo)
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link', { name: '근무 조정' })).toBeVisible()
    await expect(nav.getByRole('link', { name: '휴가 신청' })).toHaveCount(0)
    const card = nav.getByLabel('내 휴가 잔여')
    for (const label of ['연차', '특별휴가', '검진 반차', '병가', '누적 OFF', '잔여 N'])
      await expect(card.getByText(label, { exact: true })).toBeVisible()
    await nav.getByRole('link', { name: '근무 조정' }).click()
    await expect(page.getByRole('heading', { name: '근무 조정' })).toBeVisible()
    await expect(page.getByRole('navigation').getByLabel('내 휴가 잔여')).toBeVisible()
  })

  test('관리자 화면에서도 잔여 카드가 보인다', async ({ page }) => {
    await login(page, ADMIN.employeeNo)
    await page.goto('/admin/staff')
    await expect(page.getByRole('navigation').getByLabel('내 휴가 잔여')).toBeVisible()
  })
})
