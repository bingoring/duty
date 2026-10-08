import { NoticeText } from '@/components/auth/NoticeText'
import { StepCard } from '@/components/auth/StepCard'
import {
  PRIVACY_CONTACT,
  PRIVACY_NOTICE_VERSION,
  PRIVACY_REQUIRED,
  PRIVACY_SENSITIVE,
} from '@/server/privacy/notice'

// Build Spec 2-11 R-CONSENT-6 — 로그인 없이 열람하는 개인정보 처리 안내
export const metadata = { title: '개인정보 처리 안내' }

export default function PrivacyPage() {
  return (
    <StepCard title="개인정보 처리 안내" desc={`응급실 근무표 · 동의서 버전 ${PRIVACY_NOTICE_VERSION}`}>
      {[PRIVACY_REQUIRED, PRIVACY_SENSITIVE].map((s) => (
        <section key={s.title} className="flex flex-col gap-2">
          <h2 className="text-[15px] font-bold">{s.title}</h2>
          <NoticeText section={s} />
        </section>
      ))}
      <p className="text-[13px] text-ink-2">{PRIVACY_CONTACT}</p>
    </StepCard>
  )
}
