import { LoginHero } from './LoginHero'

// 1d 레이아웃: 2열 1fr 480px, 뷰포트 전체 높이
export function AuthFrame(props: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen min-w-[1280px] grid-cols-[1fr_480px] bg-app">
      <LoginHero />
      <div className="flex flex-col justify-center gap-[22px] px-12 py-14">{props.children}</div>
    </main>
  )
}
