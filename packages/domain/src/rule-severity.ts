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
  'NIGHT_TARGET',
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
  NIGHT_TARGET: 'soft',
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
}

const SeverityValue = z.enum(['hard', 'soft'])
// 예전 규칙 버전(심각도 없음)은 기본값으로 채운다
export const RuleSeveritySchema = z
  .object(
    Object.fromEntries(SEVERITY_KEYS.map((k) => [k, SeverityValue.default(DEFAULT_SEVERITY[k])])) as {
      [K in SeverityKey]: z.ZodDefault<typeof SeverityValue>
    },
  )
  .prefault({})

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
  'S-NIGHT-TARGET': 'NIGHT_TARGET',
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
}

export function severityOf(ruleId: RuleId, severity: RuleSeverity): Severity {
  const key = RULE_SEVERITY_KEY[ruleId]
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
  NIGHT_TARGET: '월 나이트 목표',
  NIGHT_MIN: '월 나이트 최소',
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
}
