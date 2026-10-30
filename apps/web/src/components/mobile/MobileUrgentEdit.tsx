'use client'

import { formatMD, weekdayKo, type DutyCode, type IsoDate } from '@duty/domain'
import { useEffect, useState, useTransition } from 'react'
import { CellBody, ReplacementBody } from '@/components/adjust/Dock'
import { useAdjustDraft } from '@/components/adjust/useAdjustDraft'
import { adminAdjustViewAction } from '@/server/adjust/actions'
import type { AdjustView } from '@/server/adjust/view'

// 3-12 3차 휴대폰 급한 근무 변경 (시안 design-mobile 5-admin 오른쪽). 데스크톱 도크 본문(CellBody·ReplacementBody)을
// 시트 안에 그대로 쓰고, 편집 상태는 데스크톱 근무 조정과 같은 useAdjustDraft. 그 달 데이터는 시트를 열 때 읽는다
export type UrgentTarget =
  { kind: 'cell'; userId: string; date: IsoDate } | { kind: 'replace'; date: IsoDate; shift: DutyCode }

export function MobileUrgentEdit(props: {
  ym: { year: number; month: number }
  target: UrgentTarget
  onUnsaved: (n: number) => void
  onClose: () => void
  onSaved: (text: string) => void
}) {
  const [state, setState] = useState<{ view: AdjustView } | { error: string } | null>(null)
  const { year, month } = props.ym
  useEffect(() => {
    let live = true
    void adminAdjustViewAction({ year, month }).then((r) => {
      if (live) setState(r.ok ? { view: r.view } : { error: r.message })
    })
    return () => {
      live = false
    }
  }, [year, month])
  if (!state) return <p className="py-6 text-center text-xs text-ink-3">불러오는 중…</p>
  if ('error' in state) return <p className="py-4 text-xs text-danger">{state.error}</p>
  return <Editor {...props} view={state.view} />
}

function Editor(props: {
  view: AdjustView
  target: UrgentTarget
  onUnsaved: (n: number) => void
  onClose: () => void
  onSaved: (text: string) => void
}) {
  const { view, target, onUnsaved } = props
  const draft = useAdjustDraft(view)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<{ text: string; list: string[] } | null>(null)
  useEffect(() => onUnsaved(draft.unsaved), [draft.unsaved, onUnsaved])
  const nameOf = (id: string) => view.names[id]?.name ?? id
  const title =
    target.kind === 'cell'
      ? `${nameOf(target.userId)} · ${formatMD(target.date)} (${weekdayKo(target.date)}) 근무 변경`
      : `${formatMD(target.date)} ${target.shift} 대체 지정`

  if (!view.editable || !draft.draftInput)
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="text-[15px] font-bold">{title}</div>
        <p className="text-xs text-ink-2">{view.blockedReason ?? '확정된 근무표에서만 바꿀 수 있습니다.'}</p>
      </div>
    )

  const save = () =>
    start(async () => {
      setErr(null)
      const r = await draft.save()
      if (!r) return
      if (r.ok)
        return props.onSaved(`${'saved' in r ? r.saved : 0}건을 저장했습니다. 간호사 근무표에 바로 보입니다.`)
      const list = 'violations' in r ? ((r.violations as string[] | undefined) ?? []) : []
      setErr({ text: r.message, list })
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[15px] font-bold">{title}</div>
      {target.kind === 'cell' ? (
        <CellBody
          variant="sheet"
          leaveMode="day"
          view={view}
          input={draft.draftInput}
          edits={draft.edits}
          leaves={draft.leaves}
          base={draft.base}
          userId={target.userId}
          date={target.date}
          nameOf={nameOf}
          onApply={draft.addEdits}
          onRevert={draft.revert}
          onLeaveDay={draft.addLeave}
          onRerolled={() => {}}
          onLeaveCancelled={(text) => props.onSaved(text)}
        />
      ) : (
        <ReplacementBody
          variant="sheet"
          view={view}
          input={draft.draftInput}
          base={draft.base}
          date={target.date}
          shift={target.shift}
          nameOf={nameOf}
          onPick={(e) => draft.addEdits([e])}
        />
      )}
      {err && (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger-ink">
          {err.text}
          {err.list.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {err.list.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="sticky bottom-0 flex items-center gap-2 border-t border-line-soft bg-surface pt-2.5">
        <span className={`text-xs ${draft.unsaved ? 'font-semibold text-admin' : 'text-ink-3'}`}>
          저장 전 변경 {draft.unsaved}건
        </span>
        <button
          type="button"
          disabled={!draft.unsaved || pending}
          onClick={draft.reset}
          className="ml-auto h-10 rounded-lg border border-line bg-surface px-3 text-[13px] disabled:opacity-40"
        >
          되돌리기
        </button>
        <button
          type="button"
          disabled={!draft.unsaved || pending}
          onClick={save}
          className="h-10 rounded-lg bg-ink px-3.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          저장 · 바로 공개
        </button>
      </div>
    </div>
  )
}
