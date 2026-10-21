import { DoctorRulesForm } from '@/components/doctor/DoctorRulesForm'
import { requireDoctorAdmin } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { currentDoctorRules } from '@/server/doctor/core'

// 3-7a 의사 규칙 설정 (간호사 규칙 버전과 따로)
export default async function DoctorRulesSettingsPage() {
  await requireDoctorAdmin()
  const { version, params } = await currentDoctorRules(getDb())
  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">규칙 설정 · 의사</h1>
      {/* key를 버전으로 두면 저장 뒤 새로고침에 폼이 다시 만들어져 「저장했습니다」가 바로 사라진다(3-11) */}
      <DoctorRulesForm params={params} version={version} />
    </div>
  )
}
