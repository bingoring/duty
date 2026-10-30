import { MobileManage } from '@/components/mobile/MobileManage'
import { requireAdmin } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { loadLeaveApprovals } from '@/server/requests/approvals'

// 3-12 모바일 「관리」 탭(간호사 관리자): 휴가 승인·처리 이력. 급한 변경은 근무표 「전체」 시트
export default async function ManagePage() {
  await requireAdmin()
  const { pending, history } = await loadLeaveApprovals(getDb())
  return <MobileManage pending={pending} history={history} />
}
