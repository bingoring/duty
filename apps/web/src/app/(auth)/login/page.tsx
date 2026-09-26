import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { LoginForm } from '@/components/auth/LoginForm'
import { getSession } from '@/server/auth/session'
import { safeNext } from '@/server/auth/tokens'
import { getCurrentRules } from '@/server/rules'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect('/')
  const { next } = await searchParams
  const { params } = await getCurrentRules()
  return (
    <AuthFrame requestDeadlineDay={params.requestDeadlineDay} negotiationEndDay={params.negotiationEndDay}>
      <LoginForm next={safeNext(next)} />
    </AuthFrame>
  )
}
