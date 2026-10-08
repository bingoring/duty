import { requireAdmin } from '@/server/auth/guards'
import { HolidaySection } from '@/components/admin/HolidaySection'
import { RulesForm } from '@/components/admin/RulesForm'
import { getDb } from '@/server/db/client'
import { listHolidays } from '@/server/holidays/service'
import { loadRuleEditor } from '@/server/rules/service'
import { requestToday } from '@/server/clock'

// S11 관리자 · 규칙 설정 + 공휴일·병원 지정일 (Build Spec 2-4)
export default async function RulesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  // 레이아웃 가드는 부분 렌더(RSC 탐색)에서 다시 돌지 않으므로 페이지마다 확인한다(R-1)
  await requireAdmin()
  const db = getDb()
  const today = await requestToday()
  const thisYear = Number(today.slice(0, 4))
  const asked = Number((await searchParams).year)
  const year = asked >= 2000 && asked <= 2100 ? asked : thisYear
  const [editor, holidays] = await Promise.all([loadRuleEditor(db, today), listHolidays(db, year)])
  return (
    <div className="flex min-w-0 flex-col gap-5 px-7 py-6">
      {/* 저장 뒤 refresh()로 editor가 새 버전이 되어도 폼 상태(완료 문구)는 유지한다. 비교 기준은 props에서 읽는다 */}
      <RulesForm editor={editor} />
      <HolidaySection
        year={year}
        years={[thisYear - 1, thisYear, thisYear + 1]}
        items={holidays}
        apiEnabled={!!process.env.HOLIDAY_API_KEY}
      />
    </div>
  )
}
