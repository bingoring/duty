import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { PasswordForm } from '@/components/auth/PasswordForm'
import { requireUser } from '@/server/auth/guards'
import { getCurrentRules } from '@/server/rules'

// 첫 로그인 강제 변경 화면(핸드오프에 없음 → S1 우측 패널 스타일, 편차 기록). 자발적 변경은 /settings.
export default async function PasswordPage() {
  const session = await requireUser({ allowMustChange: true })
  if (!session.mustChangePassword) redirect('/settings')
  const { params } = await getCurrentRules()
  return (
    <AuthFrame requestDeadlineDay={params.requestDeadlineDay} negotiationEndDay={params.negotiationEndDay}>
      <div className="flex flex-col gap-1">
        <div className="text-xs font-bold tracking-[.04em] text-primary">
          처음 오셨군요 · {session.user.name} 님
        </div>
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">새 비밀번호를 설정해 주세요</h2>
        <p className="text-sm text-ink-2">
          임시 비밀번호로 로그인하셨습니다. 앞으로 사용할 비밀번호를 정해 주세요.
        </p>
      </div>
      <PasswordForm mode="forced" />
    </AuthFrame>
  )
}
