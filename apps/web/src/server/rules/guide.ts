import { FAMILY_LEAVE_DAYS, OFFICIAL_LEAVE_REASONS, SHIFT_TIMES, type RuleSet } from '@duty/domain'
import { FAMILY_REASON_LABEL } from '../requests/dto'

// Build Spec 2-10 business-rules §2·§3 — S7 규칙 안내. 수치는 규칙 버전에서 렌더링한다(하드코딩 금지)
export type GuideTag = 'auto' | 'rec' | 'info' | 'off'
export type GuideItem = { text: string; tag: GuideTag; table?: [string, string][] }
export type GuideSection = { id: string; title: string; items: GuideItem[] }
export type RulesGuide = {
  version: string
  shifts: { code: 'D' | 'E' | 'N' | 'S'; time: string; desc: string }[]
  sections: GuideSection[]
}

const SHIFT_DESC = { D: 'Day', E: 'Evening', N: '휴게 1시간 포함', S: 'K-tass 교육' } as const
// 2-4 패턴 표기: OFF → off
const pattern = (p: string) => p.replace(/OFF/g, 'off')

export function buildRulesGuide(rules: RuleSet, version: number | null): RulesGuide {
  const p = rules.params
  const t = rules.toggles
  const toggled = (on: boolean): GuideTag => (on ? 'rec' : 'off')
  const shifts = (['D', 'E', 'N', 'S'] as const).map((code) => {
    const s = SHIFT_TIMES[code]
    return { code, time: `${s.start} – ${s.endsNextDay ? '익일 ' : ''}${s.end}`, desc: SHIFT_DESC[code] }
  })
  const sections: GuideSection[] = [
    {
      id: 'shift',
      title: '근무 형태 · 순환',
      items: [
        {
          text: '근무는 D, E, N 3교대이며 D → E → N 순환을 기본으로 편성합니다. 역방향(D→N, E→D, N→E)은 가능한 한 줄입니다.',
          tag: 'rec',
        },
        {
          text: '한 달의 기준 OFF는 그 달의 빨간 날(토·일·공휴일) 수입니다. 그보다 덜 쉬거나 더 쉬면 다음 달로 이월됩니다.',
          tag: 'auto',
        },
        { text: `연속 근무는 ${p.maxConsecutiveWork}일 이하로 편성합니다.`, tag: 'rec' },
        {
          text: `K-tass 교육은 S 근무(${SHIFT_TIMES.S.start}–${SHIFT_TIMES.S.end})로 배정합니다.`,
          tag: 'info',
        },
      ],
    },
    {
      id: 'rest',
      title: '휴식 · 금지 패턴',
      items: [
        { text: `서로 다른 근무 사이에는 최소 ${p.minRestHours}시간의 휴식을 보장합니다.`, tag: 'auto' },
        { text: `${rules.forbiddenPatterns.map(pattern).join(', ')} 패턴은 편성하지 않습니다.`, tag: 'auto' },
        {
          text: `연속 OFF(연차 포함)는 최대 ${p.maxConsecutiveOff}일까지 배정합니다. 경조·병가·공가는 세지 않되 연속은 이어집니다.`,
          tag: 'auto',
        },
        {
          text: `N 근무 후에는 가능한 한 OFF ${p.offAfterNight}개를 줍니다. 불가피하면 N-off-E를 허용합니다.`,
          tag: 'rec',
        },
      ],
    },
    {
      id: 'paid',
      title: '유급휴일 · 특별휴가',
      items: [
        {
          text: '유급휴일: 주휴일, 법정 공휴일, 노동절, 개원기념일 1일, 병원 지정일, 노사 협의로 정한 날.',
          tag: 'info',
        },
        {
          text: '특별휴가는 해마다 5 × 근무일수 ÷ 365일(0.5 이상 올림, 최대 5일)을 1월 1일에 부여합니다.',
          tag: 'auto',
        },
        { text: '검진 반차 0.5일을 해마다 부여합니다.', tag: 'auto' },
        { text: '개원기념일에 재직 중이면 개원기념 OFF 1일을 부여합니다.', tag: 'auto' },
      ],
    },
    {
      id: 'leave',
      title: '경조 · 병가 · 공가',
      items: [
        {
          text: '경조휴가는 유급으로 줍니다. 신청하면 사유에 따라 종료일을 자동으로 계산합니다.',
          tag: 'auto',
          table: Object.entries(FAMILY_LEAVE_DAYS).map(([k, d]) => [FAMILY_REASON_LABEL[k] ?? k, `${d}일`]),
        },
        { text: '병가는 업무 외 상병으로 요양할 때 연 60일 이내로 줍니다.', tag: 'auto' },
        {
          text: `공가: ${Object.values(OFFICIAL_LEAVE_REASONS).join(', ')}에 필요한 기간을 공가로 인정합니다.`,
          tag: 'info',
        },
      ],
    },
    {
      id: 'settle',
      title: '오프 정산 · 슬리핑오프',
      items: [
        {
          text: '기준 OFF보다 적게 쉬면 누적 OFF가 −, 많이 쉬면 +가 되어 다음 달에 더 받거나 반납합니다. 연말 정산 없이 계속 이월됩니다.',
          tag: 'auto',
        },
        {
          text: `누적 N ${p.sleepingOffPerN}개마다 슬리핑오프 1일을 줍니다. 남은 N은 연말 정산 없이 이월됩니다.`,
          tag: 'auto',
        },
        {
          text: `근무 신청은 매월 ${p.requestDeadlineDay}일까지, 협의 수정은 ${p.negotiationStartDay}–${p.negotiationEndDay}일에 합니다.`,
          tag: 'auto',
        },
        {
          text: `보수교육 연 ${p.eduContPerYear}회, 노조교육 연 ${p.eduUnionPerYear}회(평일, 노조원)는 OFF로 배정합니다.`,
          tag: 'auto',
        },
      ],
    },
    {
      id: 'night',
      title: '응급실 야간 운영',
      items: [
        {
          text: `나이트는 월 ${p.targetNightPerMonth}개 이하를 목표로, 최대 ${p.maxNightPerMonth}개로 제한합니다.`,
          tag: 'auto',
        },
        { text: `연속 나이트는 ${p.maxConsecutiveNight}일 이내로 제한합니다.`, tag: 'auto' },
        t.nightDedicated
          ? {
              text: `야간 전담은 월 ${p.nightDedicatedMaxPerMonth}일(31일 달 ${p.nightDedicatedMaxPerMonth31}일) 이내, ${p.nightDedicatedMinMonths}~${p.nightDedicatedMaxMonths}개월 연속으로 운영합니다.`,
              tag: 'auto',
            }
          : { text: '응급실은 야간 전담이 없습니다.', tag: 'off' },
      ],
    },
    {
      id: 'er',
      title: '응급실 지침',
      items: [
        {
          text: `듀티(D·E·N)마다 최소 ${p.minStaffPerShift}명, K-tass 권한자 ${p.minKTass}명 이상을 배정합니다.`,
          tag: 'auto',
        },
        { text: '저연차만으로 근무를 짜지 않도록 합니다.', tag: toggled(t.avoidJuniorOnly) },
        {
          text: '한 달에 한 번 주말 이틀(토·일)을 통으로 OFF 배정합니다. 불가능하면 다음 달 최우선으로 배정합니다.',
          tag: toggled(t.weekendPairOffMonthly),
        },
        {
          text: `신규 간호사는 ${p.trainingMonths}개월 트레이닝 동안 프리셉터와 같은 근무를 하고, 처음 ${p.newbieTripleWeeks}주(경력자 ${p.experiencedTripleWeeks}주)는 3인으로 배정합니다.`,
          tag: 'auto',
        },
        {
          text: '특정 근무자와 계속 겹치지 않도록 합니다(트레이닝 기간 제외).',
          tag: toggled(t.minimizeRepeatPairs),
        },
        {
          text: `한 사람의 D·E·N 개수 차이가 ${p.shiftBalanceTolerance}개를 넘지 않게 합니다(최근 ${p.shiftBalanceWindowMonths}개월).`,
          tag: toggled(t.balanceShiftTypes),
        },
        {
          text: '근무표에서 신청이 반영된 칸은 빨간 외곽선, 관리자가 수정한 칸은 파란 외곽선으로 표시합니다.',
          tag: 'info',
        },
      ],
    },
  ]
  return { version: version === null ? '기본 규칙' : `규칙 버전 v${version}`, shifts, sections }
}
