import { describe, expect, it } from 'vitest'
import { shiftTimesText } from './shift-times'

// 3-11 11: 간호사 근무 시간 안내는 SHIFT_TIMES에서 만든다
describe('shiftTimesText', () => {
  it('D·E·N·S 순서로', () => {
    expect(shiftTimesText()).toBe('D 07:00–15:30 · E 14:30–23:00 · N 22:30–07:30 · S 09:00–18:00')
  })
  it('상수를 바꾸면 따라 바뀐다', () => {
    expect(shiftTimesText({ D: { start: '08:00', end: '16:00' } })).toBe('D 08:00–16:00')
  })
})
