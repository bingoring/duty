// Build Spec 2-11 frontend-components — 핸드오프 S2(1e) 모달형 카드 640px(동의·초기 설정 공용)
export function StepCard(props: {
  eyebrow?: string
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-app px-4 py-12">
      <div className="flex w-full max-w-[640px] flex-col gap-5 rounded-2xl border border-line bg-surface px-10 py-9 shadow-[0_16px_40px_rgba(0,0,0,.08)]">
        <div className="flex flex-col gap-1.5">
          {props.eyebrow && (
            <div className="text-xs font-bold tracking-[.04em] text-primary">{props.eyebrow}</div>
          )}
          <h1 className="text-2xl font-bold tracking-[-0.02em]">{props.title}</h1>
          {props.desc && <p className="text-sm text-ink-2">{props.desc}</p>}
        </div>
        {props.children}
      </div>
    </main>
  )
}
