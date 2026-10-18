import { DoctorStaffScreen } from '@/components/doctor/DoctorStaffScreen'
import { requireDoctorAdmin } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { loadDoctorStaff } from '@/server/doctor/staff'

// 3-7a S-D3 의사 관리
export default async function DoctorStaffPage() {
  const s = await requireDoctorAdmin()
  const rows = await loadDoctorStaff(getDb())
  return <DoctorStaffScreen rows={rows} me={s.user.id} />
}
