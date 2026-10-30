import { BottomTabs } from './BottomTabs'
import { mobileTabs } from './mobile-tabs'
import { SessionKeeper } from './SessionKeeper'
import { ViewportSync } from './ViewportSync'

// 3-12 모바일 셸: 본문 + 아래 탭. 아직 모바일 화면이 없는 화면(2차 PR 전의 신청·교환)은 옆으로 밀어서 본다
export function MobileShell(props: {
  group: 'nurse' | 'doctor'
  isAdmin: boolean
  persistent: boolean
  badges: { swap: number; proposal: number; approval: number }
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-app">
      {props.persistent && <SessionKeeper />}
      <ViewportSync device="mobile" />
      <main className="min-w-0 overflow-x-auto pb-[calc(64px+env(safe-area-inset-bottom))]">
        {props.children}
      </main>
      <BottomTabs tabs={mobileTabs(props.group, props.isAdmin)} badges={props.badges} />
    </div>
  )
}
