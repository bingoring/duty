import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 신청 액션은 각자 세션을 확인한다. 권한(본인·관리자)은 service가 actor로 판단한다
describe('신청 서버 액션 가드', () => {
  const src = readFileSync(fileURLToPath(new URL('./actions.ts', import.meta.url)), 'utf8')
  const chunks = src.split('export async function ').slice(1)
  const names = chunks.map((c) => c.slice(0, c.indexOf('(')))

  it('액션 6개', () => {
    expect(names).toEqual([
      'saveShiftRequestAction',
      'deleteShiftRequestAction',
      'saveLeaveAction',
      'cancelLeaveAction',
      'submitRequestsAction',
      'decideLeaveAction',
    ])
  })

  it('모든 액션은 다른 어떤 await보다 먼저 세션을 확인하고, 없으면 바로 거부한다', () => {
    for (const [i, c] of chunks.entries()) {
      const guard = c.indexOf('const actor = await sessionActor()')
      expect(guard, names[i]).toBeGreaterThan(-1)
      expect(c.indexOf('await '), names[i]).toBe(guard + 'const actor = '.length)
      expect(c.indexOf('if (!actor) return DENIED'), names[i]).toBeGreaterThan(guard)
    }
  })
})
