import { describe, expect, it } from 'vitest'
import { swapCodes } from './swap-codes'

const none = () => false
describe('교환 칩 맞바꾸기', () => {
  it('두 사람 맞바꾸기', () => expect(swapCodes(['N', 'E'], 0, 1, none)).toEqual(['E', 'N']))
  it('수간호사가 받은 OFF는 S, 교대 근무자가 받은 S는 OFF', () =>
    expect(swapCodes(['S', 'OFF'], 0, 1, (i) => i === 0)).toEqual(['S', 'OFF']))
  it('수간호사 D ↔ 교대 근무자 OFF', () =>
    expect(swapCodes(['D', 'OFF'], 0, 1, (i) => i === 0)).toEqual(['S', 'D']))
  it('수간호사가 E를 받으면 null', () => expect(swapCodes(['S', 'E'], 0, 1, (i) => i === 0)).toBeNull())
})
