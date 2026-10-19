'use client'

import {
  CHECKUP_HALVES,
  FAMILY_LEAVE_DAYS,
  OFFICIAL_LEAVE_REASONS,
  addDays,
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
  ['founding', '개원기념 OFF'],
]

// 종료일을 고르지 않는 종류: 경조사(사유 일수), 검진·개원기념 OFF(하루)
const autoEnd = (t: LeaveType) => t === 'family' || t === 'checkup' || t === 'founding'

type Mode = 'shift' | 'leave' | 'edu'

export function RequestPopover({
  userId,
  userName,
  head = false,
  cell,
  sameDay,
  mode: allowed,
  isAdmin,
  proposal = false,
  own = true,
  onClose,
}: {
  userId: string
  userName: string
  // 2-11 R-HEAD-2: 수간호사는 OFF·D 중 하나만
  head?: boolean
  cell: RequestCellDTO
  sameDay: string
  mode: 'all' | 'leave'
  isAdmin: boolean
  // 3-5: 관리자가 다른 간호사의 OFF를 휴가로 바꾸면 간호사가 수락해야 한다
  proposal?: boolean
  // 3-9 14: 관리자가 남의 칸을 열었는지(남이 직접 넣은 신청은 지우지 못한다)
  own?: boolean
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

  // 3-9 2: 같은 날 신청·휴가가 있으면 서버가 「바꿀까요?」를 돌려준다 → 확인하면 바꿔서 다시 보낸다
  const run = (fn: (replace: boolean) => Promise<{ ok: boolean; message?: string; needsReplace?: true }>) =>
    start(async () => {
      let r = await fn(false)
      if (!r.ok && r.needsReplace && window.confirm(r.message ?? '바꿀까요?')) r = await fn(true)
      if (r.ok) onClose()
      else if (!r.needsReplace) setError(r.message ?? '저장하지 못했습니다.')
    })
  // 3-8: OFF만 신청하면 전날 N이 빠지므로, 전날 N이 가능한 사람은 전날 신청을 전부 고르도록 안내
  const eve = formatMD(addDays(cell.date, -1))
  const confirmOffEve = () =>
    mode !== 'shift' ||
    options.length !== 1 ||
    options[0] !== 'OFF' ||
    window.confirm(
      `OFF를 신청한 날의 전날(${eve})에는 N 근무를 주지 않습니다.\n전날(${eve}) N 근무가 가능하다면 전날 근무 신청을 D·E·N·OFF 모두 선택해 주세요.\n\n확인을 누르면 OFF 신청을 저장합니다.`,
    )
  const save = () =>
    confirmOffEve() &&
    run((replace) =>
      mode === 'leave'
        ? saveLeaveAction({
            userId,
            type,
            startDate: cell.date,
            ...(reason ? { reasonCode: reason } : {}),
            ...(!autoEnd(type) ? { endDate: end } : {}),
            comment,
            ...(replace ? { replaceShift: true } : {}),
          })
        : saveShiftRequestAction({
            userId,
            date: cell.date,
            options: mode === 'edu' ? [] : options,
            ...(mode === 'edu' ? { special: edu } : {}),
            comment,
            ...(replace ? { replaceLeave: true } : {}),
          }),
    )

  const toggle = (o: RequestOption) =>
    setOptions(options.includes(o) ? options.filter((x) => x !== o) : head ? [o] : [...options, o])
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
      note={head ? '평일 기본 S · OFF 또는 D 하나' : '근무는 복수 선택 · or'}
      onClose={onClose}
    >
      <div className={`grid gap-1.5 ${head ? 'grid-cols-2' : 'grid-cols-4'}`}>
        {(head ? (['OFF', 'D'] as const) : (['OFF', 'D', 'E', 'N'] as const)).map((o) => (
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
          {type === 'checkup' && (
            <div className="flex flex-col gap-1 text-xs text-ink-2">
              검진 시간 (나머지 반나절은 근무)
              <div className="flex gap-1.5" role="radiogroup" aria-label="검진 시간">
                {Object.entries(CHECKUP_HALVES).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={reason === k}
                    className={`cursor-pointer rounded-md px-2.5 py-1 text-xs ${
                      reason === k ? 'border border-ink bg-app font-bold' : 'border border-line bg-surface'
                    }`}
                    onClick={() => setReason(k)}
                  >
                    {l} · {k === 'am' ? '오후 근무' : '오전 근무'}
                  </button>
                ))}
              </div>
            </div>
          )}
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
              {autoEnd(type) ? '종료일 (자동)' : '종료일'}
              {autoEnd(type) ? (
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
        {cell.kind === 'shift' && (own || !isAdmin || cell.byAdmin) && (
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
          {proposal && mode === 'leave' ? '휴가로 바꾸기' : isAdmin ? '저장' : '임시 저장'}
        </button>
      </div>
      {proposal && mode === 'leave' && (
        <div className="text-xs text-ink-2">
          {userName} 간호사의 OFF가 바로 휴가로 바뀝니다(파란 표시). 근무(D·E·N)로는 바꿀 수 없습니다.
        </div>
      )}
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
