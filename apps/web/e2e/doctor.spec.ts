import { expect, test, type Page } from '@playwright/test'
import { DEV_PASSWORD, login, loginAndWait } from './fixtures'

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
