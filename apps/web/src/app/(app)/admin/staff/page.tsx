import { StaffManager } from '@/components/admin/StaffManager'
import { ensureYearStart } from '@/server/balances/year-start'
import { getDb } from '@/server/db/client'
import { getCurrentRules } from '@/server/rules'
import { appToday } from '@/server/schedule/month'
import { listStaff } from '@/server/staff/service'

// S10 관리자 · 간호사 관리 (Build Spec 2-4). 관리자 확인은 admin/layout과 각 액션에서 한다
export default async function StaffPage() {
  const db = getDb()
  const today = appToday()
  const [rows, rules, ys] = await Promise.all([
    listStaff(db, today),
    getCurrentRules(),
    ensureYearStart(db, today),
  ])
  const year = Number(today.slice(0, 4))
  const notice =
    ys === 'deferred' ? `${year - 1}년 12월을 마감하면 ${year}년 잔여치가 자동으로 시작됩니다.` : null
  const { trainingMonths, newbieTripleWeeks, experiencedTripleWeeks } = rules.params
  return (
    <StaffManager
      rows={rows}
      params={{ trainingMonths, newbieTripleWeeks, experiencedTripleWeeks }}
      notice={notice}
    />
  )
}
