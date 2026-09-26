import {
  normalizePattern,
  PATTERN_REGEX,
  type RuleParams,
  type RuleSet,
  type RuleToggles,
} from './rules-defaults'

// Build Spec 2-4 domain-entities §4 — S11 규칙 설정의 편집 항목과 범위
export type RuleKind = '필수' | '권고' | '운영'
export type RuleGroup = '근무·휴식' | '나이트' | '인원·신규' | '공정성' | '교육' | '야간 전담' | '운영'

export type RuleParamLimit = {
  key: keyof RuleParams
  label: string
  kind: RuleKind
  unit: string
  desc: string
  min: number
  max: number
  group: RuleGroup
}

const p = (
  key: keyof RuleParams,
  label: string,
  kind: RuleKind,
  unit: string,
  min: number,
  max: number,
  group: RuleGroup,
  desc = '',
): RuleParamLimit => ({ key, label, kind, unit, desc, min, max, group })

// negotiationEndDay는 negotiationStartDay 행에서 함께 편집한다
export const RULE_PARAM_LIMITS: RuleParamLimit[] = [
  p(
    'minRestHours',
    '근무 간 최소 휴식',
    '필수',
    '시간',
    8,
    24,
    '근무·휴식',
    '서로 다른 근무가 이어질 때 보장하는 휴식',
  ),
  p(
    'maxConsecutiveOff',
    '최대 연속 오프',
    '필수',
    '일',
    5,
    31,
    '근무·휴식',
    'OFF·연차 합산. 휴가(경조·병가·공가)는 세지 않되 연속은 이어짐',
  ),
  p('workDaysPerWeek', '주 근무일', '필수', '일', 1, 7, '근무·휴식', '주휴일 2일 기준(월 기준 OFF로 맞춤)'),
  p('maxNightPerMonth', '월 나이트 상한', '필수', '개', 1, 31, '나이트', '최대값'),
  p('targetNightPerMonth', '월 나이트 목표', '권고', '개', 1, 31, '나이트', '이 수를 넘으면 경고'),
  p('maxConsecutiveNight', '연속 나이트 상한', '필수', '일', 1, 7, '나이트'),
  p('offAfterNight', 'N 후 OFF', '권고', '개', 0, 4, '나이트', '불가피 시 N-OFF-E 허용'),
  p('sleepingOffPerN', '슬리핑오프 기준 N', '필수', '개', 1, 12, '나이트', '누적 N마다 OFF 1'),
  p('minStaffPerShift', '듀티당 최소 인원', '필수', '명', 1, 10, '인원·신규', 'D·E·N 각각'),
  p('minKTass', 'K-tass 권한자', '필수', '명 이상', 0, 5, '인원·신규', '듀티마다'),
  p('trainingMonths', '신규 트레이닝 기간', '필수', '개월', 1, 12, '인원·신규', '프리셉터와 같은 근무'),
  p('newbieTripleWeeks', '3인 배정 기간(완전 신규)', '필수', '주', 0, 12, '인원·신규', '트레이닝 시작 후'),
  p(
    'experiencedTripleWeeks',
    '3인 배정 기간(경력자)',
    '필수',
    '주',
    0,
    12,
    '인원·신규',
    '타 병원 경력 간호사',
  ),
  p(
    'tripleNightCount',
    '기간 뒤 3인 나이트',
    '필수',
    '개',
    0,
    10,
    '인원·신규',
    '3인 배정 기간 뒤 처음 서는 N',
  ),
  p('shiftBalanceTolerance', 'D·E·N 차이 허용', '권고', '개', 0, 10, '공정성', '한 사람의 D·E·N 개수 차이'),
  p('shiftBalanceWindowMonths', 'D·E·N 누적 기간', '권고', '개월', 1, 12, '공정성', '이번 달 포함'),
  p('eduContPerYear', '보수교육', '필수', '회/년', 0, 5, '교육', 'OFF로 배정'),
  p('eduUnionPerYear', '노조교육', '필수', '회/년', 0, 5, '교육', '평일, 노조원만'),
  p(
    'nightDedicatedMaxPerMonth',
    '야간 전담 월 상한',
    '필수',
    '일',
    1,
    31,
    '야간 전담',
    '야간 전담 운영을 켰을 때',
  ),
  p('nightDedicatedMaxPerMonth31', '야간 전담 월 상한(31일 달)', '필수', '일', 1, 31, '야간 전담'),
  p('nightDedicatedMinMonths', '야간 전담 최소 기간', '필수', '개월', 1, 12, '야간 전담'),
  p('nightDedicatedMaxMonths', '야간 전담 최대 기간', '필수', '개월', 1, 12, '야간 전담'),
  p('requestDeadlineDay', '근무 신청 마감', '운영', '일', 1, 28, '운영', '매월'),
  p('negotiationStartDay', '협의 수정 기간', '운영', '일', 1, 31, '운영', '마감 다음 날부터'),
]

export const RULE_TOGGLE_DEFS: { key: keyof RuleToggles; label: string; desc: string }[] = [
  {
    key: 'weekendPairOffMonthly',
    label: '모든 간호사 월 1회 주말 이틀 통 OFF',
    desc: '토·일 연속 OFF. 불가능한 사람은 다음 달 최우선',
  },
  { key: 'avoidJuniorOnly', label: '저연차만 배정 방지', desc: '듀티마다 저연차(연차 구분)만 서지 않도록' },
  { key: 'minimizeRepeatPairs', label: '특정 근무자 반복 겹침 최소화', desc: '트레이닝 기간 제외' },
  {
    key: 'nightDedicated',
    label: '야간 전담 운영',
    desc: '응급실은 사용 안 함 · 켜면 월 15일(31일 달 16일) 상한',
  },
  { key: 'balanceShiftTypes', label: 'D·E·N 고르게', desc: '한 사람의 D·E·N 차이가 허용치를 넘으면 경고' },
]

export type RuleError = { key: keyof RuleParams | 'forbiddenPatterns'; message: string }

// R-RULE-EDIT-1·2
export function validateRuleSet(rules: RuleSet): RuleError[] {
  const v = rules.params
  const errors: RuleError[] = []
  const add = (key: RuleError['key'], message: string) => {
    if (!errors.some((e) => e.key === key)) errors.push({ key, message })
  }
  const limits = [
    ...RULE_PARAM_LIMITS,
    p('negotiationEndDay', '협의 수정 기간 끝', '운영', '일', 1, 31, '운영'),
  ]
  for (const l of limits) {
    const x = v[l.key]
    if (!Number.isInteger(x)) add(l.key, `${l.label}은 정수여야 합니다.`)
    else if (x < l.min || x > l.max) add(l.key, `${l.label}은 ${l.min}~${l.max}${l.unit} 사이여야 합니다.`)
  }
  if (v.targetNightPerMonth > v.maxNightPerMonth)
    add('targetNightPerMonth', '월 나이트 목표는 상한 이하여야 합니다.')
  if (v.minKTass > v.minStaffPerShift) add('minKTass', 'K-tass 권한자는 듀티당 최소 인원 이하여야 합니다.')
  if (v.negotiationStartDay <= v.requestDeadlineDay || v.negotiationStartDay > v.negotiationEndDay)
    add('negotiationStartDay', '협의 수정 기간은 신청 마감 다음 날 이후이고 시작 ≤ 끝이어야 합니다.')
  if (v.nightDedicatedMaxPerMonth31 < v.nightDedicatedMaxPerMonth)
    add('nightDedicatedMaxPerMonth31', '31일 달 상한은 월 상한 이상이어야 합니다.')
  if (v.nightDedicatedMaxMonths < v.nightDedicatedMinMonths)
    add('nightDedicatedMaxMonths', '야간 전담 최대 기간은 최소 기간 이상이어야 합니다.')
  if (!rules.forbiddenPatterns.every((x) => PATTERN_REGEX.test(normalizePattern(x))))
    add('forbiddenPatterns', "D·E·N·S·OFF를 '-'로 두 개 이상 이어 주세요. 예: E-D")
  return errors
}

export type RuleDiff = { key: string; before: unknown; after: unknown }

// R-RULE-SAVE-1: 바뀐 항목만. 금지 패턴은 순서와 무관하게 비교
export function diffRuleSets(before: RuleSet, after: RuleSet): RuleDiff[] {
  const out: RuleDiff[] = []
  for (const k of Object.keys(after.params) as (keyof RuleParams)[])
    if (before.params[k] !== after.params[k])
      out.push({ key: k, before: before.params[k], after: after.params[k] })
  for (const k of Object.keys(after.toggles) as (keyof RuleToggles)[])
    if (before.toggles[k] !== after.toggles[k])
      out.push({ key: k, before: before.toggles[k], after: after.toggles[k] })
  const a = [...before.forbiddenPatterns].sort().join()
  const b = [...after.forbiddenPatterns].sort().join()
  if (a !== b)
    out.push({
      key: 'forbiddenPatterns',
      before: before.forbiddenPatterns.join(', '),
      after: after.forbiddenPatterns.join(', '),
    })
  return out
}
