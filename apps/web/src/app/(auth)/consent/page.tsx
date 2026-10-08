import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ConsentForm } from '@/components/auth/ConsentForm'
import { StepCard } from '@/components/auth/StepCard'
import { requireUser } from '@/server/auth/guards'
import { PRIVACY_NOTICE_VERSION, PRIVACY_REQUIRED, PRIVACY_SENSITIVE } from '@/server/privacy/notice'

// Build Spec 2-11 R-CONSENT-1 — 로그인 뒤 현재 버전에 동의하지 않았으면 여기로
export default async function ConsentPage() {
  const s = await requireUser({ allowStep: ['consent'] })
  if (s.pendingStep !== 'consent') redirect('/')
  return (
    <StepCard
      eyebrow={`처음 오셨군요 · ${s.user.name} 님`}
      title="개인정보 수집·이용 동의"
      desc="근무표를 쓰려면 아래 두 가지에 동의해야 합니다."
    >
      <ConsentForm
        version={PRIVACY_NOTICE_VERSION}
        sections={[
          { name: 'required', section: PRIVACY_REQUIRED },
          { name: 'sensitive', section: PRIVACY_SENSITIVE },
        ]}
      />
      <Link href="/privacy" target="_blank" className="text-xs text-ink-2 underline">
        개인정보 처리 안내 전체 보기
      </Link>
    </StepCard>
  )
}
