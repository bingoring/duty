import { existsSync } from 'node:fs'
import { DEFAULT_RULES } from '@duty/domain'
import { expect, test } from '@playwright/test'
import { createDb } from '../src/server/db/client'
import { ensureRequestPlan } from '../src/server/requests/plan'
import { ADMIN, loginAndWait, waitHydrated } from './fixtures'

// 3-13: 생성은 작업으로 돈다(Firebase 60초 제한 대비). 생성을 누른 뒤 화면을 새로 고쳐도 진행을 이어서 보여 주고 결과가 나온다.
// 다른 스펙과 겹치지 않게 2027년 1월(신청 마감 상태로 미리 만듦)
if (existsSync('.env')) process.loadEnvFile('.env')

test('생성 중에 새로 고쳐도 「생성 중…」이 이어지고 생성안이 나온다', async ({ page }) => {
  test.setTimeout(120_000)
  const { db, close } = createDb(process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e')
  await ensureRequestPlan(db, { year: 2027, month: 1 }, '2026-12-16', DEFAULT_RULES)
  await close()

  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto('/admin/generate?ym=2027-01')
  await waitHydrated(page)
  await page.getByRole('button', { name: '생성', exact: true }).click()
  await expect(page.getByRole('button', { name: '생성 중…' })).toBeVisible()
  await page.reload()
  await waitHydrated(page)
  await expect(page.getByRole('button', { name: '생성 중…' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: '생성 결과' }).getByText('생성 결과 · 1번째 안'),
  ).toBeVisible({ timeout: 90_000 })
})
