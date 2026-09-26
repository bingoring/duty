import { PasswordForm } from '@/components/auth/PasswordForm'

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">내 설정</h1>
      <section className="flex max-w-[420px] flex-col gap-4 rounded-xl border border-line bg-surface p-6">
        <h2 className="text-base font-bold">비밀번호 변경</h2>
        <PasswordForm mode="voluntary" />
      </section>
    </div>
  )
}
