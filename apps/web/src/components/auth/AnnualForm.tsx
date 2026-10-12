'use client'

import { useState, useTransition } from 'react'
import { saveAnnualAction } from '@/server/onboarding/actions'
import { useHydrated } from '../admin/ui'

// 3-4 — 내 설정: 남은 연차를 언제든 고친다. 바로 반영되고 관리자에게 확인 요청으로 간다
export function AnnualForm({ current, year }: { current: number; year: number }) {
  const [value, setValue] = useState(String(current))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const hydrated = useHydrated()
  const save = () =>
    start(async () => {
      const r = await saveAnnualAction({ annual: value === '' ? NaN : Number(value) })
      setMsg(
        r.ok
          ? {
              ok: true,
              text: r.changed ? '저장했습니다. 관리자에게 확인 요청으로 갑니다.' : '바뀐 값이 없습니다.',
            }
          : { ok: false, text: r.message },
      )
    })
  return (
    <div data-hydrated={hydrated || undefined} className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-[13px]">
        <span className="font-semibold">{year}년 남은 연차</span>
        <input
          aria-label="남은 연차"
          type="number"
          step={0.5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-24 rounded-lg border border-line px-2 text-sm"
        />
        <span className="text-ink-2">일</span>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="h-9 cursor-pointer rounded-lg bg-primary px-3 text-[13px] font-bold text-white disabled:opacity-60"
        >
          연차 저장
        </button>
      </label>
      <p className="text-xs text-ink-2">
        입사 1년이 안 됐으면 달마다 늘어날 수 있습니다. 바꾼 값은 기록되고 관리자가 확인합니다.
      </p>
      {msg && (
        <div role="status" className={`text-xs ${msg.ok ? 'text-primary' : 'text-danger'}`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
