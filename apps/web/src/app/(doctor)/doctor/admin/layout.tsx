import { PcOnly } from '@/components/mobile/PcOnly'
import { requireDoctorAdmin } from '@/server/auth/guards'
import { requestDevice } from '@/server/request-device'

// 3-12: 의사 듀티 생성·의사 관리·규칙 설정은 휴대폰에서 PC 안내(권한 판정은 각 페이지 가드가 한다)
export default async function DoctorAdminLayout({ children }: { children: React.ReactNode }) {
  await requireDoctorAdmin()
  if ((await requestDevice()) === 'mobile') return <PcOnly group="doctor" />
  return children
}
