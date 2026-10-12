'use client'

import { useState, useTransition } from 'react'
import { reorderStaffAction } from '@/server/admin/actions'

// 3-4 — 간호사 관리 「순서 바꾸기」. 끌어서 놓거나 ↑↓로 옮긴 뒤 저장하면 근무표·근무 조정·근무 신청·생성안의 행 순서가 바뀐다
type Item = { id: string; name: string; label: string; head: boolean }

export function ReorderList({ items, onDone }: { items: Item[]; onDone: (msg: string) => void }) {
  const [order, setOrder] = useState(items)
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const changed = order.some((x, i) => x.id !== items[i]!.id)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    const next = [...order]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x!)
    setOrder(next)
  }
  const save = () =>
    start(async () => {
      const r = await reorderStaffAction(order.map((x) => x.id))
      if (r.ok) onDone('순서를 저장했습니다. 근무표·근무 조정·근무 신청에 바로 반영됩니다.')
      else setError(r.message ?? '저장하지 못했습니다.')
    })

  return (
    <section
      aria-label="순서 바꾸기"
      className="flex flex-col gap-2.5 rounded-xl border border-ink bg-surface p-3.5 text-[13px]"
    >
      <div className="flex items-center gap-2">
        <b>순서 바꾸기</b>
        <span className="text-xs text-ink-2">
          끌어서 놓거나 ↑↓로 옮긴 뒤 저장 · 수간호사는 근무표에서 늘 맨 위
        </span>
        <button
          type="button"
          onClick={() => onDone('')}
          className="ml-auto h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs"
        >
          취소
        </button>
        <button
          type="button"
          disabled={!changed || pending}
          onClick={save}
          className="h-8 cursor-pointer rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:cursor-default disabled:opacity-50"
        >
          저장
        </button>
      </div>
      {error && (
        <div role="alert" className="text-xs text-danger">
          {error}
        </div>
      )}
      <ol className="flex flex-col">
        {order.map((x, i) => (
          <li
            key={x.id}
            aria-label={`${i + 1}. ${x.name}`}
            draggable
            onDragStart={(e) => (setDrag(i), e.dataTransfer.setData('text/plain', x.id))}
            onDragOver={(e) => (e.preventDefault(), setOver(i))}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => (e.preventDefault(), drag !== null && move(drag, i), setDrag(null), setOver(null))}
            onDragEnd={() => (setDrag(null), setOver(null))}
            className={`flex cursor-grab items-center gap-2.5 border-b border-line-soft px-2 py-2 ${
              drag === i ? 'opacity-40' : ''
            } ${over === i && drag !== i ? 'bg-primary-soft' : ''}`}
          >
            <span aria-hidden className="text-ink-3">
              ⠿
            </span>
            <span className="w-6 text-right text-ink-3">{i + 1}</span>
            <span className={`font-semibold ${x.head ? 'text-admin' : ''}`}>{x.name}</span>
            <span className="text-xs text-ink-2">{x.label}</span>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                aria-label={`${x.name} 위로`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                className="h-7 w-7 cursor-pointer rounded border border-line disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`${x.name} 아래로`}
                disabled={i === order.length - 1}
                onClick={() => move(i, i + 1)}
                className="h-7 w-7 cursor-pointer rounded border border-line disabled:opacity-30"
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
