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

// 2-11 R-ONB-1: 서버 액션도 남은 단계(동의·비밀번호·초기 설정)가 있으면 막는다 — 비밀번호 플래그만 보면 동의 전에 쓸 수 있다
describe('서버 액션 가드', () => {
  const server = path.join(import.meta.dirname, '..', 'server')
  const actions = readdirSync(server, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('actions.ts'))
  it.each(actions)('%s', (rel) => {
    const src = readFileSync(path.join(server, rel), 'utf8')
    expect(src).not.toMatch(/if \(!s \|\| s\.mustChangePassword\)|!s\.mustChangePassword/)
    if (/getSession\(\)/.test(src) && !rel.startsWith('auth') && !rel.startsWith('privacy'))
      expect(src).toMatch(/s\.pendingStep/)
  })
})
