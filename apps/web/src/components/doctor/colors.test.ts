import { describe, expect, it } from 'vitest'
import { DOCTOR_PALETTE, assignDoctorColors, colorOf } from './colors'

// 3-11 1: 의사별 고정 색
describe('assignDoctorColors', () => {
  it('표 순서대로 0부터, 재직 중인 의사가 먼저', () => {
    const m = assignDoctorColors([
      { id: 'a', active: true },
      { id: 'x', active: false },
      { id: 'b', active: true },
    ])
    expect(m).toEqual({ a: 0, b: 1, x: 2 })
  })

  it('팔레트보다 많으면 처음부터 다시 돈다', () => {
    const docs = Array.from({ length: DOCTOR_PALETTE.length + 2 }, (_, i) => ({ id: `d${i}` }))
    const m = assignDoctorColors(docs)
    expect(m[`d${DOCTOR_PALETTE.length}`]).toBe(0)
    expect(m[`d${DOCTOR_PALETTE.length + 1}`]).toBe(1)
  })

  it('같은 명단이면 화면마다 같은 색 · 모르는 의사는 회색', () => {
    const docs = [{ id: 'a' }, { id: 'b' }]
    expect(colorOf(assignDoctorColors(docs), 'b')).toBe(DOCTOR_PALETTE[1])
    expect(colorOf(assignDoctorColors(docs), 'zz').bg).toBe('bg-shift-off')
    expect(colorOf(undefined, null).bg).toBe('bg-shift-off')
  })
})
