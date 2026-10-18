'use client'

import { ktasBaseDate, ktasValidUntil } from '@duty/domain'
import { useState, useTransition } from 'react'
import { saveKtasAction } from '@/server/onboarding/actions'
import { useHydrated } from '../admin/ui'

// 3-6 — 내 설정: KTAS 취득일·갱신일. 만료 예정일은 (갱신일 또는 취득일) + 3년 − 1일로 계산해 보여 준다.
// 바로 반영되고 관리자에게 확인 요청으로 간다(연차 수정과 같은 방식)
export function KtasForm({
  current,
}: {
  current: { kTass: boolean; ktasCertifiedOn: string | null; ktasRenewedOn: string | null }
}) {
  const [kTass, setKTass] = useState(current.kTass)
  const [certified, setCertified] = useState(current.ktasCertifiedOn ?? '')
  const [renewed, setRenewed] = useState(current.ktasRenewedOn ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const hydrated = useHydrated()
  const base = ktasBaseDate(certified || null, renewed || null)
  const until = kTass && base ? ktasValidUntil(base) : null
  const save = () =>
    start(async () => {
      const r = await saveKtasAction({
        kTass,
        ktasCertifiedOn: kTass ? certified || null : null,
        ktasRenewedOn: kTass ? renewed || null : null,
      })
      setMsg(
        r.ok
          ? {
              ok: true,
              text: r.changed ? '저장했습니다. 관리자에게 확인 요청으로 갑니다.' : '바뀐 값이 없습니다.',
            }
          : { ok: false, text: r.message },
      )
    })
  const input = 'h-9 rounded-lg border border-line px-2 text-sm'
  return (
    <div data-hydrated={hydrated || undefined} className="flex flex-col gap-2.5 text-[13px]">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="accent-primary"
          checked={kTass}
          onChange={(e) => setKTass(e.target.checked)}
        />
        <span className="font-semibold">KTAS 자격이 있습니다</span>
      </label>
      {kTass && (
        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
          <span className="font-semibold">취득일</span>
          <input
            aria-label="KTAS 취득일"
            type="date"
            className={input}
            value={certified}
            onChange={(e) => setCertified(e.target.value)}
          />
          <span className="font-semibold">갱신일</span>
          <input
            aria-label="KTAS 갱신일"
            type="date"
            className={input}
            value={renewed}
            onChange={(e) => setRenewed(e.target.value)}
          />
          <span className="font-semibold">만료 예정일</span>
          <span aria-label="KTAS 만료 예정일" className="font-semibold">
            {until ?? '취득일 또는 갱신일을 넣으면 계산됩니다'}
          </span>
        </div>
      )}
      <p className="text-xs text-ink-2">
        자격은 취득일(갱신했으면 갱신일)부터 3년입니다. 만료 6개월 전부터 간호사 관리에 빨갛게 표시됩니다.
      </p>
      <div>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="h-9 cursor-pointer rounded-lg bg-primary px-3 text-[13px] font-bold text-white disabled:opacity-60"
        >
          KTAS 저장
        </button>
      </div>
      {msg && (
        <div role="status" className={`text-xs ${msg.ok ? 'text-primary' : 'text-danger'}`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
