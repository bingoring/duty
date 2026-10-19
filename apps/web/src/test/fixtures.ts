import { hashPassword } from '../server/auth/password'
import { DEFAULT_RULES } from '@duty/domain'
import { credentials, ruleVersions, users, wards } from '../server/db/schema'
import type { Db } from '../server/db/client'

export async function createWard(db: Db) {
  const [ward] = await db.insert(wards).values({ code: 'ER', name: '응급실' }).returning()
  return ward!
}

export async function createUserWithPassword(
  db: Db,
  wardId: string,
  opts: {
    employeeNo?: string
    password?: string
    role?: 'nurse' | 'admin'
    mustChange?: boolean
    active?: boolean
  } = {},
) {
  const [user] = await db
    .insert(users)
    .values({
      wardId,
      employeeNo: opts.employeeNo ?? '00103',
      name: '정하늘',
      role: opts.role ?? 'nurse',
      seniorityRank: 3,
      seniorityTier: 'senior',
      active: opts.active ?? true,
    })
    .returning()
  await db.insert(credentials).values({
    userId: user!.id,
    passwordHash: await hashPassword(opts.password ?? 'right-password'),
    mustChangePassword: opts.mustChange ?? false,
  })
  return user!
}

// 3-9: 「듀티당 최대 인원」과 「누적 OFF 범위」가 둘 다 필수면 시드(교대 10명)의 11월을 만들 수 없다.
// 생성 흐름을 보는 테스트는 두 규칙을 풀어 둔다(두 규칙 자체는 domain·solver 테스트가 본다)
export async function relaxCarryStaff(db: Db) {
  const [ward] = await db.select().from(wards).limit(1)
  const n = await db.$count(ruleVersions)
  await db.insert(ruleVersions).values({
    wardId: ward!.id,
    version: n + 1,
    params: { ...DEFAULT_RULES.params, maxStaffPerShift: 10, offCarryMin: -31, offCarryMax: 31 },
    toggles: DEFAULT_RULES.toggles,
    forbiddenPatterns: [...DEFAULT_RULES.forbiddenPatterns],
    severity: DEFAULT_RULES.severity,
  })
}
