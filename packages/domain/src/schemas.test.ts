import { describe, expect, it } from 'vitest'
import { CellSchema, EmployeeNoSchema, ShiftRequestInputSchema } from './index'

describe('EmployeeNoSchema', () => {
  it('앞뒤 공백을 제거하고 앞자리 0을 보존한다', () => {
    expect(EmployeeNoSchema.parse('  00101 ')).toBe('00101')
  })
  it('빈 값과 20자 초과를 거부한다', () => {
    expect(EmployeeNoSchema.safeParse('   ').success).toBe(false)
    expect(EmployeeNoSchema.safeParse('1'.repeat(21)).success).toBe(false)
  })
})

describe('CellSchema', () => {
  const base = { code: 'D', checkupHalf: false, source: 'auto' } as const
  it('근무 칸은 offKind·leaveKind 없이 통과한다', () => {
    expect(CellSchema.safeParse(base).success).toBe(true)
  })
  it('OFF 칸은 offKind가 필수다', () => {
    expect(CellSchema.safeParse({ ...base, code: 'OFF' }).success).toBe(false)
    expect(CellSchema.safeParse({ ...base, code: 'OFF', offKind: 'sleeping' }).success).toBe(true)
  })
  it('LEAVE 칸은 leaveKind가 필수다', () => {
    expect(CellSchema.safeParse({ ...base, code: 'LEAVE' }).success).toBe(false)
    expect(CellSchema.safeParse({ ...base, code: 'LEAVE', leaveKind: 'sick' }).success).toBe(true)
  })
  it('OFF가 아닌 칸에 offKind가 있으면 거부한다', () => {
    expect(CellSchema.safeParse({ ...base, offKind: 'regular' }).success).toBe(false)
  })
  it('LEAVE가 아닌 칸에 leaveKind가 있으면 거부한다', () => {
    expect(
      CellSchema.safeParse({ ...base, code: 'OFF', offKind: 'regular', leaveKind: 'sick' }).success,
    ).toBe(false)
  })
  it('허용되지 않은 코드와 출처를 거부한다', () => {
    expect(CellSchema.safeParse({ ...base, code: 'X' }).success).toBe(false)
    expect(CellSchema.safeParse({ ...base, source: 'manual' }).success).toBe(false)
  })
})

describe('ShiftRequestInputSchema', () => {
  it('복수 옵션(or 조건)을 허용한다', () => {
    expect(ShiftRequestInputSchema.safeParse({ options: ['OFF', 'D'] }).success).toBe(true)
  })
  it('특수 신청만 단독으로 허용한다', () => {
    expect(ShiftRequestInputSchema.safeParse({ options: [], special: 'AL' }).success).toBe(true)
  })
  it('옵션과 특수 신청을 동시에 채우면 거부한다', () => {
    expect(ShiftRequestInputSchema.safeParse({ options: ['OFF'], special: 'AL' }).success).toBe(false)
  })
  it('둘 다 비어 있으면 거부한다', () => {
    expect(ShiftRequestInputSchema.safeParse({ options: [] }).success).toBe(false)
  })
  it('중복 옵션을 거부한다', () => {
    expect(ShiftRequestInputSchema.safeParse({ options: ['OFF', 'OFF'] }).success).toBe(false)
  })
  it('코멘트는 500자까지다', () => {
    expect(ShiftRequestInputSchema.safeParse({ options: ['D'], comment: 'a'.repeat(500) }).success).toBe(true)
    expect(ShiftRequestInputSchema.safeParse({ options: ['D'], comment: 'a'.repeat(501) }).success).toBe(
      false,
    )
  })
})
