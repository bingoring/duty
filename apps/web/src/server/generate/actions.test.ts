import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Build Spec 2-6 R-GEN-1: 생성·확정 액션은 다른 어떤 await보다 먼저 관리자를 확인한다
describe('듀티 생성 서버 액션 가드', () => {
  const src = readFileSync(fileURLToPath(new URL('./actions.ts', import.meta.url)), 'utf8')
  const chunks = src.split('export async function ').slice(1)
  const names = chunks.map((c) => c.slice(0, c.indexOf('(')))

  it('액션이 4개 있다(3-8 확정 철회 미리보기·철회 포함)', () => {
    expect(names).toEqual([
      'generateAction',
      'confirmCandidateAction',
      'revokePreviewAction',
      'revokeConfirmationAction',
    ])
  })

  it('첫 await가 adminOnly이고, 아니면 바로 거부한다', () => {
    for (const [i, c] of chunks.entries()) {
      const guard = c.indexOf('const admin = await adminOnly()')
      expect(guard, names[i]).toBeGreaterThan(-1)
      expect(c.indexOf('await '), names[i]).toBe(guard + 'const admin = '.length)
      expect(c.indexOf('if (!admin) return DENIED'), names[i]).toBeGreaterThan(guard)
    }
  })
})
