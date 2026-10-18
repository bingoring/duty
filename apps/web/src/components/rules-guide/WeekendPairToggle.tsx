'use client'

import { useState, useTransition } from 'react'
import { setWeekendPairWantedAction } from '@/server/preferences/actions'
import { useHydrated } from '../admin/ui'

// 3-6: 내 주말 통 OFF 받기(기본 켜짐). 끄면 다음 근무표 생성부터 주말 이틀 통 OFF를 맞추지 않는다
export function WeekendPairToggle({ wanted, ruleOn }: { wanted: boolean; ruleOn: boolean }) {
  const [on, setOn] = useState(wanted)
  const [msg, setMsg] = useState('')
  const [busy, start] = useTransition()
  const hydrated = useHydrated()
  return (
    <section
      aria-label="내 주말 통 OFF"
      data-hydrated={hydrated || undefined}
      className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-[13px]"
    >
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-[3px] accent-primary"
          checked={on}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.checked
            setOn(v)
            start(async () => {
              const r = await setWeekendPairWantedAction(v)
              if (!r.ok) {
                setOn(!v)
                setMsg(r.message)
              } else
                setMsg(
                  v
                    ? '주말 통 OFF를 받습니다.'
                    : '주말 통 OFF를 받지 않습니다. 다음 근무표 생성부터 반영됩니다.',
                )
            })
          }}
        />
        <span>
          <b>나는 매달 주말 이틀 통 OFF를 받겠습니다</b>
          <br />
          <span className="text-xs text-ink-2">
            처음에는 모두 받도록 되어 있습니다. 원하지 않으면 끄세요 — 다음 근무표 생성부터 반영됩니다.
            {!ruleOn && ' (지금은 규칙 설정에서 주말 통 OFF 규칙이 꺼져 있습니다.)'}
          </span>
        </span>
      </label>
      {msg && (
        <span role="status" className="text-xs text-ink-2">
          {msg}
        </span>
      )}
    </section>
  )
}
