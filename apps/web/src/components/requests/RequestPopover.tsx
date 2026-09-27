'use client'

import {
  FAMILY_LEAVE_DAYS,
  OFFICIAL_LEAVE_REASONS,
  formatMD,
  leaveDays,
  leaveEnd,
  weekdayKo,
  type LeaveType,
  type RequestOption,
} from '@duty/domain'
import { useState, useTransition } from 'react'
import {
  cancelLeaveAction,
  deleteShiftRequestAction,
  saveLeaveAction,
  saveShiftRequestAction,
} from '@/server/requests/actions'
import { FAMILY_REASON_LABEL, type RequestCellDTO } from '@/server/requests/dto'

// S4 셀 팝오버 + S5 휴가 (Build Spec 2-5 frontend-components §2, 핸드오프 2a·3b)
const SHIFT_BG: Record<RequestOption, string> = {
  OFF: 'bg-shift-off',
  D: 'bg-shift-d',
  E: 'bg-shift-e',
  N: 'bg-shift-n',
}
const LEAVE_TYPES: [LeaveType, string][] = [
  ['annual', '연차'],
  ['family', '경조사'],
  ['sick', '병가'],
  ['official', '공가'],
  ['special', '특별휴가'],
  ['checkup', '검진'],
]

type Mode = 'shift' | 'leave' | 'edu'

export function RequestPopover({
  userId,
  userName,
  cell,
  sameDay,
  mode: allowed,
  isAdmin,
  onClose,
}: {
  userId: string
  userName: string
  cell: RequestCellDTO
  sameDay: string
  mode: 'all' | 'leave'
  isAdmin: boolean
  onClose: () => void
}) {
  const initialMode: Mode =
    cell.kind === 'leave' || allowed === 'leave' ? 'leave' : cell.special ? 'edu' : 'shift'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [options, setOptions] = useState<RequestOption[]>(cell.options ?? [])
  const [edu, setEdu] = useState<'EDU_CONT' | 'EDU_UNION'>((cell.special as 'EDU_UNION') ?? 'EDU_CONT')
  const [type, setType] = useState<LeaveType>('annual')
  const [reason, setReason] = useState('')
  const [end, setEnd] = useState(cell.date)
  const [comment, setComment] = useState(cell.comment ?? '')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const leave = cell.leave
  const endDate = leaveEnd(type, cell.date, reason || undefined, end)
  const summary = endDate
    ? `${formatMD(cell.date)}${endDate !== cell.date ? `–${formatMD(endDate).split('/')[1]}` : ''} · ${leaveDays(type, cell.date, endDate, reason || undefined)}일 · 유급`
    : ''

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn()
      if (r.ok) onClose()
      else setError(r.message ?? '저장하지 못했습니다.')
    })
  const save = () =>
    run(() =>
      mode === 'leave'
        ? saveLeaveAction({
            userId,
            type,
            startDate: cell.date,
            ...(reason ? { reasonCode: reason } : {}),
            ...(type !== 'family' && type !== 'checkup' ? { endDate: end } : {}),
            comment,
          })
        : saveShiftRequestAction({
            userId,
            date: cell.date,
            options: mode === 'edu' ? [] : options,
            ...(mode === 'edu' ? { special: edu } : {}),
            comment,
          }),
    )

  const toggle = (o: RequestOption) =>
    setOptions(options.includes(o) ? options.filter((x) => x !== o) : [...options, o])
  const chipBtn = (active: boolean) =>
    `cursor-pointer rounded-md px-3 py-1.5 text-xs ${active ? 'border-2 border-ink font-bold' : 'border border-line bg-surface text-ink-2'}`

  if (leave) {
    return (
      <Shell title={`${formatMD(cell.date)} (${weekdayKo(cell.date)}) · ${userName}`} onClose={onClose}>
        <div className="flex flex-col gap-1">
          <div className="font-bold">{leave.kindLabel}</div>
          <div className="text-ink-2">
            {formatMD(leave.startDate)}
            {leave.endDate !== leave.startDate ? `–${formatMD(leave.endDate)}` : ''} · {leave.days}일 ·{' '}
            {{ DRAFT: '제출 전', SUBMITTED: '승인 대기', APPROVED: '승인됨', REJECTED: '반려됨' }[
              leave.status
            ] ?? leave.status}
          </div>
          {leave.rejectReason && <div className="text-danger">반려 사유: {leave.rejectReason}</div>}
          {cell.comment && (
            <div className="rounded-md bg-panel px-2 py-1.5 text-xs text-ink-2">{cell.comment}</div>
          )}
        </div>
        {error && (
          <div role="alert" className="text-xs text-danger">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs"
            onClick={onClose}
          >
            닫기
          </button>
          {['DRAFT', 'SUBMITTED'].includes(leave.status) || (isAdmin && leave.status === 'APPROVED') ? (
            <button
              type="button"
              disabled={pending}
              className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs text-danger"
              onClick={() => run(() => cancelLeaveAction(leave.id))}
            >
              휴가 취소
            </button>
          ) : null}
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      title={`${formatMD(cell.date)} (${weekdayKo(cell.date)}) · 신청`}
      note="근무는 복수 선택 · or"
      onClose={onClose}
    >
      <div className="grid grid-cols-4 gap-1.5">
        {(['OFF', 'D', 'E', 'N'] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={mode === 'shift' && options.includes(o)}
            disabled={allowed !== 'all'}
            className={`h-9 cursor-pointer rounded-lg font-bold text-ink disabled:cursor-default ${SHIFT_BG[o]} ${
              mode === 'shift' && options.includes(o)
                ? 'border-2 border-ink'
                : 'border-2 border-transparent opacity-50'
            }`}
            // 휴가·교육을 고른 상태에서 근무 토글을 누르면 근무 신청으로 돌아간다(핸드오프 3b)
            onClick={() => (mode === 'shift' ? toggle(o) : (setMode('shift'), setOptions([o])))}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          className={`${chipBtn(mode === 'leave')} ${mode === 'leave' ? 'bg-shift-leave' : ''}`}
          onClick={() => setMode(mode === 'leave' && allowed === 'all' ? 'shift' : 'leave')}
        >
          휴가
        </button>
        {allowed === 'all' && (
          <button
            type="button"
            className={chipBtn(mode === 'edu')}
            onClick={() => setMode(mode === 'edu' ? 'shift' : 'edu')}
          >
            교육 (보수·노조)
          </button>
        )}
      </div>
      {mode === 'edu' && (
        <div className="flex gap-4 text-xs">
          {(
            [
              ['EDU_CONT', '보수교육'],
              ['EDU_UNION', '노조교육'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="radio" className="accent-primary" checked={edu === k} onChange={() => setEdu(k)} />
              {l}
            </label>
          ))}
        </div>
      )}
      {mode === 'leave' && (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-2.5">
          <div className="text-xs text-ink-2">휴가 종류</div>
          <div className="flex flex-wrap gap-[5px]">
            {LEAVE_TYPES.map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs ${
                  type === k ? 'border border-ink bg-app font-bold' : 'border border-line bg-surface'
                }`}
                onClick={() => (setType(k), setReason(''))}
              >
                {l}
              </button>
            ))}
          </div>
          {(type === 'family' || type === 'official') && (
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              {type === 'family' ? '경조사 사유' : '공가 사유'}
              <select
                aria-label={type === 'family' ? '경조사 사유' : '공가 사유'}
                className="h-[38px] rounded-lg border border-ink px-2 text-[13px] text-ink"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">선택</option>
                {type === 'family'
                  ? Object.entries(FAMILY_LEAVE_DAYS).map(([k, d]) => (
                      <option key={k} value={k}>
                        {FAMILY_REASON_LABEL[k]} · {d}일
                      </option>
                    ))
                  : Object.entries(OFFICIAL_LEAVE_REASONS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              시작일
              <div className="flex h-9 items-center rounded-lg border border-line px-2.5 text-[13px] text-ink">
                {formatMD(cell.date)} ({weekdayKo(cell.date)})
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-2">
              {type === 'family' || type === 'checkup' ? '종료일 (자동)' : '종료일'}
              {type === 'family' || type === 'checkup' ? (
                <div className="flex h-9 items-center rounded-lg border border-line-soft bg-panel px-2.5 text-[13px] text-ink">
                  {endDate ? `${formatMD(endDate)} (${weekdayKo(endDate)})` : '사유 선택'}
                </div>
              ) : (
                <input
                  type="date"
                  aria-label="종료일"
                  min={cell.date}
                  className="h-9 rounded-lg border border-line px-2 text-[13px] text-ink"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              )}
            </label>
          </div>
        </div>
      )}
      <textarea
        aria-label="코멘트"
        rows={2}
        placeholder="코멘트 (수간호사에게만 보입니다)"
        className="resize-none rounded-lg border border-line px-2.5 py-2 text-[12.5px] leading-[1.5]"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {sameDay && <div className="text-xs text-ink-2">같은 날 신청: {sameDay}</div>}
      {error && (
        <div role="alert" className="text-xs text-danger">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-1.5">
        {mode === 'leave' && <span className="mr-auto text-[11.5px] text-ink-2">{summary}</span>}
        <button
          type="button"
          className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs"
          onClick={onClose}
        >
          취소
        </button>
        {cell.kind === 'shift' && (
          <button
            type="button"
            disabled={pending}
            className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-3 text-xs text-danger"
            onClick={() => run(() => deleteShiftRequestAction({ userId, date: cell.date }))}
          >
            삭제
          </button>
        )}
        <button
          type="button"
          disabled={pending || (mode === 'shift' && options.length === 0)}
          className="h-8 cursor-pointer rounded-lg bg-ink px-3.5 text-xs font-semibold text-white disabled:opacity-50"
          onClick={save}
        >
          {isAdmin ? '저장' : '임시 저장'}
        </button>
      </div>
    </Shell>
  )
}

function Shell({
  title,
  note,
  onClose,
  children,
}: {
  title: string
  note?: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="flex w-[340px] flex-col gap-2.5 rounded-xl border border-ink bg-surface p-3.5 text-[13px] shadow-popover"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold">{title}</span>
        {note && <span className="text-xs text-ink-2">{note}</span>}
      </div>
      {children}
    </div>
  )
}
