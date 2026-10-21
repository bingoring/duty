import { expect, test, type Page } from '@playwright/test'
import { DEV_PASSWORD, login, loginAndWait, waitHydrated } from './fixtures'

// 3-7 의사 근무표 E2E (오늘 10/13 고정, 시드 = 가명 의사 5명 + 10월 확정본)
const DOC = { admin: '800101', go: '810202', no: '820303', baek: '830404', jin: '840505' }

async function doctorLogin(page: Page, id: string) {
  await login(page, id, DEV_PASSWORD)
  await page.waitForURL('/doctor')
}

test('의사: 주 단위 달력 · 올데이 · 집계, 「간호사」 탭은 간호사 확정본 읽기 전용, 간호사 화면은 막힌다', async ({
  page,
}) => {
  await doctorLogin(page, DOC.no)
  await expect(page.getByRole('heading', { name: '2026년 10월 · 응급실 의사 근무표' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: '22일 Day 백승우' })).toBeVisible()
  await expect(page.getByText('올데이').first()).toBeVisible()
  await expect(page.getByText('다음 근무')).toBeVisible()
  await expect(page.getByRole('row', { name: /백승우.*D \+1/ })).toBeVisible()
  await page.getByRole('link', { name: '간호사', exact: true }).click()
  await expect(page.getByText('정하늘').first()).toBeVisible()
  // 간호사 화면에 오면 의사 홈으로
  await page.goto('/requests')
  await page.waitForURL('/doctor')
  await page.goto('/admin/generate')
  await page.waitForURL('/doctor')
})

test('간호사: 근무표 「의사」 탭에서 의사 확정 근무표를 본다, 의사 화면은 막힌다', async ({ page }) => {
  await loginAndWait(page, '00103')
  await page.getByRole('link', { name: '의사', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2026년 10월 · 응급실 의사 근무표' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: '1일 Night 노준호' })).toBeVisible()
  await expect(page.getByText('다음 근무')).toHaveCount(0)
  await page.goto('/doctor/requests')
  await page.waitForURL('/')
})

test('의사 신청: 고정 조건과 부딪히면 묻고 그 날만 예외로 제출한다', async ({ page }) => {
  await doctorLogin(page, DOC.no)
  await page.goto('/doctor/requests?ym=2026-11')
  await expect(page.getByText('신청 마감 10/20')).toBeVisible()
  await page.getByRole('button', { name: '1일', exact: true }).click()
  await page.getByRole('button', { name: 'D', exact: true }).click()
  await page.getByRole('button', { name: '신청 제출' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('일요일 근무 금지')).toBeVisible()
  await dialog.getByRole('button', { name: '이 날만 예외로 제출' }).click()
  await expect(page.getByText('제출했습니다')).toBeVisible()
})

test('의사 관리자: 11월 생성 → 검사 결과 → 확정하면 근무표에 공개', async ({ page }) => {
  test.setTimeout(90_000)
  await doctorLogin(page, DOC.admin)
  await page.goto('/doctor/admin/generate?ym=2026-11')
  await page.getByRole('button', { name: '생성', exact: true }).click()
  const result = page.getByRole('region', { name: '검사 결과' })
  await expect(result.getByText('매일 D1·N1')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '이 안으로 확정' }).click()
  await expect(page.getByText(/확정했습니다/)).toBeVisible()
  await page.goto('/doctor?ym=2026-11')
  await expect(page.getByText('확정 · 담당 허재민')).toBeVisible()
})

test('의사 관리: 생년월일 ID를 사번으로 변경하면 새 ID로 로그인한다', async ({ page, browser }) => {
  await doctorLogin(page, DOC.admin)
  await page.goto('/doctor/admin/staff')
  const row = page.getByRole('row', { name: /830404/ })
  await row.getByRole('button', { name: '사번으로 변경' }).click()
  await page.getByRole('dialog').getByLabel('새 사번').fill('20269999')
  await page.getByRole('dialog').getByRole('button', { name: '변경' }).click()
  await expect(page.getByRole('row', { name: /20269999/ })).toBeVisible()
  const other = await browser.newPage()
  await doctorLogin(other, '20269999')
  await expect(other.getByText('ID 20269999')).toBeVisible()
  await other.close()
})

test('의사 교환: 진하람 → 고은서에게 요청 → 배지 → 수락하면 바로 반영', async ({ page, browser }) => {
  await doctorLogin(page, DOC.jin)
  await page.goto('/doctor/adjust')
  // 10/23(금) Day 진하람 ↔ 10/26(월) Day 고은서 — 고정 조건(토 Night 필수)과 무관한 칸
  await page.getByRole('gridcell', { name: '23일 Day 진하람' }).getByRole('button').click()
  await page.getByRole('gridcell', { name: '26일 Day 고은서' }).getByRole('button').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('고은서에게 요청됩니다')).toBeVisible()
  await dialog.getByRole('button', { name: '요청 보내기' }).click()
  await expect(dialog).toHaveCount(0)

  const go = await browser.newPage()
  await doctorLogin(go, DOC.go)
  await expect(go.getByRole('link', { name: /근무 조정/ }).getByLabel('받은 교환 요청 1건')).toBeVisible()
  await go.goto('/doctor/adjust')
  await go.getByRole('button', { name: '수락' }).click()
  await expect(go.getByRole('gridcell', { name: '23일 Day 고은서' })).toBeVisible()
  await expect(go.getByRole('gridcell', { name: '26일 Day 진하람' })).toBeVisible()
  await go.close()
})

// 3-11 12·4: 본인 신청은 생성 전까지 칸에서 「철회」, 칩 앞 빨간 점(본인 신청)
test('의사 신청: 제출한 신청을 칸의 「철회」로 지운다', async ({ page }) => {
  await doctorLogin(page, DOC.go)
  // 11월은 앞 테스트에서 확정되므로 12월
  await page.goto('/doctor/requests?ym=2026-12')
  await waitHydrated(page)
  await page.getByRole('button', { name: '3일', exact: true }).click()
  await page.getByRole('button', { name: 'O', exact: true }).click()
  await page.getByRole('button', { name: '신청 제출' }).click()
  await expect(page.getByText('제출했습니다')).toBeVisible()
  await expect(page.getByLabel('본인 신청').first()).toBeVisible()
  await page.getByRole('button', { name: '3일 신청 철회' }).click()
  await expect(page.getByText('신청을 철회했습니다')).toBeVisible()
  await expect(page.getByRole('button', { name: '3일 신청 철회' })).toHaveCount(0)
})

// 3-11 1: 강조(hl)는 조정 화면에도 있고 메뉴로 옮겨 가도 유지된다
test('의사 강조: 조정 화면에서 고른 의사가 근무표로 이어진다', async ({ page }) => {
  await doctorLogin(page, DOC.no)
  await page.goto('/doctor/adjust')
  await waitHydrated(page)
  await page.getByRole('link', { name: '고은서', exact: true }).click()
  await expect(page).toHaveURL(/hl=/)
  await expect(page.getByRole('link', { name: '고은서', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await page.getByRole('link', { name: '근무표', exact: true }).click()
  await expect(page).toHaveURL(/\/doctor\?hl=/)
  await expect(page.getByRole('link', { name: '고은서', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  )
})

// 3-11 6/7·10: 규칙 설정 오른쪽 「규칙 안내」 패널과 금지 패턴 목록 — 저장하면 의사 규칙 안내에 그대로
test('의사 규칙 설정: 금지 패턴 N-O-D를 권고로 추가하면 규칙 안내에 보인다', async ({ page }) => {
  await doctorLogin(page, DOC.admin)
  await page.goto('/doctor/admin/rules')
  await waitHydrated(page)
  const guide = page.getByRole('region', { name: '규칙 안내' })
  await expect(guide.getByText('매일 Day 1명 · Night 1명')).toBeVisible()
  await expect(guide.getByRole('radiogroup', { name: '금지 패턴 N-D 필수/권고' })).toBeVisible()
  const patterns = page.getByRole('region', { name: '금지 패턴' })
  await patterns.getByRole('button', { name: '패턴 하루 늘리기' }).click()
  await patterns.getByLabel('패턴 1일째').selectOption('N')
  await patterns.getByLabel('패턴 2일째').selectOption('O')
  await patterns.getByLabel('패턴 3일째').selectOption('D')
  await patterns.getByRole('button', { name: '패턴 추가' }).click()
  await guide
    .getByRole('radiogroup', { name: '금지 패턴 N-O-D 필수/권고' })
    .getByRole('radio', { name: '권고' })
    .click()
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByText(/저장했습니다/)).toBeVisible()
  await page.goto('/doctor/rules')
  const item = page.getByRole('listitem').filter({ hasText: '금지 패턴 N-O-D' })
  await expect(item.getByText('권고')).toBeVisible()
  await expect(page.getByText('의사 근무표에는 연차가 없습니다(필요하면 추가)')).toBeVisible()
})
