'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import { ackKtasReminderAction } from '@/server/ktas/actions'

const KEY = 'duty.ktasReminder.shown'
const read = () => {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// 3-8: KTAS 갱신 신청 시기 안내. 로그인한 뒤(브라우저 세션마다) 한 번, 같은 만료일에 3회까지
export function KtasReminder({ until }: { until: string }) {
  const shown = useSyncExternalStore(
    () => () => {},
    read,
    () => true,
  )
  const [closed, setClosed] = useState(false)
  if (shown || closed) return null
  const close = () => {
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {}
    setClosed(true)
    void ackKtasReminderAction()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        role="dialog"
        aria-label="KTAS 갱신 안내"
        className="flex w-[380px] flex-col gap-3 rounded-xl bg-surface p-5 text-[13px] shadow-popover"
      >
        <b className="text-base">KTAS 갱신 신청 기간입니다</b>
        <p>
          KTAS 자격이 <b className="text-danger">{until}</b>에 만료됩니다. 지금 갱신 신청을 할 수 있습니다.
        </p>
        <p className="text-xs text-ink-2">
          갱신했다면 내 설정에서 갱신일을 입력해 주세요. 이 안내는 3번까지 보입니다.
        </p>
        <div className="flex justify-end gap-2">
          <Link
            href="/settings"
            onClick={close}
            className="flex h-9 items-center rounded-lg border border-line px-3 text-[13px]"
          >
            내 설정으로
          </Link>
          <button
            type="button"
            onClick={close}
            className="h-9 cursor-pointer rounded-lg bg-primary px-3 text-[13px] font-bold text-white"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
