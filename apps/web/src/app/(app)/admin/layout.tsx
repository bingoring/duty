import { PcOnly } from '@/components/mobile/PcOnly'
import { requireAdmin } from '@/server/auth/guards'
import { requestDevice } from '@/server/request-device'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  // 3-12: 듀티 생성·간호사 관리·규칙 설정은 휴대폰에서 PC 안내
  if ((await requestDevice()) === 'mobile') return <PcOnly group="nurse" />
  return children
}
