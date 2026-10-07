import { test } from '@playwright/test'
import { resetE2eDb } from '../global-setup'

// 한 달 흐름은 다른 스펙이 남긴 상태(예: 2-6 E2E가 11월보다 먼저 확정한 12월)에 기대지 않고 시드 상태에서 시작한다
test('E2E DB를 시드 상태로 되돌린다', async () => {
  await resetE2eDb()
})
