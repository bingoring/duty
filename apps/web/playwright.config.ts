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
    {
      name: 'chromium',
      testIgnore: 'cycle/**',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    // 2-9 한 달 흐름: 다른 스펙이 모두 끝난 뒤 DB를 시드 상태로 되돌리고 돈다(11월을 확정·마감하므로)
    { name: 'cycle-reset', testMatch: 'cycle/reset.setup.ts', dependencies: ['chromium'] },
    {
      name: 'cycle',
      testMatch: 'cycle/**/*.spec.ts',
      dependencies: ['cycle-reset'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: [
    {
      // E2E 전용 솔버 (개발 8100·통합 테스트 8101과 따로)
      command: 'uv run uvicorn solver.app:app --host 127.0.0.1 --port 8102',
      cwd: '../../services/solver',
      url: 'http://127.0.0.1:8102/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `next dev --port ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // 날짜에 따라 달라지는 화면(오늘 열·기본 달·잔여 카드)을 고정한다
      env: {
        DATABASE_URL: E2E_DB,
        DUTY_FAKE_TODAY: E2E_TODAY,
        SOLVER_URL: 'http://127.0.0.1:8102',
        SOLVER_TIME_LIMIT_SEC: '4',
      },
    },
  ],
})
