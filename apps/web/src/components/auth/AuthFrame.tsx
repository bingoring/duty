import { LoginHero } from './LoginHero'

// 1d 레이아웃: 2열 1fr 480px, 뷰포트 전체 높이. 3-12: 휴대폰 폭은 한 열(왼쪽 패널 대신 작은 제목)
export function AuthFrame(props: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-app md:min-w-[1280px] md:grid-cols-[1fr_480px]">
      <LoginHero />
      <div className="flex flex-col justify-center gap-[22px] px-5 py-8 md:px-12 md:py-14">
        <h1 className="text-xl leading-tight font-extrabold tracking-[-0.03em] md:hidden">
          벌써 근무표
          <br />짤 때가 됐어?
        </h1>
        {props.children}
      </div>
    </main>
  )
}
