import { requireAdmin } from '@/server/auth/guards'
import { GenerateScreen } from '@/components/generate/GenerateScreen'
import { getDb } from '@/server/db/client'
import { activeGenerationJob } from '@/server/generate/jobs'
import { defaultGenerateYm, loadGenerateView } from '@/server/generate/view'
import { parseYm } from '@/server/schedule/month'
import { requestToday } from '@/server/clock'

// S8 관리자 · 듀티 생성·리롤 (Build Spec 2-6, 핸드오프 1i)
export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[]; c?: string | string[] }>
}) {
  // 레이아웃 가드는 부분 렌더(RSC 탐색)에서 다시 돌지 않으므로 페이지마다 확인한다(R-1)
  await requireAdmin()
  const today = await requestToday()
  const sp = await searchParams
  const db = getDb()
  const ym = sp.ym ? parseYm(sp.ym, today) : await defaultGenerateYm(db, today)
  const c = typeof sp.c === 'string' ? sp.c : undefined
  const view = await loadGenerateView(db, { ym, today, ...(c ? { candidateId: c } : {}) })
  // 3-13: 진행 중인 생성 작업이 있으면 화면이 이어서 진행을 확인한다
  return <GenerateScreen view={view} initialJobId={await activeGenerationJob(db, ym)} />
}
