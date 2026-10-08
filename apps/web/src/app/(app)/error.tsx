'use client'

// R-1: 일시적 DB·솔버 오류에서도 셸 안에서 다시 시도할 수 있게 한다(기본 "Application error" 화면 대신)
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-7 py-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">화면을 불러오지 못했습니다</h1>
      <p className="text-sm text-ink-2">
        잠시 뒤 다시 시도해 주세요. 계속되면 관리자에게 알려 주세요
        {error.digest ? ` (오류 번호 ${error.digest})` : ''}.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="h-9 cursor-pointer rounded-lg bg-primary px-4 text-sm font-semibold text-white"
      >
        다시 시도
      </button>
    </div>
  )
}
