import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Build Spec 2-8 §5 보안: 교환 요청 액션은 다른 어떤 await보다 먼저 세션을 확인한다
describe('교환 요청 서버 액션 가드', () => {
  const src = readFileSync(fileURLToPath(new URL('./actions.ts', import.meta.url)), 'utf8')
  const chunks = src.split('export async function ').slice(1)
  const names = chunks.map((c) => c.slice(0, c.indexOf('(')))
  it('액션 3개, 첫 await가 sessionActor이고 아니면 바로 거부', () => {
    expect(names).toEqual(['createSwapAction', 'respondSwapAction', 'cancelSwapAction'])
    for (const [i, c] of chunks.entries()) {
      const guard = c.indexOf('const actor = await sessionActor()')
      expect(guard, names[i]).toBeGreaterThan(-1)
      expect(c.indexOf('await '), names[i]).toBe(guard + 'const actor = '.length)
      expect(c.indexOf('if (!actor) return DENIED'), names[i]).toBeGreaterThan(guard)
    }
  })
})
