import { hashPassword } from '../server/auth/password'
import { credentials, users, wards } from '../server/db/schema'
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
