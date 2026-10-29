import { PcOnlyList } from '@/components/mobile/PcOnly'
import { requireDoctorAdmin } from '@/server/auth/guards'

// 3-12 모바일 「관리」 탭(의사 관리자). 급한 변경은 3차 PR, 지금은 PC 안내 목록만
export default async function DoctorManagePage() {
  await requireDoctorAdmin()
  return (
    <div className="flex flex-col gap-2 px-4 pt-3.5">
      <h1 className="text-[19px] font-bold tracking-[-0.02em]">관리</h1>
      <div className="mt-1 text-xs text-ink-2">PC에서 이용해 주세요</div>
      <PcOnlyList group="doctor" />
    </div>
  )
}
