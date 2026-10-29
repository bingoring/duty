import { expect, test, type Page } from '@playwright/test'
import { ADMIN, DEV_PASSWORD, NURSE, login, loginAndWait, waitHydrated } from '../fixtures'

// 3-12 모바일 1차: 아래 탭 셸·오늘 카드·내 달력·날짜별 명단·PC 안내·홈 화면 추가 (오늘 10/13 고정)
const DOCTOR = '820303'

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('간호사: 아래 탭, 오늘 카드, 내 달력에서 날짜를 누르면 같이 서는 사람', async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await waitHydrated(page)
  const tabs = page.getByRole('navigation', { name: '아래 탭' })
  for (const t of ['근무표', '신청', '교환', '더보기'])
    await expect(tabs.getByRole('link', { name: t })).toBeVisible()
  await expect(tabs.getByRole('link', { name: '근무표' })).toHaveAttribute('aria-current', 'page')
  const card = page.getByRole('region', { name: '오늘 내 근무' })
  await expect(card.getByText('오늘 10/13 (화)')).toBeVisible()
  await expect(card.getByText(/이번 달 OFF \d+ · 누적 OFF/)).toBeVisible()
  const cal = page.getByRole('grid', { name: '내 근무 달력' })
  await expect(cal.getByRole('button', { name: /^13일 / })).toBeVisible()
  await cal.getByRole('button', { name: /^14일 / }).click()
  await expect(page.getByText(/^14일 /)).toBeVisible()
  await noHorizontalOverflow(page)
})

test('전체: 날짜별 명단에서 나 강조, 날짜를 바꾸면 명단이 바뀐다', async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await page.goto('/?tab=all&date=2026-10-13')
  await waitHydrated(page)
  await expect(page.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: '13일', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText(`${NURSE.name}(나)`)).toBeVisible()
  await page.getByRole('button', { name: '14일', exact: true }).click()
  await expect(page.getByRole('button', { name: '14일', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText(`${NURSE.name}(나)`)).toBeVisible()
  await noHorizontalOverflow(page)
})

test('달을 넘기면 그 달 1일이 골라지고, 바뀐 근무 링크(?focus=)는 그 날을 고른다', async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await page.goto('/?ym=2026-10&tab=all&date=2026-10-13')
  await waitHydrated(page)
  await page.getByRole('link', { name: '다음 달' }).click()
  await page.waitForURL(/ym=2026-11/)
  await expect(page.getByRole('button', { name: '1일', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/?ym=2026-10&focus=2026-10-20')
  await waitHydrated(page)
  await expect(page.getByRole('button', { name: /^20일 / })).toHaveAttribute('aria-pressed', 'true')
})

test('더보기: 휴가 잔여·메뉴·로그아웃', async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await page.getByRole('navigation', { name: '아래 탭' }).getByRole('link', { name: '더보기' }).click()
  await page.waitForURL('/more')
  for (const t of ['동료 현황', '규칙 안내', '내 설정'])
    await expect(
      page.getByRole('navigation', { name: '더보기 메뉴' }).getByRole('link', { name: t }),
    ).toBeVisible()
  await expect(page.getByText('잔여 N')).toBeVisible()
  await page.getByRole('button', { name: '로그아웃' }).click()
  await page.waitForURL(/\/login/)
})

test('관리자: 교환 대신 관리 탭, 듀티 생성·근무 조정은 PC 안내', async ({ page }) => {
  await loginAndWait(page, ADMIN.employeeNo)
  await waitHydrated(page)
  const tabs = page.getByRole('navigation', { name: '아래 탭' })
  await expect(tabs.getByRole('link', { name: '관리' })).toBeVisible()
  await expect(tabs.getByRole('link', { name: '교환' })).toHaveCount(0)
  await tabs.getByRole('link', { name: '관리' }).click()
  await page.waitForURL('/manage')
  await expect(page.getByText('규칙 설정')).toBeVisible()
  for (const path of ['/admin/generate', '/adjust']) {
    await page.goto(path)
    await waitHydrated(page)
    await expect(page.getByRole('heading', { name: 'PC에서 이용해 주세요' })).toBeVisible()
  }
})

test('의사: 아래 탭과 오늘 카드, 전체에서 간호사 명단으로 전환', async ({ page }) => {
  await login(page, DOCTOR, DEV_PASSWORD)
  await page.waitForURL('/doctor')
  await waitHydrated(page)
  const tabs = page.getByRole('navigation', { name: '아래 탭' })
  for (const t of ['근무표', '신청', '교환', '더보기'])
    await expect(tabs.getByRole('link', { name: t })).toBeVisible()
  await expect(page.getByRole('region', { name: '오늘 내 근무' }).getByText('오늘 10/13 (화)')).toBeVisible()
  await page.getByRole('tab', { name: '전체' }).click()
  await page.waitForURL(/tab=all/)
  await page.getByRole('button', { name: '간호사' }).click()
  await expect(page.getByText(NURSE.name).first()).toBeVisible()
  await noHorizontalOverflow(page)
})

test('로그인 화면 한 열', async ({ page }) => {
  await page.goto('/login')
  await waitHydrated(page)
  await expect(page.getByLabel('사번')).toBeVisible()
  await expect(page.getByRole('button', { name: '로그인' })).toBeInViewport()
  await noHorizontalOverflow(page)
})

test('홈 화면 추가 파일은 로그인 없이 받는다', async ({ request }) => {
  for (const p of ['/manifest.webmanifest', '/pwa-icon/192', '/pwa-icon/512', '/pwa-icon/180'])
    expect((await request.get(p, { maxRedirects: 0 })).status(), p).toBe(200)
})
