'use client'

import { useActionState, useState } from 'react'
import type { NoticeSection } from '@/server/privacy/notice'
import { agreeConsentAction, declineConsentAction, type ConsentState } from '@/server/privacy/actions'
import { useHydrated } from '../admin/ui'
import { ErrorBox } from './ErrorBox'
import { NoticeText } from './NoticeText'

// Build Spec 2-11 R-CONSENT-2·3 — 필수·민감정보 두 동의, 둘 다 체크해야 계속
export function ConsentForm(props: {
  sections: { name: string; section: NoticeSection }[]
  version: string
}) {
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(agreeConsentAction, {})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<string | null>(null)
  const all = props.sections.every((s) => checked[s.name])
  const hydrated = useHydrated()
  return (
    <div data-hydrated={hydrated || undefined} className="flex flex-col gap-4">
      <form id="consent" action={formAction} className="flex flex-col gap-2.5">
        {state.error && <ErrorBox>{state.error}</ErrorBox>}
        {props.sections.map(({ name, section }) => (
          <div key={name} className="flex flex-col rounded-[10px] border border-line">
            <div className="flex min-h-12 items-center gap-2.5 px-3.5">
              <input
                id={`c-${name}`}
                type="checkbox"
                name={name}
                checked={!!checked[name]}
                onChange={(e) => setChecked((c) => ({ ...c, [name]: e.target.checked }))}
                className="h-4 w-4 accent-primary"
              />
              <label htmlFor={`c-${name}`} className="flex-1 cursor-pointer text-sm font-semibold">
                {section.title}
              </label>
              <button
                type="button"
                aria-expanded={open === name}
                onClick={() => setOpen(open === name ? null : name)}
                className="cursor-pointer text-xs text-ink-2"
              >
                전문 보기 {open === name ? '▴' : '▾'}
              </button>
            </div>
            {open === name && (
              <div className="max-h-60 overflow-y-auto border-t border-line-soft px-3.5 py-3">
                <NoticeText section={section} />
              </div>
            )}
          </div>
        ))}
      </form>
      <div className="flex justify-end gap-2">
        <form action={declineConsentAction}>
          <button
            type="submit"
            className="h-11 cursor-pointer rounded-[10px] border border-line bg-surface px-4 text-sm text-ink-2"
          >
            동의하지 않음
          </button>
        </form>
        <button
          type="submit"
          form="consent"
          disabled={!all || pending}
          className="h-11 cursor-pointer rounded-[10px] bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover disabled:cursor-default disabled:opacity-50"
        >
          동의하고 계속
        </button>
      </div>
      <div className="text-xs text-ink-3">동의서 버전 {props.version}</div>
    </div>
  )
}
