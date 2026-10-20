import { z } from 'zod'
import type { RuleId } from './checker/rules'

// 3-5: 규칙마다 필수(hard)/권고(soft)를 관리자가 정한다(DECISIONS 2026-10-17 — 모든 규칙, 관리자 책임).
// 검사기·솔버·화면이 모두 이 값을 따른다. 검사 코드의 H-/S- 접두사는 기본 심각도일 뿐이다.
export const SEVERITY_KEYS = [
  'REST',
  'PATTERN',
  'OFF_CONSEC',
  'WORK_CONSEC',
  'NIGHT_MAX',
  'NIGHT_MIN',
  'NIGHT_CONSEC',
  'SLEEPING',
  'OFF_AFTER_N',
  'STAFF',
  'KTAS',
  'TRAINING',
  'SHIFT_BALANCE',
  'WEEKEND_PAIR',
  'JUNIOR_ONLY',
  'REPEAT_PAIR',
  'EDU_LIMIT',
  // 3-8
  'NIGHT_RESTART',
  'OFF_EVE',
  // 3-9
  'STAFF_MAX',
  // 3-10 7: 누적 OFF 최소·최대는 필수/권고를 따로 정한다(예전 OFF_CARRY 하나를 나눔)
  'OFF_CARRY_MIN',
  'OFF_CARRY_MAX',
] as const

export type SeverityKey = (typeof SEVERITY_KEYS)[number]
export type Severity = 'hard' | 'soft'

// 최대 연속 근무는 3-5에서 필수가 기본(사용자: 권고로 두니 12일 연속이 나왔다)
export const DEFAULT_SEVERITY: Record<SeverityKey, Severity> = {
  REST: 'hard',
  PATTERN: 'hard',
  OFF_CONSEC: 'hard',
  WORK_CONSEC: 'hard',
  NIGHT_MAX: 'hard',
  NIGHT_MIN: 'soft',
  NIGHT_CONSEC: 'hard',
  SLEEPING: 'hard',
  OFF_AFTER_N: 'soft',
  STAFF: 'hard',
  KTAS: 'hard',
  TRAINING: 'hard',
  SHIFT_BALANCE: 'soft',
  WEEKEND_PAIR: 'soft',
  JUNIOR_ONLY: 'soft',
  REPEAT_PAIR: 'soft',
  EDU_LIMIT: 'hard',
  NIGHT_RESTART: 'soft',
  OFF_EVE: 'hard',
  STAFF_MAX: 'soft',
  OFF_CARRY_MIN: 'hard',
  OFF_CARRY_MAX: 'hard',
}

const SeverityValue = z.enum(['hard', 'soft'])
// 3-10: 예전 버전 호환 — OFF_CARRY(최소·최대 공통)는 둘 다에 쓰고, 없앤 NIGHT_TARGET은 버린다
function migrateSeverity(raw: unknown): unknown {
  if (raw === undefined || raw === null || typeof raw !== 'object') return raw
  const rest: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  const carry = rest.OFF_CARRY
  delete rest.OFF_CARRY
  delete rest.NIGHT_TARGET
  if (carry === undefined) return rest
  return { OFF_CARRY_MIN: carry, OFF_CARRY_MAX: carry, ...rest }
}

// 예전 규칙 버전(심각도 없음)은 기본값으로 채운다
export const RuleSeveritySchema = z.preprocess(
  migrateSeverity,
  z
    .object(
      Object.fromEntries(SEVERITY_KEYS.map((k) => [k, SeverityValue.default(DEFAULT_SEVERITY[k])])) as {
        [K in SeverityKey]: z.ZodDefault<typeof SeverityValue>
      },
    )
    .prefault({}),
)

export type RuleSeverity = z.infer<typeof RuleSeveritySchema>

// 검사 코드 → 심각도 키. 없는 코드(칸·특수 신청·노조 교육·잔여·수간호사 보충·일반 신청)는 접두사대로 고정
export const RULE_SEVERITY_KEY: Partial<Record<RuleId, SeverityKey>> = {
  'H-PATTERN': 'PATTERN',
  'H-REST': 'REST',
  'H-NIGHT-MAX': 'NIGHT_MAX',
  'H-NIGHT-CONSEC': 'NIGHT_CONSEC',
  'H-OFF-CONSEC': 'OFF_CONSEC',
  'H-STAFF': 'STAFF',
  'H-KTASS': 'KTAS',
  'H-TRAINING': 'TRAINING',
  'H-SLEEPING': 'SLEEPING',
  'H-EDU-LIMIT': 'EDU_LIMIT',
  'S-NIGHT-MIN': 'NIGHT_MIN',
  'S-WORK-CONSEC': 'WORK_CONSEC',
  'S-OFF-AFTER-N': 'OFF_AFTER_N',
  'S-WEEKEND-PAIR': 'WEEKEND_PAIR',
  'S-WEEKEND-CARRY': 'WEEKEND_PAIR',
  'S-SHIFT-BALANCE': 'SHIFT_BALANCE',
  'S-JUNIOR-ONLY': 'JUNIOR_ONLY',
  'S-REPEAT-PAIR': 'REPEAT_PAIR',
  'S-NIGHT-RESTART': 'NIGHT_RESTART',
  'H-OFF-EVE': 'OFF_EVE',
  'H-STAFF-MAX': 'STAFF_MAX',
  // 3-10 7: H-OFF-CARRY는 어느 쪽을 벗어났는지(data)로 정한다 — severityKeyOf
}

// 3-10 7: 위반 하나의 심각도 키. 누적 OFF는 최소 아래면 OFF_CARRY_MIN, 최대 위면 OFF_CARRY_MAX
export function severityKeyOf(
  ruleId: RuleId,
  data: Record<string, string | number | boolean> = {},
): SeverityKey | undefined {
  if (ruleId === 'H-OFF-CARRY')
    return Number(data.after) < Number(data.min) ? 'OFF_CARRY_MIN' : 'OFF_CARRY_MAX'
  return RULE_SEVERITY_KEY[ruleId]
}

// S-SOFT-PATTERN(3-10 11 금지 권고 패턴)은 키가 없어 접두사대로 늘 권고
export function severityOf(
  ruleId: RuleId,
  severity: RuleSeverity,
  data?: Record<string, string | number | boolean>,
): Severity {
  const key = severityKeyOf(ruleId, data)
  if (key) return severity[key]
  return ruleId.startsWith('H-') ? 'hard' : 'soft'
}

export const SEVERITY_LABEL: Record<Severity, '필수' | '권고'> = { hard: '필수', soft: '권고' }

// 규칙 설정·이력·안내에 쓰는 이름
export const SEVERITY_KEY_LABEL: Record<SeverityKey, string> = {
  REST: '근무 간 휴식',
  PATTERN: '금지 패턴',
  OFF_CONSEC: '최대 연속 오프',
  WORK_CONSEC: '최대 연속 근무',
  NIGHT_MAX: '월 나이트 상한',
  NIGHT_MIN: '월 나이트 하한',
  NIGHT_CONSEC: '연속 나이트 상한',
  SLEEPING: '슬리핑오프 한도',
  OFF_AFTER_N: 'N 후 OFF',
  STAFF: '듀티당 최소 인원',
  KTAS: 'KTAS 권한자',
  TRAINING: '신규–프리셉터 같은 근무',
  SHIFT_BALANCE: 'D·E·N 고르게',
  WEEKEND_PAIR: '월 1회 주말 이틀 통 OFF',
  JUNIOR_ONLY: '동일듀티 저연차끼리 배정 방지',
  REPEAT_PAIR: '특정 근무자 반복 겹침 최소화',
  EDU_LIMIT: '교육 연간 횟수',
  NIGHT_RESTART: 'N 뒤 다시 일할 때 D·E로',
  OFF_EVE: '신청 OFF 전날 N 금지',
  STAFF_MAX: '듀티당 최대 인원',
  OFF_CARRY_MIN: '누적 OFF 최소',
  OFF_CARRY_MAX: '누적 OFF 최대',
}
