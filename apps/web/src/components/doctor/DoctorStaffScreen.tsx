'use client'

// 3-7a S-D3 의사 관리 — 의사 추가(임시 비밀번호), 「사번으로 변경」, 역할·임시 비밀번호·제거
import { useState, useTransition } from 'react'
import { Dialog, Field, btnPrimary, btnSecondary, inputCls } from '@/components/admin/ui'
import {
  changeDoctorLoginIdAction,
  createDoctorAction,
  reissueDoctorPasswordAction,
  removeDoctorAction,
  setDoctorRoleAction,
} from '@/server/doctor/actions'

export type StaffRow = {
  id: string
  name: string
  loginId: string
  loginIdKind: string
  role: string
  allDay: string
  fixed: string[]
}

type Res = { ok: true; tempPassword?: string } | { ok: false; message: string }

const COLS = '1.3fr .9fr .7fr .9fr 1.3fr 1.2fr'

export function DoctorStaffScreen({ rows, me }: { rows: StaffRow[]; me: string }) {
  const [pending, start] = useTransition()
  const [dialog, setDialog] = useState<null | { kind: 'add' } | { kind: 'id'; row: StaffRow }>(null)
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const act = (f: () => Promise<Res>, onOk?: (r: Res & { ok: true }) => void) =>
    start(async () => {
      const r = await f()
      if (!r.ok) return setError(r.message)
      setError(null)
      onOk?.(r)
    })

  return (
    <div className="flex flex-col gap-3 px-7 py-6 text-[13px]">
      <div className="flex items-center gap-3">
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">의사 관리 · 응급실 {rows.length}명</h1>
        <button
          type="button"
          className={`${btnPrimary} ml-auto h-9`}
          onClick={() => setDialog({ kind: 'add' })}
        >
          + 의사 추가
        </button>
      </div>
      <p className="rounded-lg bg-warn-bg px-3.5 py-2.5 text-warn-ink">
        의사는 사번 대신 <b>생년월일 6자리</b>로 로그인합니다. 사번이 정해지면 「사번으로 변경」으로 로그인
        ID만 바꿉니다(근무 기록은 그대로).
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {temp && (
        <p role="status" className="rounded-lg bg-primary-soft px-3.5 py-2.5 text-primary">
          {temp.name} 임시 비밀번호: <b className="font-mono">{temp.password}</b> — 다시 표시되지 않습니다. 첫
          로그인 때 바꾸게 됩니다.
        </p>
      )}
      <div
        role="table"
        aria-label="의사 명단"
        className="overflow-hidden rounded-card border border-line bg-surface"
      >
        <div
          role="row"
          className="grid bg-panel px-4 py-2.5 text-xs font-semibold text-ink-2"
          style={{ gridTemplateColumns: COLS }}
        >
          <span role="columnheader">로그인 ID</span>
          <span role="columnheader">성명</span>
          <span role="columnheader">역할</span>
          <span role="columnheader">올데이 선호</span>
          <span role="columnheader">고정 조건</span>
          <span role="columnheader" />
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            role="row"
            className="grid items-center border-t border-line-soft px-4 py-3"
            style={{ gridTemplateColumns: COLS }}
          >
            <span role="cell" className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{r.loginId}</span>
              {r.loginIdKind === 'birthdate' && (
                <span className="rounded bg-line-soft px-1.5 text-[10.5px] text-ink-2">생년월일</span>
              )}
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-primary"
                onClick={() => setDialog({ kind: 'id', row: r })}
              >
                {r.loginIdKind === 'birthdate' ? '사번으로 변경' : 'ID 변경'}
              </button>
            </span>
            <span role="cell" className="font-semibold">
              {r.name}
            </span>
            <span role="cell" className={r.role === 'admin' ? 'font-semibold text-admin' : 'text-ink-2'}>
              {r.role === 'admin' ? '관리자' : '의사'}
            </span>
            <span role="cell">{r.allDay}</span>
            <span role="cell" className="flex flex-wrap gap-1">
              {r.fixed.length === 0 ? (
                <span className="text-ink-4">—</span>
              ) : (
                r.fixed.map((f) => (
                  <span key={f} className="rounded-full bg-weekend-cell px-2 py-0.5 text-xs">
                    {f}
                  </span>
                ))
              )}
            </span>
            <span role="cell" className="flex flex-wrap justify-end gap-2 text-xs">
              {r.id !== me && (
                <button
                  type="button"
                  className="cursor-pointer text-ink-2 hover:text-ink"
                  disabled={pending}
                  onClick={() => act(() => setDoctorRoleAction(r.id, r.role !== 'admin'))}
                >
                  {r.role === 'admin' ? '관리자 해제' : '관리자 지정'}
                </button>
              )}
              <button
                type="button"
                className="cursor-pointer text-ink-2 hover:text-ink"
                disabled={pending}
                onClick={() =>
                  act(
                    () => reissueDoctorPasswordAction(r.id),
                    (x) => x.tempPassword && setTemp({ name: r.name, password: x.tempPassword }),
                  )
                }
              >
                임시 비밀번호
              </button>
              {r.id !== me && (
                <button
                  type="button"
                  className="cursor-pointer text-danger"
                  disabled={pending}
                  onClick={() =>
                    confirm(`${r.name}을(를) 명단에서 제거할까요?`) && act(() => removeDoctorAction(r.id))
                  }
                >
                  제거
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {dialog?.kind === 'add' && (
        <AddDialog
          pending={pending}
          onClose={() => setDialog(null)}
          onSubmit={(v) =>
            act(
              () => createDoctorAction(v),
              (x) => {
                setDialog(null)
                if (x.tempPassword) setTemp({ name: v.name, password: x.tempPassword })
              },
            )
          }
          error={error}
        />
      )}
      {dialog?.kind === 'id' && (
        <LoginIdDialog
          row={dialog.row}
          pending={pending}
          error={error}
          onClose={() => setDialog(null)}
          onSubmit={(id) =>
            act(
              () => changeDoctorLoginIdAction(dialog.row.id, id),
              () => setDialog(null),
            )
          }
        />
      )}
    </div>
  )
}

function AddDialog({
  pending,
  error,
  onClose,
  onSubmit,
}: {
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (v: { loginId: string; name: string; admin: boolean }) => void
}) {
  const [loginId, setLoginId] = useState('')
  const [name, setName] = useState('')
  const [admin, setAdmin] = useState(false)
  return (
    <Dialog title="의사 추가" onClose={onClose}>
      <Field label="로그인 ID (생년월일 6자리 또는 사번)" required>
        <input
          className={inputCls}
          inputMode="numeric"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
        />
      </Field>
      <Field label="성명" required>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> 관리자
      </label>
      <p className="text-xs text-ink-2">임시 비밀번호가 한 번만 표시됩니다. 첫 로그인 때 바꾸게 됩니다.</p>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={pending || !loginId.trim() || !name.trim()}
          onClick={() => onSubmit({ loginId: loginId.trim(), name: name.trim(), admin })}
        >
          추가
        </button>
      </div>
    </Dialog>
  )
}

function LoginIdDialog({
  row,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  row: StaffRow
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (id: string) => void
}) {
  const [id, setId] = useState('')
  return (
    <Dialog title={`${row.name} · 사번으로 변경`} onClose={onClose}>
      <p className="text-ink-2">
        지금 로그인 ID {row.loginId}. 바꾸면 다음 로그인부터 새 사번으로 들어옵니다. 근무·신청 기록은
        그대로입니다.
      </p>
      <Field label="새 사번" required>
        <input className={inputCls} inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} />
      </Field>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={pending || !id.trim()}
          onClick={() => onSubmit(id.trim())}
        >
          변경
        </button>
      </div>
    </Dialog>
  )
}
