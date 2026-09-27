import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { serializeSchema } from './schema'

describe('solver.schema.json', () => {
  it('커밋된 JSON Schema가 zod 계약과 같다 (다르면 pnpm --filter @duty/contract gen)', () => {
    const committed = readFileSync(new URL('../solver.schema.json', import.meta.url), 'utf8')
    expect(committed).toBe(serializeSchema())
  })
})
