'use client'

import { applyEdits, type CellEdit } from '@duty/domain'
import { useMemo, useState } from 'react'
import { saveEditsAction } from '@/server/adjust/actions'
import { applyDraftLeaves, draftLeaveKeys, mergeRerolled, type DraftLeave } from '@/server/adjust/draft'
import type { AdjustView } from '@/server/adjust/view'
import { cellView, type GridCellView } from '@/server/schedule/view'

// 근무 조정 관리자 편집 상태 — 저장 전 편집·저장 전 휴가·함께 되돌리기·저장.
// 데스크톱 근무 조정(AdjustScreen)과 3-12 휴대폰 급한 변경 시트가 같이 쓴다
const key = (u: string, d: string) => `${u}|${d}`

export type SaveResult = Awaited<ReturnType<typeof saveEditsAction>>

export function useAdjustDraft(view: AdjustView) {
  const [edits, setEdits] = useState<CellEdit[]>([])
  // 3-10 9: 저장 전 휴가(휴가 넣고 다시 생성) — 「저장 · 재배포」 때 처음 저장된다
  const [leaves, setLeaves] = useState<DraftLeave[]>([])
  // 맞바꾸기·대체처럼 함께 들어간 편집은 함께 되돌린다
  const [groups, setGroups] = useState<Map<string, string[]>>(new Map())
  const input = view.checkInput
  // 저장 전 휴가를 얹은 칸(편집의 출발점)과 그 위에 편집을 얹은 칸
  const draftInput = useMemo(
    () => (input ? { ...input, cells: applyDraftLeaves(input.cells, leaves) } : null),
    [input, leaves],
  )
  const base = useMemo(() => (draftInput ? applyEdits(draftInput.cells, edits) : []), [draftInput, edits])
  const leaveCellCount = leaves.reduce((n, l) => n + l.cells.length, 0)
  const unsaved = edits.length + leaveCellCount

  const pendingViews = useMemo(() => {
    const m = new Map<string, GridCellView>()
    const days = new Map(view.grid.days.map((d) => [d.date, d]))
    const changed = new Set([...edits.map((e) => key(e.userId, e.date)), ...draftLeaveKeys(leaves)])
    for (const c of base.filter((c) => changed.has(key(c.userId, c.date))))
      m.set(key(c.userId, c.date), cellView({ ...c, source: 'admin' }, days.get(c.date)!))
    return m
  }, [edits, leaves, base, view.grid.days])

  const group = (ks: string[]) =>
    setGroups((g) => {
      const n = new Map(g)
      for (const k of ks) n.set(k, ks)
      return n
    })
  const reset = () => (setEdits([]), setLeaves([]), setGroups(new Map()))

  const addEdits = (next: CellEdit[]) => {
    const orig = new Map((draftInput?.cells ?? []).map((c) => [key(c.userId, c.date), c]))
    setEdits((prev) => {
      const m = new Map(prev.map((e) => [key(e.userId, e.date), e]))
      for (const e of next) {
        const k = key(e.userId, e.date)
        const o = orig.get(k)!
        const first = m.get(k)?.before ?? e.before
        const back =
          o.code === e.after.code &&
          (o.code !== 'OFF' || (o.offKind ?? 'regular') === (e.after.offKind ?? 'regular'))
        if (back) m.delete(k)
        else m.set(k, { ...e, before: first })
      }
      return [...m.values()]
    })
    group(next.map((e) => key(e.userId, e.date)))
  }
  const revert = (k: string) => {
    const ks = groups.get(k) ?? [k]
    setEdits((prev) => prev.filter((e) => !ks.includes(key(e.userId, e.date))))
    // 3-10 9: 휴가 넣기와 그 다시 생성 결과는 함께 되돌린다
    setLeaves((prev) => prev.filter((l) => !l.cells.some((c) => ks.includes(key(l.userId, c.date)))))
    setGroups((g) => {
      const n = new Map(g)
      for (const x of ks) n.delete(x)
      return n
    })
  }
  // 3-10 8·9: 이전 편집 + 새 휴가 + 다시 생성한 편집이 모두 저장 전 편집이다(next가 편집 전체를 바꾼다)
  const addRerolled = (leave: DraftLeave, next: CellEdit[]) => {
    const prevKeys = new Set(edits.map((e) => key(e.userId, e.date)))
    setLeaves((prev) => [...prev, leave])
    setEdits(next)
    group([
      ...leave.cells.map((c) => key(leave.userId, c.date)),
      ...next.map((e) => key(e.userId, e.date)).filter((x) => !prevKeys.has(x)),
    ])
  }
  // 3-12 3차: 휴대폰 하루 휴가(다시 생성 없음). 휴가가 덮는 칸의 저장 전 편집은 빠지고(휴가가 우선),
  // 그 편집과 함께 들어간 칸(맞바꾸기·대체)은 휴가와 함께 되돌리도록 묶는다
  const addLeave = (leave: DraftLeave) => {
    const covered = leave.cells.map((c) => key(leave.userId, c.date))
    setLeaves((prev) => [...prev, leave])
    setEdits((prev) => mergeRerolled(prev, leave, []))
    group([...new Set([...covered, ...covered.flatMap((k) => groups.get(k) ?? [])])])
  }
  // 성공하면 초안을 비운다. 계획(달)이 없으면 null
  const save = async (): Promise<SaveResult | null> => {
    if (!view.plan) return null
    const r = await saveEditsAction({ planId: view.plan.id, edits, leaves })
    if (r.ok) reset()
    return r
  }

  return {
    edits,
    leaves,
    base,
    draftInput,
    unsaved,
    pendingViews,
    addEdits,
    addLeave,
    addRerolled,
    revert,
    reset,
    save,
  }
}
