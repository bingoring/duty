import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// R-1: 레이아웃 가드는 부분 렌더(RSC 탐색)에서 다시 돌지 않는다 → 로그인 뒤 페이지는 모두 스스로 가드를 부른다
const root = path.join(import.meta.dirname, '(app)')
const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f)
    return statSync(p).isDirectory() ? pages(p) : f === 'page.tsx' ? [p] : []
  })

describe('페이지 가드', () => {
  it.each(pages(root).map((p) => [path.relative(root, p), p]))('%s', (rel, p) => {
    const src = readFileSync(p, 'utf8')
    const guard = rel.startsWith('admin/') ? 'await requireAdmin()' : /await require(User|Admin)\(/
    if (typeof guard === 'string') expect(src).toContain(guard)
    else expect(src).toMatch(guard)
  })
})
