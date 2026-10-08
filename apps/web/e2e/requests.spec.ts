import { expect, test, type Browser } from '@playwright/test'
import { ADMIN, NURSE, loginAndWait, waitHydrated } from './fixtures'

// Build Spec 2-5 §4 E2E. 오늘은 2026-10-13 고정 → 대상 11월(마감 10/15), 10월은 확정된 달
const PEER = { employeeNo: '00104', name: '오민지' }
const CHAE = { employeeNo: '00106', name: '윤채원' }

async function as(browser: Browser, employeeNo: string, path = '/requests') {
  const page = await browser.newPage()
  await loginAndWait(page, employeeNo)
  await page.goto(path)
  await waitHydrated(page)
  return page
}

test.describe('S4 근무 신청', () => {
  test('복수 옵션 임시 저장 → 제출 → 동료는 코멘트 없이, 관리자는 코멘트 전문', async ({ browser }) => {
    const me = await as(browser, NURSE.employeeNo)
    await expect(me.getByRole('heading', { name: '2026년 11월 · 근무 신청' })).toBeVisible()
    await expect(me.getByText('신청 중 · 마감 10/15 (2일 남음)')).toBeVisible()
    await me.getByRole('button', { name: `${NURSE.name} 2026-11-13` }).click()
    const pop = me.getByRole('dialog')
    await pop.getByRole('button', { name: 'OFF', exact: true }).click()
    await pop.getByRole('button', { name: 'D', exact: true }).click()
    await pop.getByLabel('코멘트').fill('오후 3시 병원 진료')
    await pop.getByRole('button', { name: '임시 저장' }).click()
    await expect(me.getByRole('button', { name: `${NURSE.name} 2026-11-13` })).toHaveText('O/D')
    await expect(me.getByText('제출하지 않은 신청 1건')).toBeVisible()

    const peer = await as(browser, PEER.employeeNo)
    await expect(peer.getByRole('button', { name: `${NURSE.name} 2026-11-13` })).toHaveText('')

    await me.getByRole('button', { name: '신청 제출' }).click()
    await expect(me.getByRole('status')).toHaveText('1건을 제출했습니다.')

    await peer.reload()
    await waitHydrated(peer)
    await expect(peer.getByRole('button', { name: `${NURSE.name} 2026-11-13` })).toHaveText('O/D')
    await expect(peer.locator('body')).not.toContainText('오후 3시 병원 진료')

    const admin = await as(browser, ADMIN.employeeNo)
    await admin.getByRole('button', { name: `${NURSE.name} 2026-11-13` }).hover()
    await expect(admin.getByLabel('코멘트', { exact: true })).toContainText('오후 3시 병원 진료')
    await Promise.all([me.close(), peer.close(), admin.close()])
  })

  test('경조사 휴가: 종료일 자동 → 제출 → 관리자 승인 → 채운 휴', async ({ browser }) => {
    const me = await as(browser, PEER.employeeNo)
    await me.getByRole('button', { name: `${PEER.name} 2026-11-19` }).click()
    const pop = me.getByRole('dialog')
    await pop.getByRole('button', { name: '휴가' }).click()
    await pop.getByRole('button', { name: '경조사' }).click()
    await pop.getByLabel('경조사 사유').selectOption('parent_death')
    await expect(pop.getByText('11/25 (수)')).toBeVisible()
    await expect(pop.getByText('11/19–25 · 7일 · 유급')).toBeVisible()
    await pop.getByRole('button', { name: '임시 저장' }).click()
    for (const d of ['2026-11-19', '2026-11-25'])
      await expect(me.getByRole('button', { name: `${PEER.name} ${d}` })).toHaveText('휴')
    await me.getByRole('button', { name: '신청 제출' }).click()
    await expect(me.getByRole('status')).toContainText('제출했습니다')

    const admin = await as(browser, ADMIN.employeeNo)
    const card = admin.getByRole('article', { name: `${PEER.name} 휴가` })
    await expect(card).toContainText('11월 · 신청 중')
    await expect(card).toContainText('경조사 · 본인·배우자 부모 사망')
    await card.getByRole('button', { name: '승인' }).click()
    await expect(admin.getByRole('article', { name: `${PEER.name} 휴가` })).toHaveCount(0)
    await expect(admin.getByText('처리 이력')).toBeVisible()

    await me.reload()
    await waitHydrated(me)
    await expect(me.getByRole('button', { name: `${PEER.name} 2026-11-19` }).locator('span')).toHaveClass(
      /bg-shift-leave/,
    )
    await Promise.all([me.close(), admin.close()])
  })

  test('연차 잔여를 넘으면 저장되지 않는다', async ({ browser }) => {
    const me = await as(browser, '00105')
    await me.getByRole('button', { name: '강도윤 2026-11-02' }).click()
    const pop = me.getByRole('dialog')
    await pop.getByRole('button', { name: '휴가' }).click()
    await pop.getByLabel('종료일').fill('2026-11-20')
    await pop.getByRole('button', { name: '임시 저장' }).click()
    await expect(pop.getByRole('alert')).toHaveText('연차 잔여를 넘습니다 (신청 19일 / 잔여 15일).')
    await me.close()
  })
})

test.describe('S4-A 확정된 달 휴가', () => {
  test('10월 병가 → 인원 영향 경고 → 승인하면 근무표에 휴', async ({ browser }) => {
    const me = await as(browser, CHAE.employeeNo, '/requests?ym=2026-10')
    await expect(me.getByText('확정된 달 · 휴가만 신청')).toBeVisible()
    await me.getByRole('button', { name: `${CHAE.name} 2026-10-02` }).click()
    const pop = me.getByRole('dialog')
    await expect(pop.getByRole('button', { name: 'OFF', exact: true })).toBeDisabled()
    await pop.getByRole('button', { name: '병가' }).click()
    await pop.getByRole('button', { name: '임시 저장' }).click()
    await me.getByRole('button', { name: '신청 제출' }).click()
    await expect(me.getByRole('status')).toContainText('제출했습니다')

    const admin = await as(browser, ADMIN.employeeNo)
    const card = admin.getByRole('article', { name: `${CHAE.name} 휴가` })
    await expect(card).toContainText('10월 · 확정된 달')
    await expect(card).toContainText('10/2 (금) D 인원 1명 · 최소 2명')
    await expect(card).toContainText('대체 후보: 오민지 (10/2 OFF, K-tass)')
    await card.getByRole('button', { name: '승인 · 대체 지정' }).click()

    // 2-7 R-LEAVE-C1: 승인 뒤 근무 조정의 대체 지정으로 이동 → 후보 지정 → 저장
    await admin.waitForURL('/adjust?ym=2026-10&focus=2026-10-02&shift=D')
    await waitHydrated(admin)
    const rep = admin.getByRole('region', { name: '10/2 D 대체 지정' })
    await expect(rep).toContainText('10/2 (금) D 인원 1명')
    await rep
      .getByRole('button', { name: / 지정$/ })
      .and(admin.locator(':enabled'))
      .first()
      .click()
    await expect(admin.getByText('변경 1건 미저장')).toBeVisible()
    // 지정하면 도크가 그 사람 칸의 적용 상태로 바뀐다
    await expect(admin.getByRole('region', { name: /10\/2 근무 편집$/ })).toContainText('적용됨 · off → D')
    await admin.getByRole('button', { name: '저장 · 재배포' }).click()
    await expect(admin.getByRole('status')).toContainText('1건을 저장했습니다')

    await admin.goto('/?ym=2026-10')
    const row = admin.getByRole('grid').getByRole('row', { name: CHAE.name })
    await expect(row.locator('[data-date="2026-10-02"]')).toHaveAttribute('data-tip', /휴 · 병가/)

    // 2-7 Q4: 확정된 달의 승인 휴가 취소 → 승인 전 칸(D)으로 복원
    await admin.goto('/adjust?ym=2026-10')
    await waitHydrated(admin)
    await admin.getByRole('button', { name: `${CHAE.name} 2026-10-02` }).click()
    admin.once('dialog', (d) => d.accept())
    await admin
      .getByRole('region', { name: `${CHAE.name} 10/2 근무 편집` })
      .getByRole('button', { name: '휴가 취소' })
      .click()
    await expect(admin.getByRole('status')).toContainText('휴가를 취소했습니다. 1일을 되돌렸습니다.')
    await expect(admin.getByRole('button', { name: `${CHAE.name} 2026-10-02` })).toHaveAttribute(
      'data-tip',
      /D/,
    )
    await Promise.all([me.close(), admin.close()])
  })
})

test('간호사는 휴가 승인 패널을 보지 않는다', async ({ browser }) => {
  const me = await as(browser, NURSE.employeeNo)
  await expect(me.getByRole('complementary', { name: '휴가 승인' })).toHaveCount(0)
  await me.close()
})

test('수간호사 행: OFF·D 중 하나만 신청 (2-11 R-HEAD-2)', async ({ browser }) => {
  const admin = await as(browser, ADMIN.employeeNo)
  const cell = admin.getByRole('button', { name: `${ADMIN.name} 2026-11-18` })
  await cell.click()
  const pop = admin.getByRole('dialog')
  await expect(pop.getByText('평일 기본 S · OFF 또는 D 하나')).toBeVisible()
  await expect(pop.getByRole('button', { name: 'E', exact: true })).toHaveCount(0)
  await pop.getByRole('button', { name: 'OFF', exact: true }).click()
  await pop.getByRole('button', { name: 'D', exact: true }).click()
  await expect(pop.getByRole('button', { name: 'OFF', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await pop.getByRole('button', { name: '저장', exact: true }).click()
  await expect(cell).toHaveText('D')
  // 다른 스펙(생성)에 영향을 주지 않게 지운다
  await cell.click()
  await admin.getByRole('dialog').getByRole('button', { name: '삭제' }).click()
  // 내 행의 빈 칸은 + 자리 표시
  await expect(cell).toHaveText('+')
  await admin.close()
})
