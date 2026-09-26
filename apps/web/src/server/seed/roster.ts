// 실제 명단 가져오기 (R-ROSTER-1~3). CSV 파일은 .local/(gitignore)에 둔다 — 공개 저장소에 커밋 금지.
import { EmployeeNoSchema, ROLES, ROTATIONS, SENIORITY_TIERS } from '@duty/domain'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { hashPassword } from '../auth/password'
import { generateTempPassword } from '../auth/tokens'
import type { Db } from '../db/client'
import { credentials, users, wards } from '../db/schema'
import { WARD } from '../ward'

export const ROSTER_HEADER = [
  'employee_no',
  'name',
  'role',
  'rotation',
  'seniority_rank',
  'seniority_tier',
  'hire_date',
  'k_tass',
  'union_member',
] as const

const bool = z.enum(['true', 'false']).transform((v) => v === 'true')
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, '존재하지 않는 날짜')

const RowSchema = z.object({
  employee_no: EmployeeNoSchema,
  name: z.string().trim().min(1).max(20),
  role: z.enum(ROLES),
  rotation: z.enum(ROTATIONS),
  seniority_rank: z.coerce.number().int().positive(),
  seniority_tier: z.enum(SENIORITY_TIERS),
  hire_date: z.union([z.literal('').transform(() => null), isoDate]),
  k_tass: bool,
  union_member: bool,
})

export type RosterRow = {
  employeeNo: string
  name: string
  role: (typeof ROLES)[number]
  rotation: (typeof ROTATIONS)[number]
  seniorityRank: number
  seniorityTier: (typeof SENIORITY_TIERS)[number]
  hireDate: string | null
  kTass: boolean
  unionMember: boolean
}

export type ParseResult = { ok: true; rows: RosterRow[] } | { ok: false; errors: string[] }

const unquote = (cell: string) => cell.trim().replace(/^"(.*)"$/, '$1')

export function parseRosterCsv(text: string): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const header = (lines[0] ?? '').split(',').map(unquote)
  if (header.join(',') !== ROSTER_HEADER.join(',')) {
    return {
      ok: false,
      errors: [`헤더가 다릅니다: "${header.join(',')}" (필요: "${ROSTER_HEADER.join(',')}")`],
    }
  }
  const errors: string[] = []
  const rows: RosterRow[] = []
  const seen = new Map<string, number>()
  lines.slice(1).forEach((line, i) => {
    const lineNo = i + 2
    if (line.trim() === '') return
    const cells = line.split(',').map(unquote)
    if (cells.length !== ROSTER_HEADER.length) {
      errors.push(`${lineNo}행: 열 개수가 ${cells.length}개입니다 (필요: ${ROSTER_HEADER.length}개)`)
      return
    }
    const parsed = RowSchema.safeParse(Object.fromEntries(ROSTER_HEADER.map((h, k) => [h, cells[k]])))
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        errors.push(`${lineNo}행: ${String(issue.path[0])} ${issue.message}`)
      return
    }
    const r = parsed.data
    const prev = seen.get(r.employee_no)
    if (prev !== undefined) {
      errors.push(`사번 ${r.employee_no}이 ${prev}행과 ${lineNo}행에 중복됩니다`)
      return
    }
    seen.set(r.employee_no, lineNo)
    rows.push({
      employeeNo: r.employee_no,
      name: r.name,
      role: r.role,
      rotation: r.rotation,
      seniorityRank: r.seniority_rank,
      seniorityTier: r.seniority_tier,
      hireDate: r.hire_date,
      kTass: r.k_tass,
      unionMember: r.union_member,
    })
  })
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows }
}

export type ImportResult = {
  created: { employeeNo: string; name: string; tempPassword: string }[]
  updated: number
}

export async function importRoster(db: Db, rows: RosterRow[]): Promise<ImportResult> {
  const prepared = await Promise.all(
    rows.map(async (r) => {
      const tempPassword = generateTempPassword()
      return { row: r, tempPassword, passwordHash: await hashPassword(tempPassword) }
    }),
  )
  return db.transaction(async (tx) => {
    const [ward] = await tx.select({ id: wards.id }).from(wards).where(eq(wards.code, WARD.code))
    if (!ward) throw new Error('병동이 없습니다. 먼저 db:bootstrap을 실행하세요.')
    const existing = new Set(
      (
        await tx
          .select({ no: users.employeeNo })
          .from(users)
          .where(
            inArray(
              users.employeeNo,
              rows.map((r) => r.employeeNo),
            ),
          )
      ).map((u) => u.no),
    )
    const result: ImportResult = { created: [], updated: 0 }
    for (const { row, tempPassword, passwordHash } of prepared) {
      if (existing.has(row.employeeNo)) {
        const { employeeNo, ...attrs } = row
        await tx
          .update(users)
          .set({ ...attrs, updatedAt: new Date() })
          .where(eq(users.employeeNo, employeeNo))
        result.updated++
      } else {
        const [user] = await tx
          .insert(users)
          .values({ ...row, wardId: ward.id })
          .returning({ id: users.id })
        await tx.insert(credentials).values({ userId: user!.id, passwordHash, mustChangePassword: true })
        result.created.push({ employeeNo: row.employeeNo, name: row.name, tempPassword })
      }
    }
    return result
  })
}
