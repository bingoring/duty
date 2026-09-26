// 개발용 시드 (R-SEED-1~4). 이름·사번은 가명이다 — 실명은 절대 넣지 않는다(공개 저장소).
// 연차 구분·K-tass·노조 구성은 요구사항 원문 「응급실 근무자」와 같다.
import { credentials, users } from '../db/schema'
import { hashPassword } from '../auth/password'
import { createDb, type Db } from '../db/client'
import { ensureBase, isMain } from './core'
import { seedPaperSchedule } from './dev-schedule'
import type { RosterRow } from './roster'

export const DEV_PASSWORD = 'duty-dev-1234'

const row = (
  employeeNo: string,
  name: string,
  seniorityRank: number,
  seniorityTier: RosterRow['seniorityTier'],
  kTass: boolean,
  unionMember: boolean,
): RosterRow => ({
  employeeNo,
  name,
  role: seniorityRank === 1 ? 'admin' : 'nurse',
  rotation: seniorityRank === 1 ? 'fixed_weekday' : 'rotating',
  seniorityRank,
  seniorityTier,
  hireDate: null,
  kTass,
  unionMember,
})

export const DEV_ROSTER: RosterRow[] = [
  row('00101', '한수정', 1, 'senior', true, true),
  row('00102', '박서연', 2, 'senior', true, true),
  row('00103', '정하늘', 3, 'senior', true, true),
  row('00104', '오민지', 4, 'senior', true, true),
  row('00105', '강도윤', 5, 'senior', false, false),
  row('00106', '윤채원', 6, 'senior', true, false),
  row('00107', '임소라', 7, 'mid', true, false),
  row('00108', '배지현', 8, 'mid', true, false),
  row('00109', '서예린', 9, 'junior', false, false),
  row('00110', '홍다은', 10, 'junior', false, false),
  row('00111', '문가을', 11, 'junior', false, false),
]

export async function seedDev(db: Db): Promise<void> {
  const passwordHash = await hashPassword(DEV_PASSWORD)
  await db.transaction(async (tx) => {
    const wardId = await ensureBase(tx)
    for (const u of DEV_ROSTER) {
      const [inserted] = await tx
        .insert(users)
        .values({ ...u, wardId })
        .onConflictDoNothing({ target: users.employeeNo })
        .returning({ id: users.id })
      if (inserted) {
        await tx.insert(credentials).values({ userId: inserted.id, passwordHash, mustChangePassword: false })
      }
    }
    await seedPaperSchedule(tx, wardId)
  })
}

if (isMain(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') {
    console.error('db:seed는 개발 전용입니다. 운영에서는 db:bootstrap과 db:import-roster를 사용하세요.')
    process.exit(1)
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다')
  const { db, close } = createDb(url)
  await seedDev(db)
  await close()
  console.log(`개발 시드 완료 — 가명 ${DEV_ROSTER.length}명, 비밀번호 ${DEV_PASSWORD}`)
}
