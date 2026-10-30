import Link from 'next/link'
import { PcOnlyList } from '@/components/mobile/PcOnly'
import { requireDoctorAdmin } from '@/server/auth/guards'

// 3-12 모바일 「관리」 탭(의사 관리자): 급한 변경은 근무 조정(휴대폰은 칩 → 아래 시트), 나머지는 PC 안내
export default async function DoctorManagePage() {
  await requireDoctorAdmin()
  return (
    <div className="flex flex-col gap-2.5 px-4 pt-3.5 text-[13px]">
      <h1 className="text-[19px] font-bold tracking-[-0.02em]">관리</h1>
      <Link
        href="/doctor/adjust"
        className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-3 active:bg-panel"
      >
        <span>
          <b className="block text-[14px]">근무 바꾸기</b>
          <span className="text-xs text-ink-2">확정된 근무표의 칸을 눌러 급한 변경</span>
        </span>
        <span className="text-ink-3">›</span>
      </Link>
      <h2 className="mt-2 text-xs font-bold text-ink-2">PC에서 이용해 주세요</h2>
      <PcOnlyList group="doctor" adjustOnMobile />
    </div>
  )
}
