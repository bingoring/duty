import { describe, expect, it } from 'vitest'
import { dragOffset, dragOutcome } from './sheet-drag'

describe('3-12 바텀 시트 손잡이 끌기', () => {
  it('짧게 끌면 제자리', () => expect(dragOutcome({ dy: 40, velocity: 0.2, height: 600 })).toBe('stay'))
  it('120px 넘게 끌면 닫힘(높은 시트)', () =>
    expect(dragOutcome({ dy: 130, velocity: 0.1, height: 600 })).toBe('close'))
  it('낮은 시트는 높이 25%만 넘어도 닫힘', () =>
    expect(dragOutcome({ dy: 70, velocity: 0.1, height: 240 })).toBe('close'))
  it('빠르게 튕기면 짧아도 닫힘', () =>
    expect(dragOutcome({ dy: 30, velocity: 0.8, height: 600 })).toBe('close'))
  it('위로 튕기면 닫히지 않음', () => expect(dragOutcome({ dy: 0, velocity: -1, height: 600 })).toBe('stay'))
  it('위로는 움직이지 않음', () => {
    expect(dragOffset(-50)).toBe(0)
    expect(dragOffset(35)).toBe(35)
  })
})
