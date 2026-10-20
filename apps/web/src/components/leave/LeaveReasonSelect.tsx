'use client'

import { FAMILY_LEAVE_DAYS, OFFICIAL_LEAVE_REASONS, type LeaveType } from '@duty/domain'
import { FAMILY_REASON_LABEL } from '@/server/requests/dto'

// 3-10 5: 경조·공가 사유 선택 — 휴가 신청 팝업과 근무 조정 도크가 같은 목록을 쓴다
export const needsLeaveReason = (type: LeaveType) => type === 'family' || type === 'official'

export const leaveReasonName = (type: LeaveType) => (type === 'family' ? '경조사 사유' : '공가 사유')

export function LeaveReasonOptions({ type }: { type: LeaveType }) {
  return (
    <>
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
    </>
  )
}

export function LeaveReasonSelect(props: {
  type: LeaveType
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  if (!needsLeaveReason(props.type)) return null
  return (
    <select
      aria-label={leaveReasonName(props.type)}
      className={props.className}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <LeaveReasonOptions type={props.type} />
    </select>
  )
}
