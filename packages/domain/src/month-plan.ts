import type { MonthPlanStatus } from './allowed-sets'
import { daysInMonth, isoOf, monthDates, prevMonth, type IsoDate } from './dates'
import type { RuleParams } from './rules-defaults'

export const PLAN_EVENTS = ['CLOSE_REQUESTS', 'GENERATE', 'CONFIRM', 'ADJUST', 'CLOSE', 'REOPEN'] as const
export type PlanEvent = (typeof PLAN_EVENTS)[number]

export class PlanTransitionError extends Error {
  override name = 'PlanTransitionError'
}

// R-PLAN-1: 전월의 마감일·협의 기간. 전월 말일을 넘으면 말일
export function defaultPlanDates(year: number, month: number, params: RuleParams) {
  const p = prevMonth(year, month)
  const last = daysInMonth(p.year, p.month)
  const at = (day: number) => isoOf(p.year, p.month, Math.min(day, last))
  return {
    requestDeadline: at(params.requestDeadlineDay),
    negotiationStart: at(params.negotiationStartDay),
    negotiationEnd: at(params.negotiationEndDay),
  }
}

const TRANSITIONS: Partial<Record<MonthPlanStatus, Partial<Record<PlanEvent, MonthPlanStatus>>>> = {
  REQUESTING: { CLOSE_REQUESTS: 'REQUEST_CLOSED' },
  REQUEST_CLOSED: { GENERATE: 'DRAFTING' },
  DRAFTING: { GENERATE: 'DRAFTING', CONFIRM: 'CONFIRMED' },
  CONFIRMED: { ADJUST: 'CONFIRMED', CLOSE: 'CLOSED' },
  CLOSED: { REOPEN: 'CONFIRMED' },
}

// 1-2 §3. 하드 위반 0 확인(CONFIRM·ADJUST)은 호출자가 한다
export function nextPlanStatus(
  status: MonthPlanStatus,
  event: PlanEvent,
  ctx: { today: IsoDate; year: number; month: number },
): MonthPlanStatus {
  const next = TRANSITIONS[status]?.[event]
  if (!next) throw new PlanTransitionError(`${status}에서 ${event}를 할 수 없습니다`)
  if (event === 'CLOSE' && ctx.today <= monthDates(ctx.year, ctx.month).at(-1)!)
    throw new PlanTransitionError('대상 월이 끝난 뒤에 마감할 수 있습니다')
  return next
}

// 3-8: 관리자가 확정하기 전까지는 신청할 수 있다(마감 뒤·생성안 검토 중에도). 마감일은 생성을 시작할 수 있는 날일 뿐
export function canNurseEditRequests(status: MonthPlanStatus, _requestDeadline?: IsoDate, _today?: IsoDate) {
  return status === 'REQUESTING' || status === 'REQUEST_CLOSED' || status === 'DRAFTING'
}
