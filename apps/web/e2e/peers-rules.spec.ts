import { expect, test } from '@playwright/test'
import { NURSE, loginAndWait } from './fixtures'

// Build Spec 2-10 §4 E2E. 오늘 10/13 고정 → 10월은 종이 근무표(가명) 확정본
test('S6 동료 현황: 교대 근무자 10명, 누적 OFF 오름차순, 내 행 "나", 확정 전 달은 빈 상태', async ({
  page,
}) => {
  await loginAndWait(page, NURSE.employeeNo)
  await page.getByRole('navigation').getByRole('link', { name: '동료 현황' }).click()
  await expect(page.getByRole('heading', { name: '동료 현황 · 2026년 10월' })).toBeVisible()
  const table = page.getByRole('table', { name: '동료 현황' })
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') })
  await expect(rows).toHaveCount(10)
  await expect(table.getByRole('row', { name: '한수정' })).toHaveCount(0)

  // 정하늘 누적 off = 종이 +4 (근무표와 같은 값)
  const me = table.getByRole('row', { name: NURSE.name })
  await expect(me).toHaveAttribute('data-me', 'true')
  await expect(me).toContainText('나')
  await expect(me.locator('[data-col="acc"]')).toHaveText('+4')

  const acc = (await table.locator('[data-col="acc"]').allTextContents()).map((t) =>
    Number(t.replace('−', '-')),
  )
  expect(acc).toEqual([...acc].sort((a, b) => a - b))
  for (const w of await table.locator('[data-col="weekend"]').allTextContents())
    expect(w).toMatch(/^(\d+\/\d+–[\d/]+( 예정)?( 외 \d+)?|미배정 → 11월 우선)$/)

  await page.getByRole('link', { name: '이전 달' }).click()
  await expect(page.getByRole('heading', { name: '동료 현황 · 2026년 9월' })).toBeVisible()
  await expect(page.getByText('9월 근무표가 아직 확정되지 않았습니다.')).toBeVisible()
})

test('S7 규칙 안내: 목차 7개, 근무 카드, 규칙 값·태그', async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await page.goto('/rules')
  const toc = page.getByRole('navigation', { name: '규칙 목차' })
  await expect(toc.getByRole('link')).toHaveCount(7)
  await expect(page.getByText('22:30 – 익일 07:30')).toBeVisible()
  const rest = page.getByRole('region', { name: '휴식 · 금지 패턴' })
  await expect(rest).toContainText('최소 16시간의 휴식')
  await expect(rest).toContainText('E-D, N-E, N-off-D, E-S 패턴은 편성하지 않습니다.')
  const night = page.getByRole('region', { name: '응급실 야간 운영' })
  await expect(night.getByRole('listitem').filter({ hasText: '야간 전담이 없습니다' })).toContainText(
    '사용 안 함',
  )

  await toc.getByRole('link', { name: '응급실 지침' }).click()
  await expect(page).toHaveURL(/#er$/)
  await expect(toc.getByRole('link', { name: '응급실 지침' })).toHaveAttribute('aria-current', 'true')
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.goto('/rules')
  await page.screenshot({ path: 'test-results/rules-1280x760.png' })
  await page.goto('/peers')
  await page.screenshot({ path: 'test-results/peers-1280x720.png' })
})
