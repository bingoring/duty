import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { createDb } from '../src/server/db/client'
import { and, eq } from 'drizzle-orm'
import { monthPlans } from '../src/server/db/schema'
import { ensureWard } from '../src/server/seed/core'
import { ADMIN, loginAndWait, waitHydrated } from './fixtures'

// 다른 스펙이 누적 OFF를 확인하지 않는 사람(가명). 종이 10월 10/16 E → 10/17(토) off
const HONG = { employeeNo: '00110', name: '홍다은' }

// Build Spec 2-7 §4 E2E. 오늘은 2026-10-13 고정 → 10월은 확정된 달(종이 10월, 가명), 아직 끝나지 않아 마감할 수 없다.
// 월 마감 흐름은 끝난 달(2026-08)의 빈 확정 계획을 만들어 확인한다
if (existsSync('.env')) process.loadEnvFile('.env')

test('관리자 칸 편집: 필수 위반 차단 → 사유 입력 후 적용 → 저장 · 재배포 → 파란 외곽선 · 간호사 근무표 안내 → 확인', async ({
  page,
  browser,
}) => {
  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto('/adjust?ym=2026-10')
  await waitHydrated(page)
  await expect(page.getByRole('heading', { name: '2026년 10월 · 근무 조정' })).toBeVisible()
  await expect(page.getByText('변경 0건 미저장')).toBeVisible()

  // 홍다은 10/16 E → 10/17 off를 D로: E-D 금지 패턴
  await page.getByRole('button', { name: `${HONG.name} 2026-10-17` }).click()
  const pop = page.getByRole('dialog', { name: `${HONG.name} 10/17 근무 편집` })
  await pop.getByRole('button', { name: 'D', exact: true }).click()
  await expect(pop.getByText('D로 변경 불가')).toBeVisible()
  await expect(pop.getByRole('button', { name: '적용', exact: true })).toHaveCount(0)
  await expect(pop.getByRole('button', { name: '그래도 적용' })).toBeDisabled()
  await pop.getByLabel('예외 사유').fill('당일 결원 교체')
  await pop.getByRole('button', { name: '그래도 적용' }).click()
  await expect(page.getByText('변경 1건 미저장')).toBeVisible()

  await page.getByRole('button', { name: '저장 · 재배포' }).click()
  await expect(page.getByRole('status')).toContainText('1건을 저장했습니다')
  await expect(page.getByRole('button', { name: `${HONG.name} 2026-10-17` })).toHaveAttribute(
    'title',
    /D.*관리자 수정/,
  )

  const me = await browser.newPage()
  await loginAndWait(me, HONG.employeeNo)
  const bar = me.getByRole('status', { name: '바뀐 근무' })
  await expect(bar).toContainText('내 근무가 바뀌었습니다')
  await expect(bar).toContainText('10/17 (토) off → D')
  await expect(bar).toContainText(ADMIN.name)
  await bar.getByRole('button', { name: '확인' }).click()
  await expect(bar).toHaveCount(0)
  await me.reload()
  await expect(me.getByRole('status', { name: '바뀐 근무' })).toHaveCount(0)

  // 간호사의 근무 조정 화면은 읽기 전용
  await me.goto('/adjust?ym=2026-10')
  await expect(me.getByText('근무 교환 요청 기능은 준비 중입니다')).toBeVisible()
  await expect(me.getByRole('button', { name: `${HONG.name} 2026-10-17` })).toHaveCount(0)
  await me.close()
})

test('월 마감 → 마감 배지·읽기 전용 → 마감 취소 (끝난 달)', async ({ page }) => {
  const { db, close } = createDb(
    process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e',
  )
  await db
    .insert(monthPlans)
    .values({
      wardId: await ensureWard(db),
      year: 2026,
      month: 8,
      status: 'CONFIRMED',
      requestDeadline: '2026-07-15',
      negotiationStart: '2026-07-16',
      negotiationEnd: '2026-07-20',
    })
    .onConflictDoNothing()
  await close()

  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto('/adjust?ym=2026-08')
  await waitHydrated(page)
  // 10월은 아직 끝나지 않았다
  await page.goto('/adjust?ym=2026-10')
  await waitHydrated(page)
  await expect(page.getByRole('button', { name: '월 마감' })).toBeDisabled()

  await page.goto('/adjust?ym=2026-08')
  await waitHydrated(page)
  await page.getByRole('button', { name: '월 마감' }).click()
  const dialog = page.getByRole('dialog', { name: '8월 마감' })
  await expect(dialog.getByRole('table', { name: '정산 미리보기' })).toBeVisible()
  await dialog.getByRole('button', { name: '마감', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('8월을 마감했습니다')
  await expect(page.getByText('마감한 달입니다. 마감 취소 후 수정하세요.')).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '마감 취소' }).click()
  await expect(page.getByRole('status')).toContainText('마감을 취소했습니다')
  await expect(page.getByRole('button', { name: '월 마감' })).toBeVisible()

  // 칸 없는 확정 계획은 뒤 달의 월초 투영을 바꾸므로(기준 OFF만큼 누적이 줄어듦) 다른 스펙을 위해 지운다
  const cleanup = createDb(process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e')
  await cleanup.db.delete(monthPlans).where(and(eq(monthPlans.year, 2026), eq(monthPlans.month, 8)))
  await cleanup.close()
})
