'use client'

import { useEffect, useState } from 'react'

// 관리자 화면 공용 입력 요소 (핸드오프 1k·2b 스타일)
export const inputCls = 'h-[42px] rounded-lg border border-line bg-surface px-3 text-sm'
export const btnPrimary =
  'h-[42px] cursor-pointer rounded-lg bg-primary px-[18px] font-bold text-white hover:bg-primary-hover disabled:cursor-default disabled:opacity-50'
export const btnSecondary =
  'h-[42px] cursor-pointer rounded-lg border border-line bg-surface px-4 disabled:opacity-50'

export function Field({
  label,
  error,
  required,
  children,
}: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5 font-semibold">
      <span>
        {label} {required && <span className="text-danger">*필수</span>}
      </span>
      {children}
      {error && <span className="text-xs font-normal text-danger">{error}</span>}
    </label>
  )
}

export function Dialog({
  title,
  onClose,
  children,
  width = 440,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-[14px] bg-surface p-[22px] text-[13px] shadow-popover"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-bold">{title}</div>
        {children}
      </div>
    </div>
  )
}

// 하이드레이션이 끝났는지. 폼 루트에 data-hydrated로 달아 E2E가 입력 전에 기다린다(느린 환경에서 하이드레이션 전 입력이 사라짐)
export function useHydrated(): boolean {
  const [h, setH] = useState(false)
  useEffect(() => setH(true), [])
  return h
}
