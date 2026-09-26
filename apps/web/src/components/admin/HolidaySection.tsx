'use client'

import { formatMD, weekdayKo, type HolidayKind } from '@duty/domain'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { addHolidayAction, deleteHolidayAction, importHolidaysAction } from '@/server/admin/actions'
import type { HolidayRow } from '@/server/holidays/service'
import { btnSecondary, inputCls, useHydrated } from './ui'

// 공휴일·병원 지정일 (Build Spec 2-4 R-HOL-*)
const KIND_LABEL: Record<HolidayKind, string> = {
  public: '공휴일',
  substitute: '대체공휴일',
  election: '선거일',
  labor_day: '노동절',
  hospital: '병원 지정일',
  union_agreed: '노사 협의일',
  founding_day: '개원기념일',
}
const SOURCE_LABEL: Record<string, string> = { seed: '기본', api: '공공데이터', admin: '직접 입력' }

export function HolidaySection({
  year,
  years,
  items,
  apiEnabled,
}: {
  year: number
  years: number[]
  items: HolidayRow[]
  apiEnabled: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState({ date: '', name: '', kind: 'hospital' as HolidayKind })
  const [msg, setMsg] = useState('')
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [pending, start] = useTransition()
  const hydrated = useHydrated()

  const add = () =>
    start(async () => {
      const r = await addHolidayAction(form)
      if (r.ok) {
        setForm({ ...form, date: '', name: '' })
        setErrors({})
        setMsg('추가했습니다.')
      } else setErrors(r.errors ?? { date: r.message ?? '' })
    })
  const remove = (h: HolidayRow) =>
    start(async () => {
      if (!confirm(`${h.date} ${h.name}을 삭제할까요? 이미 마감한 달의 정산은 바뀌지 않습니다.`)) return
      await deleteHolidayAction(h.id)
    })
  const importApi = () =>
    start(async () => {
      const r = await importHolidaysAction(year)
      setMsg(
        r.ok
          ? `공공데이터에서 가져왔습니다: 추가 ${r.added} · 갱신 ${r.updated} · 유지 ${r.kept}`
          : r.message,
      )
    })

  return (
    <section
      aria-label="공휴일·병원 지정일"
      data-hydrated={hydrated || undefined}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-[13px]"
    >
      <div className="flex items-center gap-3">
        <div className="font-bold">공휴일·병원 지정일</div>
        <select
          aria-label="연도"
          className="h-8 rounded-md border border-line px-2"
          value={year}
          onChange={(e) => router.push(`/admin/rules?year=${e.target.value}`)}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${btnSecondary} ml-auto h-8 text-xs`}
          disabled={!apiEnabled || pending}
          onClick={importApi}
        >
          공공데이터에서 가져오기
        </button>
      </div>
      {!apiEnabled && (
        <div className="text-xs text-ink-2">
          공공데이터포털 「한국천문연구원_특일 정보」 인증키를 .env의 HOLIDAY_API_KEY에 설정하면 가져올 수
          있습니다.
        </div>
      )}
      {msg && (
        <div role="status" className="text-xs text-primary">
          {msg}
        </div>
      )}
      <div className="grid grid-cols-[110px_1fr_100px_80px_40px] gap-y-1">
        {items.map((h) => (
          <div key={h.id} role="row" aria-label={`${h.date} ${h.name}`} className="contents">
            <span>
              {formatMD(h.date)} ({weekdayKo(h.date)})
            </span>
            <span>{h.name}</span>
            <span className="text-ink-2">{KIND_LABEL[h.kind]}</span>
            <span className="text-xs text-ink-3">{SOURCE_LABEL[h.source] ?? h.source}</span>
            <button
              type="button"
              aria-label={`${h.name} 삭제`}
              className="cursor-pointer text-ink-3 hover:text-danger"
              onClick={() => remove(h)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[150px_1fr_150px_auto] items-end gap-2 border-t border-line-soft pt-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          날짜
          <input
            type="date"
            className={inputCls}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          이름
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          분류
          <select
            className={inputCls}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as HolidayKind })}
          >
            {(['hospital', 'union_agreed', 'founding_day', 'public'] as const).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btnSecondary} disabled={pending} onClick={add}>
          추가
        </button>
      </div>
      {(errors.date || errors.name) && (
        <div className="text-xs text-danger">{errors.date ?? errors.name}</div>
      )}
    </section>
  )
}
