'use client'

import { ApprovalList } from '@/components/requests/Approvals'
import type { LeaveHistory, PendingLeave } from '@/server/requests/dto'
import { PcOnlyList } from './PcOnly'

// 3-12 모바일 「관리」 탭(간호사 관리자, 시안 design-mobile 5-admin 왼쪽): 휴가 승인·처리 이력 + PC 안내.
// 확정된 달에 인원이 모자라면 승인 뒤 근무표 「전체」의 그 날짜·근무 대체 지정 시트로 간다(이동 주소 함수를 넘기므로 클라이언트 컴포넌트)
const focusHref = (f: NonNullable<PendingLeave['focus']>) =>
  `/?ym=${f.ym}&tab=all&date=${f.date}&shift=${f.shift}`

export function MobileManage({ pending, history }: { pending: PendingLeave[]; history: LeaveHistory[] }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-3.5 text-[13px]">
      <h1 className="text-[19px] font-bold tracking-[-0.02em]">관리</h1>
      <h2 className="mt-1 text-xs font-bold text-ink-2">승인 대기 휴가 {pending.length}</h2>
      <ApprovalList pending={pending} history={history} focusHref={focusHref} />
      <p className="text-xs text-ink-2">급한 근무 변경은 근무표 「전체」에서 이름을 누르세요.</p>
      <h2 className="mt-2 text-xs font-bold text-ink-2">PC에서 이용해 주세요</h2>
      <PcOnlyList group="nurse" />
    </div>
  )
}
