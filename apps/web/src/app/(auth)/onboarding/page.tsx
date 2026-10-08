import { redirect } from 'next/navigation'
import { OnboardingForm } from '@/components/auth/OnboardingForm'
import { StepCard } from '@/components/auth/StepCard'
import { requireUser } from '@/server/auth/guards'
import { requestToday } from '@/server/clock'
import { getDb } from '@/server/db/client'
import { loadOnboarding } from '@/server/onboarding/service'
import { getRulesForAuthPage } from '@/server/rules'

// Build Spec 2-11 R-ONB-1·4·9 — 최초 로그인 초기 설정, 해마다 1월에는 올해 연차만
export default async function OnboardingPage() {
  const s = await requireUser({ allowStep: ['onboarding', 'annual'] })
  if (s.pendingStep !== 'onboarding' && s.pendingStep !== 'annual') redirect('/')
  const rules = await getRulesForAuthPage()
  const view = await loadOnboarding(getDb(), {
    userId: s.user.id,
    today: await requestToday(),
    mode: s.pendingStep === 'annual' ? 'annual' : 'initial',
    nightDedicatedOn: rules.toggles.nightDedicated,
  })
  return (
    <StepCard
      eyebrow={
        view.mode === 'annual' ? `${view.year}년 · ${view.name} 님` : `처음 오셨군요 · ${view.name} 님`
      }
      title={view.mode === 'annual' ? `${view.year}년 연차를 확인해 주세요` : '내 정보를 확인해 주세요'}
      desc={
        view.mode === 'annual'
          ? '연차는 해마다 1월 1일에 새로 정해집니다. 올해 받은 연차 수를 확인해 주세요.'
          : '관리자가 넣어 둔 값입니다. 다르면 고쳐 주세요. 바꾼 값은 관리자에게 확인 요청으로 갑니다.'
      }
    >
      <OnboardingForm view={view} params={rules.params} />
    </StepCard>
  )
}
