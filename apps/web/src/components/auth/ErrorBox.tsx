export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2.5 text-[13px] text-danger-ink">
      {children}
    </div>
  )
}
