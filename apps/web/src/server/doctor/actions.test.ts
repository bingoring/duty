import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 3-7a: 관리자 = 같은 직군의 관리자만. 의사 액션은 첫 await에서 의사(·의사 관리자)를 확인한다
describe('의사 서버 액션 가드', () => {
  const src = readFileSync(fileURLToPath(new URL('./actions.ts', import.meta.url)), 'utf8')
  const chunks = src.split('export async function ').slice(1)
  const names = chunks.map((c) => c.slice(0, c.indexOf('(')))
  const ADMIN = new Set([
    'generateDoctorAction',
    'confirmDoctorAction',
    'setDoctorExtrasAction',
    'adminEditDoctorShiftAction',
    'createDoctorAction',
    'changeDoctorLoginIdAction',
    'setDoctorRoleAction',
    'reissueDoctorPasswordAction',
    'removeDoctorAction',
    'saveDoctorRulesAction',
  ])

  it('직군 확인은 의사 세션으로만 한다', () => {
    expect(src).toContain("groupSession('doctor')")
    expect(src).not.toContain('getSession(')
  })

  it.each(names.map((n, i) => [n, chunks[i]!]))(
    '%s: 첫 await가 가드이고, 아니면 바로 거부한다',
    (name, c) => {
      const guard = ADMIN.has(name) ? 'const a = await doctorAdmin()' : 'const a = await doctor()'
      const at = c.indexOf(guard)
      expect(at, name).toBeGreaterThan(-1)
      expect(c.indexOf('await '), name).toBe(at + 'const a = '.length)
      expect(c.indexOf('if (!a) return DENIED'), name).toBeGreaterThan(at)
    },
  )

  it('관리자 액션 목록이 실제 액션과 맞는다', () => {
    for (const n of ADMIN) expect(names).toContain(n)
  })
})

describe('간호사 서버 액션은 간호사 세션만', () => {
  const server = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const files = readdirSync(server, { recursive: true })
    .map(String)
    .filter(
      (f) =>
        f.endsWith('actions.ts') &&
        !f.startsWith('doctor') &&
        !f.startsWith('auth') &&
        !f.startsWith('privacy'),
    )
  it.each(files)('%s', (rel) => {
    const src = readFileSync(path.join(server, rel), 'utf8')
    expect(src).not.toContain('getSession(')
    expect(src).toContain("groupSession('nurse')")
  })
})
