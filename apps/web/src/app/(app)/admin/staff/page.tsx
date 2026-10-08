import { requireAdmin } from '@/server/auth/guards'
import { StaffManager } from '@/components/admin/StaffManager'
import { ensureYearStart } from '@/server/balances/year-start'
import { getDb } from '@/server/db/client'
import { getCurrentRules } from '@/server/rules'
import { listStaff } from '@/server/staff/service'
import { requestToday } from '@/server/clock'
import { pendingSubmissions } from '@/server/onboarding/service'
import { consentTimes } from '@/server/privacy/service'
import { todaySeoul } from '@/server/schedule/month'

// S10 관리자 · 간호사 관리 (Build Spec 2-4)
export default async function StaffPage() {
  // 레이아웃 가드는 부분 렌더(RSC 탐색)에서 다시 돌지 않으므로 페이지마다 확인한다(R-1)
  await requireAdmin()
  const db = getDb()
  const today = await requestToday()
  const [rows, rules, ys, subs, consent] = await Promise.all([
    listStaff(db, today),
    getCurrentRules(),
    ensureYearStart(db, today),
    pendingSubmissions(db),
    consentTimes(db),
  ])
  const md = (d: Date) =>
    todaySeoul(d)
      .slice(5)
      .replace(/^0?(\d+)-0?(\d+)$/, '$1/$2')
  const year = Number(today.slice(0, 4))
  const notice =
    ys === 'deferred' ? `${year - 1}년 12월을 마감하면 ${year}년 잔여치가 자동으로 시작됩니다.` : null
  const { trainingMonths, newbieTripleWeeks, experiencedTripleWeeks } = rules.params
  return (
    <StaffManager
      rows={rows}
      params={{ trainingMonths, newbieTripleWeeks, experiencedTripleWeeks }}
      notice={notice}
      submissions={subs.map(({ submittedAt, ...x }) => ({ ...x, at: md(submittedAt) }))}
      consents={Object.fromEntries([...consent].map(([id, at]) => [id, md(at)]))}
    />
  )
}
