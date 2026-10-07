import { GenerateScreen } from '@/components/generate/GenerateScreen'
import { getDb } from '@/server/db/client'
import { defaultGenerateYm, loadGenerateView } from '@/server/generate/view'
import { parseYm } from '@/server/schedule/month'
import { requestToday } from '@/server/clock'

// S8 관리자 · 듀티 생성·리롤 (Build Spec 2-6, 핸드오프 1i). 관리자 가드는 admin/layout.tsx
export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[]; c?: string | string[] }>
}) {
  const today = await requestToday()
  const sp = await searchParams
  const db = getDb()
  const ym = sp.ym ? parseYm(sp.ym, today) : await defaultGenerateYm(db, today)
  const c = typeof sp.c === 'string' ? sp.c : undefined
  const view = await loadGenerateView(db, { ym, today, ...(c ? { candidateId: c } : {}) })
  return <GenerateScreen view={view} />
}
