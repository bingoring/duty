import { existsSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { and, eq } from 'drizzle-orm'
import { adjustCheckInput } from '../../src/server/adjust/service'
import { createDb } from '../../src/server/db/client'
import { monthPlans, users } from '../../src/server/db/schema'
import { ADMIN, DEV_PASSWORD, NURSE, login, loginAndWait, waitHydrated } from '../fixtures'
import { findSwapPair, mdOf } from '../search'

// 3-12 모바일 2차: 신청 달력·시트(데스크톱 팝오버 재사용)·그날 동료 신청, 교환 요청, 의사 화면 배치 (오늘 10/13 고정 → 11월 신청 중)
if (existsSync('.env')) process.loadEnvFile('.env')
const url = process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e'
const DOCTOR = '820303'

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('간호사 신청: 날짜 시트에서 임시 저장 → 달력 칩 → 삭제, 그날 동료 신청 목록', async ({ page }) => {
  await loginAndWait(page, NURSE.employeeNo)
  await page.goto('/requests?ym=2026-11')
  await waitHydrated(page)
  await expect(page.getByRole('heading', { name: '11월 근무 신청' })).toBeVisible()
  await expect(page.getByRole('button', { name: '신청 제출' })).toBeVisible()
  await noHorizontalOverflow(page)
  const cal = page.getByRole('group', { name: '11월 신청 달력' })
  await cal.getByRole('button', { name: /^20일/ }).click()
  const sheet = page.getByRole('dialog', { name: '11/20 (금) 신청' })
  await expect(sheet.getByRole('region', { name: '이 날 신청한 동료' })).toBeVisible()
  await sheet.getByRole('button', { name: 'OFF', exact: true }).click()
  await sheet.getByRole('button', { name: 'E', exact: true }).click()
  await sheet.getByRole('button', { name: '임시 저장' }).click()
  await expect(sheet).toBeHidden()
  await expect(cal.getByRole('button', { name: '20일 O/E' })).toBeVisible()
  await cal.getByRole('button', { name: '20일 O/E' }).click()
  await page.getByRole('dialog', { name: '11/20 (금) 신청' }).getByRole('button', { name: '삭제' }).click()
  await expect(cal.getByRole('button', { name: '20일', exact: true })).toBeVisible()
})

test('수간호사 신청 탭은 보기 전용: 근무 선택 없이 그날 신청 목록', async ({ page }) => {
  await loginAndWait(page, ADMIN.employeeNo)
  await page.goto('/requests?ym=2026-11')
  await waitHydrated(page)
  await expect(page.getByText('대신 신청은 PC에서')).toBeVisible()
  await page.getByRole('group', { name: '11월 신청 달력' }).getByRole('button', { name: /^13일/ }).click()
  const sheet = page.getByRole('dialog', { name: '11/13 (금) 신청' })
  await expect(sheet.getByRole('region', { name: '이 날 신청한 동료' })).toContainText('이 날 신청한 사람')
  await expect(sheet.getByRole('button', { name: 'OFF', exact: true })).toHaveCount(0)
  await sheet.getByRole('button', { name: '닫기' }).last().click()
  await expect(sheet).toBeHidden()
})

test('간호사 교환: 날짜 → 동료 고르기 → 재배정 창 → 요청 보내기 → 보낸 요청 철회', async ({ page }) => {
  test.setTimeout(120_000)
  const { db, close } = createDb(url)
  const [oct] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, 2026), eq(monthPlans.month, 10)))
  const orig = { negotiationStart: oct!.negotiationStart, negotiationEnd: oct!.negotiationEnd }
  await db
    .update(monthPlans)
    .set({ negotiationStart: '2026-10-10', negotiationEnd: '2026-10-20' })
    .where(eq(monthPlans.id, oct!.id))
  const people = await db.select({ id: users.id, no: users.employeeNo, name: users.name }).from(users)
  const byId = new Map(people.filter((p) => p.no !== '00101').map((p) => [p.id, p]))
  const pair = findSwapPair(await adjustCheckInput(db, oct!), [...byId.keys()], '2026-10-14')
  const A = byId.get(pair.a)!
  const B = byId.get(pair.b)!
  try {
    await loginAndWait(page, A.no)
    await page.goto('/adjust?ym=2026-10')
    await waitHydrated(page)
    await expect(page.getByRole('heading', { name: '10월 근무 교환' })).toBeVisible()
    await noHorizontalOverflow(page)
    await page.getByRole('button', { name: '＋ 교환 요청' }).click()
    const sheet = page.getByRole('dialog', { name: '교환 요청' })
    await sheet.getByRole('button', { name: `${Number(pair.date.slice(8))}일`, exact: true }).click()
    await sheet.getByRole('button', { name: B.name, exact: true }).click()
    await sheet.getByRole('button', { name: '다음' }).click()
    const pop = sheet.getByRole('dialog', { name: `${mdOf(pair.date)} 근무 재배정` })
    await expect(pop.getByText('규칙 검사 통과')).toBeVisible()
    await pop.getByRole('button', { name: '요청 보내기' }).click()
    await expect(page.getByRole('status')).toContainText(`${B.name}에게 교환을 요청했습니다`)
    const sent = page.getByRole('region', { name: '보낸 요청' })
    await expect(sent).toContainText('대기')
    await sent.getByRole('button', { name: '철회' }).click()
    await expect(page.getByRole('status')).toHaveText('요청을 철회했습니다.')
  } finally {
    await db.update(monthPlans).set(orig).where(eq(monthPlans.id, oct!.id))
    await close()
  }
})

test('의사 신청·교환: 휴대폰에서 한 열, 날짜를 누르면 신청 시트', async ({ page }) => {
  await login(page, DOCTOR, DEV_PASSWORD)
  await page.waitForURL('/doctor')
  await page.goto('/doctor/requests')
  await waitHydrated(page)
  await noHorizontalOverflow(page)
  await page.getByRole('button', { name: '20일', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: /신청$/ })
  for (const o of ['D', 'N', 'O'])
    await expect(sheet.getByRole('button', { name: o, exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: '완료' }).click()
  await expect(sheet).toBeHidden()
  await page.goto('/doctor/adjust')
  await waitHydrated(page)
  await noHorizontalOverflow(page)
})

test('의사 관리자: 휴대폰에서는 대신 신청 없이 자기 신청만(다른 의사는 보기 전용)', async ({ page }) => {
  const { db, close } = createDb(url)
  const [go] = await db.select({ id: users.id }).from(users).where(eq(users.employeeNo, '810202'))
  await close()
  await login(page, '800101', DEV_PASSWORD)
  await page.waitForURL('/doctor')
  // 신청 가능 여부는 앞선 스펙(11월 생성·확정)에 따라 달라지므로 보지 않는다. 대신 신청 막기만 확인한다
  await page.goto('/doctor/requests')
  await waitHydrated(page)
  await expect(page.getByLabel('의사 선택')).toHaveCount(0)
  await expect(page.getByText('대신 신청은 PC에서')).toHaveCount(0)
  // 주소로 다른 의사를 열면 보기 전용 안내, 신청 버튼은 막힌다
  await page.goto(`/doctor/requests?user=${go!.id}`)
  await waitHydrated(page)
  await expect(page.getByText('대신 신청은 PC에서')).toBeVisible()
  await page.getByRole('button', { name: '20일', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: /신청$/ }).getByRole('button', { name: 'D', exact: true }),
  ).toBeDisabled()
})
