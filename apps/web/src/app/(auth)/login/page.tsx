import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { LoginForm } from '@/components/auth/LoginForm'
import { getSession } from '@/server/auth/session'
import { safeNext } from '@/server/auth/tokens'
import { getRulesForAuthPage } from '@/server/rules'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; consent?: string }>
}) {
  if (await getSession()) redirect('/')
  const { next, consent } = await searchParams
  const { params } = await getRulesForAuthPage()
  return (
    <AuthFrame requestDeadlineDay={params.requestDeadlineDay} negotiationEndDay={params.negotiationEndDay}>
      {consent === 'declined' && (
        <div role="status" className="rounded-lg bg-warn-bg px-3 py-2.5 text-[13px] text-warn-ink">
          동의하지 않으면 근무표를 사용할 수 없습니다. 관리자에게 문의하세요.
        </div>
      )}
      <LoginForm next={safeNext(next)} />
      <Link href="/privacy" className="text-xs text-ink-2 underline">
        개인정보 처리 안내
      </Link>
    </AuthFrame>
  )
}
