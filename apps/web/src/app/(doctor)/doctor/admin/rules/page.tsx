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
      <DoctorRulesForm key={version} params={params} version={version} />
    </div>
  )
}
