import { existsSync } from 'node:fs'
import { DEFAULT_RULES } from '@duty/domain'
import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { createDb } from '../src/server/db/client'
import { shiftRequests, users } from '../src/server/db/schema'
import { ensureRequestPlan } from '../src/server/requests/plan'
import { ADMIN, NURSE, loginAndWait, waitHydrated } from './fixtures'

// Build Spec 2-6 §4 E2E. 오늘은 2026-10-13 고정 → 11월은 신청 중(마감 10/15).
// 생성·확정 흐름은 12월 계획을 신청 마감 상태로 미리 만들어 확인한다(전월 11월은 미확정 → 경계 경고)
if (existsSync('.env')) process.loadEnvFile('.env')
const e2eDb = () => createDb(process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e')

test.describe.configure({ timeout: 120_000 })

test('11월은 신청 마감 전이라 생성할 수 없다 (Q1)', async ({ page }) => {
  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto('/admin/generate?ym=2026-11')
  await waitHydrated(page)
  await expect(page.getByRole('heading', { name: '11월 듀티 생성' })).toBeVisible()
  await expect(page.getByRole('button', { name: '생성' })).toBeDisabled()
  await expect(page.getByText('10/15 신청 마감 뒤 생성할 수 있습니다.')).toBeVisible()
  await expect(page.getByText('금지 패턴 E-D · N-E · N-OFF-D · E-S 자동 차단')).toBeVisible()
})

test('12월: 생성 → 결과·요약·격자 → 리롤 → 이전 안 → 입력 변경 시 확정 차단 → 다시 생성 → 확정 → 근무표 공개', async ({
  page,
  browser,
}) => {
  const { db, close } = e2eDb()
  await ensureRequestPlan(db, { year: 2026, month: 12 }, '2026-11-16', DEFAULT_RULES)

  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto('/admin/generate?ym=2026-12')
  await waitHydrated(page)
  await expect(page.getByText('아직 생성한 안이 없습니다.')).toBeVisible()

  await page.getByRole('button', { name: '생성' }).click()
  const result = page.getByRole('region', { name: '생성 결과' })
  await expect(result.getByText('생성 결과 · 1번째 안')).toBeVisible({ timeout: 60_000 })
  await expect(result.getByText('필수 규칙 위반 0')).toBeVisible()
  await expect(result.getByText('모든 듀티 인원 2명 이상 · K-tass 1명 포함')).toBeVisible()
  await expect(result.getByText('전월 근무표가 확정되지 않아')).toBeVisible()
  const table = page.getByRole('table', { name: '간호사별 배정 요약' })
  await expect(table.getByRole('row')).toHaveCount(11) // 헤더 + 교대 근무자 10명
  await expect(page.getByRole('grid', { name: '2026년 12월 · 생성안' }).getByRole('row')).toHaveCount(11)

  await page.getByRole('button', { name: '↻ 리롤' }).click()
  await expect(result.getByText('생성 결과 · 2번째 안')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: '이전 안' }).click()
  await expect(result.getByText('생성 결과 · 1번째 안')).toBeVisible()

  // 관리자가 신청을 바꾸면(여기서는 DB에 제출된 신청 추가) 옛 안은 확정할 수 없다
  const [nurse] = await db.select().from(users).where(eq(users.employeeNo, NURSE.employeeNo))
  await db.insert(shiftRequests).values({
    userId: nurse!.id,
    year: 2026,
    month: 12,
    date: '2026-12-24',
    options: ['OFF'],
    submittedAt: new Date(),
  })
  await close()
  await page.reload()
  await waitHydrated(page)
  await expect(result.getByText('입력이 바뀜 · 다시 생성 필요')).toBeVisible()
  await expect(page.getByRole('button', { name: '이 안으로 확정' })).toBeDisabled()

  await page.getByRole('button', { name: '↻ 리롤' }).click()
  await expect(result.getByText('생성 결과 · 3번째 안')).toBeVisible({ timeout: 60_000 })
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '이 안으로 확정' }).click()
  await expect(page.getByRole('link', { name: '근무표 보기 →' })).toBeVisible()

  // 간호사 근무표(S3)에 공개, 신청 반영 칸은 빨간 외곽선(title '신청 반영')
  const me = await browser.newPage()
  await loginAndWait(me, NURSE.employeeNo)
  await me.goto('/?ym=2026-12')
  const row = me.getByRole('grid').getByRole('row', { name: NURSE.name })
  await expect(row.locator('[data-date="2026-12-24"]')).toHaveAttribute('title', /off.*신청 반영/)
  await me.close()
})
