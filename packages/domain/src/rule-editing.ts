import {
  normalizePattern,
  PATTERN_REGEX,
  type RuleParams,
  type RuleSet,
  type RuleToggles,
} from './rules-defaults'
import { SEVERITY_KEYS, SEVERITY_LABEL, type SeverityKey } from './rule-severity'

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
  // 3-5: 이 수치가 정하는 규칙의 필수/권고 키. 없으면 운영 값(신청 마감 등)이나 검사에 쓰지 않는 설정
  severityKey?: SeverityKey
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
): RuleParamLimit => {
  const severityKey = PARAM_SEVERITY_KEY[key]
  return { key, label, kind, unit, desc, min, max, group, ...(severityKey ? { severityKey } : {}) }
}

// 3-5: 수치 → 그 수치가 정하는 규칙. 같은 키를 가진 행은 필수/권고를 함께 바꾼다
const PARAM_SEVERITY_KEY: Partial<Record<keyof RuleParams, SeverityKey>> = {
  minRestHours: 'REST',
  maxConsecutiveOff: 'OFF_CONSEC',
  maxConsecutiveWork: 'WORK_CONSEC',
  maxNightPerMonth: 'NIGHT_MAX',
  minNightPerMonth: 'NIGHT_MIN',
  maxConsecutiveNight: 'NIGHT_CONSEC',
  offAfterNight: 'OFF_AFTER_N',
  sleepingOffPerN: 'SLEEPING',
  minStaffPerShift: 'STAFF',
  maxStaffPerShift: 'STAFF_MAX',
  // 3-10 7: 최소·최대는 필수/권고를 따로
  offCarryMin: 'OFF_CARRY_MIN',
  offCarryMax: 'OFF_CARRY_MAX',
  minKTass: 'KTAS',
  trainingMonths: 'TRAINING',
  newbieTripleWeeks: 'STAFF',
  experiencedTripleWeeks: 'STAFF',
  tripleNightCount: 'STAFF',
  shiftBalanceTolerance: 'SHIFT_BALANCE',
  shiftBalanceWindowMonths: 'SHIFT_BALANCE',
  eduContPerYear: 'EDU_LIMIT',
  eduUnionPerYear: 'EDU_LIMIT',
  nightDedicatedMaxPerMonth: 'NIGHT_MAX',
  nightDedicatedMaxPerMonth31: 'NIGHT_MAX',
}

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
  // 「주 근무일」은 어디에도 쓰이지 않아 뺐다(한 달 OFF 수는 빨간 날 기준). 대신 연속 근무 상한(R-1, DECISIONS 2026-10-08)
  p('maxConsecutiveWork', '최대 연속 근무', '필수', '일', 3, 14, '근무·휴식', 'D·E·N·S 연속'),
  p('maxNightPerMonth', '월 나이트 상한', '필수', '개', 1, 31, '나이트', '최대값'),
  // 3-10 12: 「월 나이트 목표」는 없앴다(상한·하한만)
  p(
    'minNightPerMonth',
    '월 나이트 하한',
    '권고',
    '개',
    0,
    31,
    '나이트',
    '0이면 사용 안 함 · 휴가·입사로 근무할 수 있는 날이 적으면 그만큼 줄임',
  ),
  p('maxConsecutiveNight', '연속 나이트 상한', '필수', '일', 1, 7, '나이트'),
  p('offAfterNight', 'N 후 OFF', '권고', '개', 0, 4, '나이트', '불가피 시 N-OFF-E 허용'),
  p('sleepingOffPerN', '슬리핑오프 기준 N', '필수', '개', 1, 12, '나이트', '누적 N마다 OFF 1'),
  p('minStaffPerShift', '듀티당 최소 인원', '필수', '명', 1, 10, '인원·신규', 'D·E·N 각각'),
  p(
    'maxStaffPerShift',
    '듀티당 최대 인원',
    '필수',
    '명',
    1,
    10,
    '인원·신규',
    'D·E·N 각각 · 넘는 사람은 OFF · 3인 배정 기간 신규·수간호사 S는 세지 않음',
  ),
  p(
    'offCarryMin',
    '누적 OFF 최소',
    '필수',
    '개',
    -31,
    0,
    '공정성',
    '월말 누적 OFF가 이보다 작으면 안 됨 (예: −3)',
  ),
  p(
    'offCarryMax',
    '누적 OFF 최대',
    '필수',
    '개',
    0,
    31,
    '공정성',
    '월말 누적 OFF가 이보다 크면 안 됨 (예: +3)',
  ),
  p('minKTass', 'KTAS 권한자', '필수', '명 이상', 0, 5, '인원·신규', '듀티마다'),
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

export const RULE_TOGGLE_DEFS: {
  key: keyof RuleToggles
  label: string
  desc: string
  severityKey?: SeverityKey
}[] = [
  {
    key: 'weekendPairOffMonthly',
    label: '모든 간호사 월 1회 주말 이틀 통 OFF',
    desc: '토·일 연속 OFF. 불가능한 사람은 다음 달 최우선',
    severityKey: 'WEEKEND_PAIR',
  },
  {
    key: 'avoidJuniorOnly',
    label: '동일듀티 저연차끼리 배정 방지',
    desc: '같은 듀티에 저연차(연차 구분)끼리만 서지 않도록',
    severityKey: 'JUNIOR_ONLY',
  },
  {
    key: 'minimizeRepeatPairs',
    label: '특정 근무자 반복 겹침 최소화',
    desc: '트레이닝 기간 제외',
    severityKey: 'REPEAT_PAIR',
  },
  {
    key: 'nightDedicated',
    label: '야간 전담 운영',
    desc: '응급실은 사용 안 함 · 켜면 월 15일(31일 달 16일) 상한',
  },
  {
    key: 'avoidNightRestart',
    label: 'N 뒤 다시 일할 때 D·E로',
    desc: 'N을 마치고 1~3일 쉰 뒤 다시 N으로 시작하지 않게',
    severityKey: 'NIGHT_RESTART',
  },
  {
    key: 'offEveNoNight',
    label: '신청 OFF 전날 N 금지',
    desc: 'OFF만 신청한 날의 전날은 D·E·OFF. 전날 신청에 N이 있으면 예외',
    severityKey: 'OFF_EVE',
  },
  {
    key: 'balanceShiftTypes',
    label: 'D·E·N 고르게',
    desc: '한 사람의 D·E·N 차이가 허용치를 넘지 않게',
    severityKey: 'SHIFT_BALANCE',
  },
]

export type RuleError = { key: keyof RuleParams | 'forbiddenPatterns' | 'softPatterns'; message: string }

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
  if (v.minNightPerMonth > v.maxNightPerMonth)
    add('minNightPerMonth', '월 나이트 하한은 상한 이하여야 합니다.')
  if (v.minKTass > v.minStaffPerShift) add('minKTass', 'KTAS 권한자는 듀티당 최소 인원 이하여야 합니다.')
  if (v.maxStaffPerShift < v.minStaffPerShift)
    add('maxStaffPerShift', '듀티당 최대 인원은 최소 인원 이상이어야 합니다.')
  if (v.negotiationStartDay <= v.requestDeadlineDay || v.negotiationStartDay > v.negotiationEndDay)
    add('negotiationStartDay', '협의 수정 기간은 신청 마감 다음 날 이후이고 시작 ≤ 끝이어야 합니다.')
  if (v.nightDedicatedMaxPerMonth31 < v.nightDedicatedMaxPerMonth)
    add('nightDedicatedMaxPerMonth31', '31일 달 상한은 월 상한 이상이어야 합니다.')
  if (v.nightDedicatedMaxMonths < v.nightDedicatedMinMonths)
    add('nightDedicatedMaxMonths', '야간 전담 최대 기간은 최소 기간 이상이어야 합니다.')
  if (!rules.forbiddenPatterns.every((x) => PATTERN_REGEX.test(normalizePattern(x))))
    add('forbiddenPatterns', "D·E·N·S·OFF를 '-'로 두 개 이상 이어 주세요. 예: E-D")
  // 3-10 11: 금지 권고 패턴 — 같은 문법, 금지 패턴과 겹치면 안 된다
  const soft = rules.softPatterns ?? []
  if (!soft.every((x) => PATTERN_REGEX.test(normalizePattern(x))))
    add('softPatterns', "D·E·N·S·OFF를 '-'로 두 개 이상 이어 주세요. 예: OFF-D-OFF")
  else {
    const hard = new Set(rules.forbiddenPatterns.map(normalizePattern))
    const both = soft.map(normalizePattern).filter((x) => hard.has(x))
    if (both.length) add('softPatterns', `${both.join(', ')}은 금지 패턴에 이미 있습니다.`)
  }
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
  for (const k of SEVERITY_KEYS)
    if (before.severity[k] !== after.severity[k])
      out.push({
        key: `severity.${k}`,
        before: SEVERITY_LABEL[before.severity[k]],
        after: SEVERITY_LABEL[after.severity[k]],
      })
  const a = [...before.forbiddenPatterns].sort().join()
  const b = [...after.forbiddenPatterns].sort().join()
  if (a !== b)
    out.push({
      key: 'forbiddenPatterns',
      before: before.forbiddenPatterns.join(', '),
      after: after.forbiddenPatterns.join(', '),
    })
  const sa = [...(before.softPatterns ?? [])].sort().join()
  const sb = [...(after.softPatterns ?? [])].sort().join()
  if (sa !== sb)
    out.push({
      key: 'softPatterns',
      before: (before.softPatterns ?? []).join(', '),
      after: (after.softPatterns ?? []).join(', '),
    })
  return out
}

const PATTERN_MESSAGE = "D·E·N·S·OFF를 '-'로 두 개 이상 이어 주세요. 예: E-D"

// 금지 패턴 입력 검사: 정규화 후 문법·중복 확인. 화면에서 칩을 추가하기 전에 쓴다
// 3-10 11: other = 다른 목록(금지 ↔ 금지 권고). 한 패턴은 두 목록 중 하나에만 둔다
export function parsePatternInput(
  raw: string,
  existing: readonly string[] = [],
  other?: { patterns: readonly string[]; label: string },
): { ok: true; pattern: string } | { ok: false; message: string } {
  const pattern = normalizePattern(raw)
  if (!PATTERN_REGEX.test(pattern)) return { ok: false, message: PATTERN_MESSAGE }
  if (existing.includes(pattern)) return { ok: false, message: '이미 있는 패턴입니다.' }
  if (other?.patterns.includes(pattern)) return { ok: false, message: `${other.label}에 이미 있습니다.` }
  return { ok: true, pattern }
}
