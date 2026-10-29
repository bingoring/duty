import { AdjustScreen } from '@/components/adjust/AdjustScreen'
import { NurseAdjust } from '@/components/adjust/NurseAdjust'
import { defaultAdjustYm, loadAdjustView } from '@/server/adjust/view'
import { requireNurse } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { parseYm } from '@/server/schedule/month'
import { requestToday } from '@/server/clock'
import { PcOnly } from '@/components/mobile/PcOnly'
import { MobileSwap } from '@/components/mobile/MobileSwap'
import { requestDevice } from '@/server/request-device'

// S9 근무 조정 (Build Spec 2-7 관리자 편집·월 마감, 2-8 간호사 교환 요청). 기본 달 = 이번 달(간호사는 협의 기간인 달)
export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string | string[]; focus?: string | string[]; shift?: string | string[] }>
}) {
  const session = await requireNurse()
  const today = await requestToday()
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
  const focusDate = one(sp.focus)
  const shift = one(sp.shift)
  const role = session.user.role === 'admin' ? 'admin' : 'nurse'
  // 3-12: 관리자 전체 격자 편집은 휴대폰에서 PC 안내(급한 변경은 3차 PR의 근무표 시트)
  const mobile = (await requestDevice()) === 'mobile'
  if (role === 'admin' && mobile) return <PcOnly group="nurse" />
  const db = getDb()
  const ym = sp.ym
    ? parseYm(sp.ym, today)
    : ((role === 'nurse' ? await defaultAdjustYm(db, today) : null) ?? parseYm(undefined, today))
  const view = await loadAdjustView(db, {
    ym,
    viewer: { id: session.user.id, role },
    today,
    ...(focusDate ? { focus: { date: focusDate, ...(shift ? { shift } : {}) } } : {}),
  })
  // 3-12 모바일 간호사: 받은·보낸 요청 + 여러 명 교환 요청
  if (mobile && !view.admin) return <MobileSwap key={view.ym} view={view} viewerId={session.user.id} />
  // 2-8: 간호사 = 3a 교환 요청, 관리자 = 2-7 직접 편집(하단 도크)
  return view.admin ? (
    <AdjustScreen key={view.ym} view={view} />
  ) : (
    <NurseAdjust key={view.ym} view={view} viewerId={session.user.id} />
  )
}
