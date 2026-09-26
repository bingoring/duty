import { formatMD, weekdayKo, type IsoDate } from '../dates'
import type { Violation } from './rules'

export type FormatContext = { nameOf: (userId: string) => string; month: number }

const SPECIAL_LABEL: Record<string, string> = { AL: '연차', EDU_CONT: '보수교육', EDU_UNION: '노조교육' }
const BALANCE_LABEL: Record<string, string> = {
  annual_leave: '연차',
  special_leave: '특휴',
  founding_off: '개원오프',
  checkup: '검진',
  sick_leave: '병가',
}
const OPTION_LABEL: Record<string, string> = { OFF: 'O', D: 'D', E: 'E', N: 'N' }

const range = (dates: IsoDate[]) =>
  dates.length === 0
    ? ''
    : dates.length === 1
      ? formatMD(dates[0]!)
      : `${formatMD(dates[0]!)}~${formatMD(dates.at(-1)!)}`
const withDay = (d: IsoDate | undefined) => (d ? `${formatMD(d)} (${weekdayKo(d)})` : '')

// business-logic-model §2.6. 검사기는 이름을 모르므로 표시 문구는 여기서 만든다
export function formatViolation(v: Violation, ctx: FormatContext): { title: string; detail: string } {
  const name = ctx.nameOf(v.userIds[0] ?? '')
  const names = v.userIds.map(ctx.nameOf)
  const d = v.data
  const day = withDay(v.dates[0])
  const prev = ctx.month === 1 ? 12 : ctx.month - 1
  const next = ctx.month === 12 ? 1 : ctx.month + 1

  switch (v.ruleId) {
    case 'H-CELL':
      return {
        title: `${name} · ${d.kind === 'outside' ? '재직 기간 밖 배정' : '근무 미배정'}`,
        detail: v.dates.map(formatMD).join(', '),
      }
    case 'H-PATTERN':
      return { title: `${name} · ${d.pattern} 금지 패턴`, detail: range(v.dates) }
    case 'H-REST':
      return {
        title: `${name} · 휴식 ${d.restHours}시간`,
        detail: `${formatMD(v.dates[0]!)} ${d.from} → ${formatMD(v.dates[1]!)} ${d.to} (${d.min}시간 미만)`,
      }
    case 'H-NIGHT-MAX':
      return { title: `${name} · 나이트 ${d.count}개`, detail: `월 상한 ${d.max}개` }
    case 'H-NIGHT-CONSEC':
      return { title: `${name} · 연속 나이트 ${d.count}일`, detail: `${range(v.dates)} (상한 ${d.max}일)` }
    case 'H-OFF-CONSEC':
      return { title: `${name} · 연속 오프 ${d.count}일`, detail: `${range(v.dates)} (상한 ${d.max}일)` }
    case 'H-STAFF':
      return { title: `${day} ${v.shift} 인원 ${d.count}명`, detail: `최소 ${d.min}명` }
    case 'H-KTASS':
      return { title: `${day} ${v.shift} K-tass ${d.count}명`, detail: `최소 ${d.min}명` }
    case 'H-TRAINING':
      return {
        title: `${name} · 프리셉터와 다른 근무`,
        detail: `${range(v.dates)} ${name} ${d.traineeCode} / ${names[1] ?? ''} ${d.preceptorCode}`,
      }
    case 'H-SPECIAL-REQ':
      return {
        title: `${name} · ${SPECIAL_LABEL[String(d.special)] ?? '특수'} 신청 미반영`,
        detail: range(v.dates),
      }
    case 'H-SLEEPING':
      return {
        title: `${name} · 슬리핑오프 ${d.count}개`,
        detail: `부여 가능 ${d.allowed}개 (잔여 N ${d.bank} + 이번 달 N ${d.nights})`,
      }
    case 'H-EDU-UNION':
      return {
        title: `${name} · 노조교육 배정 불가`,
        detail: `${range(v.dates)} ${d.reason === 'not_member' ? '노조원 아님' : '주말·공휴일'}`,
      }
    case 'H-EDU-LIMIT':
      return {
        title: `${name} · ${d.kind === 'edu_union' ? '노조교육' : '보수교육'} 연 ${d.used}회`,
        detail: `연 ${d.limit}회까지 (${v.dates.map(formatMD).join(', ')})`,
      }
    case 'H-BALANCE':
      return {
        title: `${name} · ${BALANCE_LABEL[String(d.account)] ?? String(d.account)} 잔여 초과`,
        detail: `이번 달 ${d.used}일 사용 / 잔여 ${d.remaining}일`,
      }
    case 'S-NIGHT-TARGET':
      return { title: `${name} · 나이트 ${d.count}개`, detail: `목표 ${d.target}개 이하` }
    case 'S-OFF-AFTER-N':
      return { title: `${name} · N-OFF-${d.next} 1회`, detail: range(v.dates) }
    case 'S-WEEKEND-PAIR':
      return {
        title: `${name} · 주말 연휴 OFF 미배정`,
        detail:
          Number(d.missedStreak) > 0
            ? `${Number(d.missedStreak) + 1}개월 연속 미배정 → ${next}월 최우선`
            : `${next}월 우선 대상`,
      }
    case 'S-WEEKEND-CARRY':
      return {
        title: `${name} · ${formatMD(v.dates[1] ?? '')} OFF 필요`,
        detail: `${formatMD(v.dates[0] ?? '')}(토) OFF와 이어져야 ${prev}월 주말 연휴 OFF가 완성됩니다`,
      }
    case 'S-SHIFT-BALANCE':
      return {
        title: `${name} · ${d.scope === 'window' ? `최근 ${d.months}개월 ` : ''}D ${d.D} · E ${d.E} · N ${d.N}`,
        detail: `D·E·N 차이 ${d.spread}개 (허용 ${d.tolerance}개)`,
      }
    case 'S-HEAD-FILL':
      return {
        title: `${day} ${v.shift} 수간호사로 인원 충족`,
        detail: `교대 근무자 ${d.count}명 · K-tass ${d.kTass}명 (최후의 수단)`,
      }
    case 'S-JUNIOR-ONLY':
      return { title: `${day} ${v.shift} 저연차만 배정`, detail: names.join(', ') }
    case 'S-REPEAT-PAIR':
      return { title: `${names.join('·')} · 같은 근무 ${d.count}회`, detail: `경고 기준 ${d.threshold}회` }
    case 'S-REQUEST': {
      const opts = String(d.options ?? '')
        .split('/')
        .map((o) => OPTION_LABEL[o] ?? o)
        .join('/')
      return { title: `${name} · 신청 불충족`, detail: `${range(v.dates)} 신청 ${opts} → 배정 ${d.code}` }
    }
  }
}
