// 운영 최초 부팅 (R-BOOT-1·2). 임시 비밀번호는 표준 출력에 한 번만 보여 주고 저장하지 않는다.
import { EmployeeNoSchema } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../auth/password'
import { generateTempPassword } from '../auth/tokens'
import { createDb, type Db } from '../db/client'
import { credentials, users } from '../db/schema'
import { ensureBase, isMain } from './core'

export type BootstrapResult = { created: true; tempPassword: string } | { created: false }

export async function bootstrap(
  db: Db,
  admin: { employeeNo: string; name: string },
): Promise<BootstrapResult> {
  const employeeNo = EmployeeNoSchema.parse(admin.employeeNo)
  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)
  return db.transaction(async (tx) => {
    const wardId = await ensureBase(tx)
    const existing = await tx.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1)
    if (existing.length > 0) return { created: false } as const
    const [user] = await tx
      .insert(users)
      .values({
        wardId,
        employeeNo,
        name: admin.name.trim(),
        role: 'admin',
        rotation: 'fixed_weekday',
        seniorityRank: 1,
        seniorityTier: 'senior',
      })
      .returning({ id: users.id })
    await tx.insert(credentials).values({ userId: user!.id, passwordHash, mustChangePassword: true })
    return { created: true, tempPassword } as const
  })
}

if (isMain(import.meta.url)) {
  const url = process.env.DATABASE_URL
  const employeeNo = process.env.ADMIN_EMPLOYEE_NO
  const name = process.env.ADMIN_NAME
  if (!url || !employeeNo || !name) {
    console.error('필요한 환경변수: DATABASE_URL, ADMIN_EMPLOYEE_NO, ADMIN_NAME')
    process.exit(1)
  }
  const { db, close } = createDb(url)
  const r = await bootstrap(db, { employeeNo, name })
  await close()
  if (r.created) {
    console.log(`관리자 계정을 만들었습니다. 사번 ${employeeNo} / 임시 비밀번호 ${r.tempPassword}`)
    console.log('이 비밀번호는 다시 표시되지 않습니다. 첫 로그인 때 새 비밀번호로 바꾸게 됩니다.')
  } else {
    console.log('관리자가 이미 있어 계정을 만들지 않았습니다. (병동·규칙·공휴일은 확인 완료)')
  }
}
