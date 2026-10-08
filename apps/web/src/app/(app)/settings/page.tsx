import Link from 'next/link'
import { PasswordForm } from '@/components/auth/PasswordForm'
import { requireUser } from '@/server/auth/guards'

export default async function SettingsPage() {
  await requireUser()
  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">내 설정</h1>
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
