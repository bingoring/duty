'use client'

import { useActionState, useState } from 'react'
import { loginAction, type LoginState } from '@/server/auth/actions'
import { ErrorBox } from './ErrorBox'
import { TextField } from './TextField'

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {})
  const [showForgot, setShowForgot] = useState(false)

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">로그인</h2>
        <p className="text-sm text-ink-2">사번과 비밀번호를 입력해 주세요.</p>
      </div>
      <form action={formAction} className="flex flex-col gap-[22px]" noValidate>
        {state.error && <ErrorBox>{state.error}</ErrorBox>}
        <input type="hidden" name="next" value={next} />
        <TextField
          label="사번"
          name="employeeNo"
          inputMode="numeric"
          autoComplete="username"
          autoFocus
          defaultValue={state.employeeNo ?? ''}
          error={state.fieldErrors?.employeeNo}
        />
        <TextField
          label="비밀번호"
          name="password"
          type="password"
          autoComplete="current-password"
          error={state.fieldErrors?.password}
        />
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" name="keep" defaultChecked className="h-4 w-4 accent-primary" />이 기기에서
          로그인 유지
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-12 cursor-pointer rounded-[10px] bg-primary text-[15px] font-bold text-white hover:bg-primary-hover disabled:cursor-default disabled:opacity-70"
        >
          {pending ? '로그인 중…' : '로그인'}
        </button>
      </form>
      <div className="flex justify-between text-[13px]">
        <button type="button" onClick={() => setShowForgot(true)} className="cursor-pointer text-ink">
          비밀번호를 잊으셨나요?
        </button>
        <span className="text-ink-2">계정은 관리자가 발급합니다</span>
      </div>
      {showForgot && (
        <div role="status" className="rounded-lg border border-line-soft bg-panel px-3 py-2.5 text-[13px]">
          관리자(수간호사)에게 비밀번호 재발급을 요청해 주세요.
        </div>
      )}
    </>
  )
}
