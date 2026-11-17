import { expect, test } from '@playwright/test'
import { NURSE, loginAndWait, waitHydrated } from './fixtures'

// 3-13: 로그인 쿠키를 __session으로 옮긴다(Firebase Hosting은 이 쿠키만 넘긴다). 옛 이름(duty_session)만 가진 사용자도
// 로그인이 유지되고, 페이지를 열면 새 쿠키로 바뀌며, 로그아웃하면 둘 다 지워진다
test('옛 쿠키만 있어도 로그인 유지 → 새 쿠키로 옮김 → 로그아웃하면 둘 다 없음', async ({
  page,
  context,
  baseURL,
}) => {
  await loginAndWait(page, NURSE.employeeNo)
  const fresh = (await context.cookies()).find((c) => c.name === '__session')
  expect(fresh).toBeTruthy()
  await context.clearCookies({ name: '__session' })
  await context.addCookies([{ ...fresh!, name: 'duty_session' }])

  await page.goto('/')
  await waitHydrated(page)
  await expect(page.getByText(NURSE.name).first()).toBeVisible()
  await expect.poll(async () => (await context.cookies()).some((c) => c.name === '__session')).toBe(true)
  expect((await context.cookies()).some((c) => c.name === 'duty_session')).toBe(false)

  await context.addCookies([
    { ...fresh!, name: 'duty_session', url: baseURL!, domain: undefined, path: undefined },
  ])
  await page.getByRole('button', { name: '로그아웃' }).click()
  await page.waitForURL(/\/login/)
  const names = (await context.cookies()).map((c) => c.name)
  expect(names).not.toContain('__session')
  expect(names).not.toContain('duty_session')
})
