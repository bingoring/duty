import Link from 'next/link'
import { PasswordForm } from '@/components/auth/PasswordForm'
import { requireDoctor } from '@/server/auth/guards'

// 3-7a 의사 내 설정 — 비밀번호만 (근무 조건은 근무 신청 화면의 「내 근무 조건」)
export default async function DoctorSettingsPage() {
  await requireDoctor()
  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">내 설정</h1>
      <section className="flex max-w-[420px] flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold">비밀번호 변경</h2>
        <PasswordForm mode="voluntary" />
      </section>
      <Link href="/privacy" className="text-[13px] text-ink-2 underline">
        개인정보 처리 안내
      </Link>
    </div>
  )
}
