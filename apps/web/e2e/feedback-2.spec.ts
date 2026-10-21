import { expect, test, type Browser } from '@playwright/test'
import { ADMIN, NURSE, loginAndWait, waitHydrated } from './fixtures'

// 3-5 운영 피드백 2. 오늘은 2026-10-13 고정 → 신청 대상 11월, 10월은 확정된 달
const SORA = { employeeNo: '00107', name: '임소라' }

async function as(browser: Browser, employeeNo: string, path: string) {
  const page = await browser.newPage()
  await loginAndWait(page, employeeNo)
  await page.goto(path)
  await waitHydrated(page)
  return page
}

// 3-9 9·14: 관리자는 간호사의 OFF 신청을 바로 휴가로 바꾼다(수락 없음), 지우지는 못한다
test('관리자가 OFF 신청을 바로 휴가로 바꾸면 파란 표시로 보이고, 간호사 신청은 지울 수 없다', async ({
  browser,
}) => {
  const me = await as(browser, SORA.employeeNo, '/requests')
  const cellOf = (p: typeof me) => p.getByRole('button', { name: `${SORA.name} 2026-11-27` })
  await cellOf(me).click()
  await me.getByRole('dialog').getByRole('button', { name: 'OFF', exact: true }).click()
  // 3-8: OFF만 신청하면 전날 N 안내 확인 창
  me.once('dialog', (d) => {
    expect(d.message()).toContain('전날(11/26)')
    void d.accept()
  })
  await me.getByRole('dialog').getByRole('button', { name: '임시 저장' }).click()
  await me.getByRole('button', { name: '신청 제출' }).click()
  await expect(me.getByRole('status')).toContainText('제출했습니다')

  const admin = await as(browser, ADMIN.employeeNo, '/requests')
  await cellOf(admin).click()
  const pop = admin.getByRole('dialog')
  await expect(pop.getByRole('button', { name: '삭제' })).toHaveCount(0)
  await pop.getByRole('button', { name: '휴가' }).click()
  await pop.getByRole('button', { name: '병가' }).click()
  await expect(pop.getByText('OFF가 바로 휴가로 바뀝니다')).toBeVisible()
  admin.once('dialog', (d) => {
    expect(d.message()).toContain('근무 신청 1건을 지우고 휴가로 바꿀까요?')
    void d.accept()
  })
  await pop.getByRole('button', { name: '휴가로 바꾸기' }).click()
  await expect(cellOf(admin)).toHaveText('병가')
  // 3-10 3: 관리자 입력은 파란 표시
  await expect(cellOf(admin).locator('[data-by-admin]')).toBeVisible()

  await me.reload()
  await waitHydrated(me)
  await expect(cellOf(me)).toHaveText('병가')
  // 3-10 10: 관리자가 넣은 휴가는 간호사가 취소하지 못한다
  await cellOf(me).click()
  const mine = me.getByRole('dialog')
  await expect(mine.getByText('관리자가 넣은 신청입니다')).toBeVisible()
  await expect(mine.getByRole('button', { name: '휴가 취소' })).toHaveCount(0)
  await mine.getByRole('button', { name: '닫기' }).click()
  await Promise.all([me.close(), admin.close()])
})

test('규칙 설정에서 필수/권고를 바꾸면 이력에 남고 생성 화면 필수 조건이 따른다', async ({ browser }) => {
  const admin = await as(browser, ADMIN.employeeNo, '/admin/rules')
  const row = admin.locator('[data-rule="maxConsecutiveWork"]')
  await row.getByRole('button', { name: '최대 연속 근무 필수 — 눌러서 권고로' }).click()
  await expect(row.getByRole('button', { name: '최대 연속 근무 권고 — 눌러서 필수로' })).toBeVisible()
  await admin.getByRole('button', { name: '저장 · 규칙 안내 반영' }).click()
  await expect(admin.getByRole('status')).toContainText('저장했습니다')
  await admin.reload()
  await waitHydrated(admin)
  await expect(admin.getByText('최대 연속 근무 필수/권고 필수 → 권고')).toBeVisible()

  await admin.goto('/admin/generate?ym=2026-11')
  await waitHydrated(admin)
  await expect(admin.getByText('연속 근무', { exact: true })).toHaveCount(0)

  // 다른 스펙을 위해 되돌린다
  await admin.goto('/admin/rules')
  await waitHydrated(admin)
  await admin
    .locator('[data-rule="maxConsecutiveWork"]')
    .getByRole('button', { name: '최대 연속 근무 권고 — 눌러서 필수로' })
    .click()
  await admin.getByRole('button', { name: '저장 · 규칙 안내 반영' }).click()
  await expect(admin.getByRole('status')).toContainText('저장했습니다')
  await admin.goto('/admin/generate?ym=2026-11')
  await waitHydrated(admin)
  await expect(admin.getByText('연속 근무', { exact: true })).toBeVisible()
  await admin.close()
})

test('KTAS 수료일을 넣으면 유효기간이 보이고 만료 6개월 이내면 갱신 필요', async ({ browser }) => {
  const admin = await as(browser, ADMIN.employeeNo, '/admin/staff')
  const row = admin.getByRole('row', { name: NURSE.name })
  await expect(row).toContainText('KTAS · 수료일 입력 필요')
  await row.getByRole('button', { name: `${NURSE.name} 메뉴` }).click()
  await admin.getByRole('button', { name: '수정', exact: true }).click()
  const dlg = admin.getByRole('dialog')
  await dlg.getByLabel('KTAS 수료일').fill('2024-01-01')
  await dlg.getByRole('button', { name: '저장', exact: true }).click()
  await expect(row).toContainText('KTAS ~2026-12-31 · 갱신 필요')
  await expect(admin.getByText('응급실 연차')).toBeVisible()

  // 3-8: 갱신 시기면 로그인 때 안내 팝업 → 확인하면 이 세션에서는 다시 안 보인다
  const me = await browser.newPage()
  await loginAndWait(me, NURSE.employeeNo)
  const pop = me.getByRole('dialog', { name: 'KTAS 갱신 안내' })
  await expect(pop).toContainText('2026-12-31에 만료됩니다')
  await pop.getByRole('button', { name: '확인' }).click()
  await me.reload()
  await waitHydrated(me)
  await expect(me.getByRole('dialog', { name: 'KTAS 갱신 안내' })).toHaveCount(0)
  await me.close()

  // 다른 스펙에서 팝업이 화면을 가리지 않게 갱신 시기 밖으로 되돌린다
  await row.getByRole('button', { name: `${NURSE.name} 메뉴` }).click()
  await admin.getByRole('button', { name: '수정', exact: true }).click()
  await admin.getByRole('dialog').getByLabel('KTAS 수료일').fill('2025-01-01')
  await admin.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click()
  await expect(row).toContainText('KTAS ~2027-12-31')
  await admin.close()
})
