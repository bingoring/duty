'use client'

import { useActionState } from 'react'
import { changePasswordAction, type PasswordState } from '@/server/auth/actions'
import { ErrorBox } from './ErrorBox'
import { TextField } from './TextField'

export function PasswordForm({ mode }: { mode: 'forced' | 'voluntary' }) {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {})
  const fe = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="flex flex-col gap-[18px]" noValidate>
      {state.error && <ErrorBox>{state.error}</ErrorBox>}
      {state.done && (
        <div role="status" className="rounded-lg bg-primary-soft px-3 py-2.5 text-[13px] text-primary">
          비밀번호를 바꿨습니다. 다른 기기의 로그인은 모두 해제되었습니다.
        </div>
      )}
      {mode === 'voluntary' && (
        <TextField
          label="현재 비밀번호"
          name="current"
          type="password"
          autoComplete="current-password"
          error={fe.current}
        />
      )}
      <TextField
        label="새 비밀번호"
        name="next"
        type="password"
        autoComplete="new-password"
        autoFocus={mode === 'forced'}
        error={fe.next}
      />
      <TextField
        label="새 비밀번호 확인"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={fe.confirm}
      />
      <p className="text-xs text-ink-2">8자 이상, 사번과 다른 비밀번호</p>
      <button
        type="submit"
        disabled={pending}
        className="h-12 cursor-pointer rounded-[10px] bg-primary text-[15px] font-bold text-white hover:bg-primary-hover disabled:opacity-70"
      >
        {pending ? '저장 중…' : '저장'}
      </button>
    </form>
  )
}
