import Link from 'next/link'
import { AnnualForm } from '@/components/auth/AnnualForm'
import { KtasForm } from '@/components/auth/KtasForm'
import { PasswordForm } from '@/components/auth/PasswordForm'
import { requireNurse } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { currentValues } from '@/server/onboarding/service'

export default async function SettingsPage() {
  const s = await requireNurse()
  const today = await requestToday()
  const { annual, kTass, ktasCertifiedOn, ktasRenewedOn } = await currentValues(getDb(), s.user.id, today)
  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">내 설정</h1>
      {/* 3-4: 남은 연차 수정 */}
      <section className="flex max-w-[420px] flex-col gap-3 rounded-xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold">연차</h2>
        <AnnualForm current={annual} year={Number(today.slice(0, 4))} />
      </section>
      {/* 3-6: KTAS 취득일·갱신일 → 만료 예정일 */}
      <section className="flex max-w-[420px] flex-col gap-3 rounded-xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold">KTAS</h2>
        <KtasForm current={{ kTass, ktasCertifiedOn, ktasRenewedOn }} />
      </section>
      <section className="flex max-w-[420px] flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold">비밀번호 변경</h2>
        <PasswordForm mode="voluntary" />
      </section>
      {/* 2-11 R-CONSENT-6 */}
      <Link href="/privacy" className="text-[13px] text-ink-2 underline">
        개인정보 처리 안내
      </Link>
    </div>
  )
}
