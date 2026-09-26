'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-[13px]"
    >
      인쇄
    </button>
  )
}
