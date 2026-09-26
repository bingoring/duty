import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

if (existsSync('.env')) process.loadEnvFile('.env')
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://duty:duty@localhost:5433/duty_e2e'
const PORT = 3100
export const E2E_TODAY = '2026-10-13'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 720 }, locale: 'ko-KR' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command: `next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // 날짜에 따라 달라지는 화면(오늘 열·기본 달·잔여 카드)을 고정한다
    env: { DATABASE_URL: E2E_DB, DUTY_FAKE_TODAY: E2E_TODAY },
  },
})
