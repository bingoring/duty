import { DoctorRequestsScreen } from '@/components/doctor/DoctorRequestsScreen'
import { requireDoctor } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { loadDoctorRequests, type DoctorActor } from '@/server/doctor/requests'
import { parseYm, shiftYm, ymOf } from '@/server/schedule/month'
import { requestDevice } from '@/server/request-device'

type Sp = { ym?: string | string[]; user?: string | string[]; hl?: string | string[] }

// 3-7c S-D2 의사 근무 신청. 기본은 다음 달. 관리자는 ?user= 로 다른 의사의 신청을 대신 고친다
export default async function DoctorRequestsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const session = await requireDoctor()
  const today = await requestToday()
  const sp = await searchParams
  const ym = typeof sp.ym === 'string' ? parseYm(sp.ym, today) : shiftYm(parseYm(undefined, today), 1)
  const actor: DoctorActor = { id: session.user.id, role: session.user.role === 'admin' ? 'admin' : 'member' }
  const db = getDb()
  const wanted = actor.role === 'admin' && typeof sp.user === 'string' ? sp.user : actor.id
  let view = await loadDoctorRequests(db, { ...ym, actor, userId: wanted, today })
  // 없는 의사를 고르면 본인으로
  if (wanted !== actor.id && !view.people.some((p) => p.id === wanted))
    view = await loadDoctorRequests(db, { ...ym, actor, userId: actor.id, today })
  // 3-11 1: 강조(hl)는 의사 화면 사이를 따라다닌다
  const hl = typeof sp.hl === 'string' && view.people.some((p) => p.id === sp.hl) ? sp.hl : null
  return (
    <DoctorRequestsScreen
      key={`${view.userId}:${ymOf(ym)}`}
      view={view}
      today={today}
      admin={actor.role === 'admin'}
      mobile={(await requestDevice()) === 'mobile'}
      highlight={hl}
      prev={ymOf(shiftYm(ym, -1))}
      next={ymOf(shiftYm(ym, 1))}
    />
  )
}
