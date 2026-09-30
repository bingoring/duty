import { AdjustScreen } from '@/components/adjust/AdjustScreen'
import { loadAdjustView } from '@/server/adjust/view'
import { requireUser } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { appToday, parseYm } from '@/server/schedule/month'

// S9 근무 조정 (Build Spec 2-7: 관리자 1j 편집·월 마감 / 간호사 읽기 전용, 교환 요청은 2-8). 기본 달 = 이번 달
export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[]; focus?: string | string[]; shift?: string | string[] }>
}) {
  const session = await requireUser()
  const today = appToday()
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
  const focusDate = one(sp.focus)
  const shift = one(sp.shift)
  const view = await loadAdjustView(getDb(), {
    ym: parseYm(sp.ym, today),
    viewer: { id: session.user.id, role: session.user.role === 'admin' ? 'admin' : 'nurse' },
    today,
    ...(focusDate ? { focus: { date: focusDate, ...(shift ? { shift } : {}) } } : {}),
  })
  return <AdjustScreen key={view.ym} view={view} />
}
