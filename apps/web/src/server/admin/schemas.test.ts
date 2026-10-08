import { describe, expect, it } from 'vitest'
import { BalanceAdjustSchema } from './schemas'

describe('BalanceAdjustSchema', () => {
  const base = { userId: '00000000-0000-4000-8000-000000000000', note: '정정' }
  it('잔여 N은 0 이상의 정수만 (R-1)', () => {
    expect(BalanceAdjustSchema.safeParse({ ...base, values: { night_bank: 3 } }).success).toBe(true)
    expect(BalanceAdjustSchema.safeParse({ ...base, values: { night_bank: -1 } }).success).toBe(false)
    expect(BalanceAdjustSchema.safeParse({ ...base, values: { night_bank: 2.5 } }).success).toBe(false)
  })
  it('누적 OFF는 음수·0.5 단위를 그대로 받는다', () => {
    expect(BalanceAdjustSchema.safeParse({ ...base, values: { off_carry: -2.5 } }).success).toBe(true)
  })
})
