export function Placeholder({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
      <div className="rounded-xl border border-line bg-surface p-6 text-[13px] text-ink-2">
        이 화면은 {stage}에서 구현됩니다.
      </div>
    </div>
  )
}
