// 3-11 6/7: 의사 규칙 안내 항목 — 규칙 안내 화면과 규칙 설정의 「규칙 안내」 패널이 같은 글을 쓴다.
// 필수/권고는 지금 규칙 버전에서 읽는다(매일 인원·재직 기간은 늘 필수)
import {
  DOCTOR_TIMES,
  patternLabel,
  type DoctorPatternToken,
  type DoctorRuleParams,
  type DoctorSeverity,
  type DoctorSeverityKey,
} from '@duty/domain'

export type DoctorRuleTag = '필수' | '권고' | '안내'
export type DoctorRuleItem = {
  id: string
  title: string
  body: string
  tag: DoctorRuleTag
  // 관리자가 필수/권고를 바꿀 수 있는 항목: 규칙 키 또는 금지 패턴 순번
  toggle?: { kind: 'severity'; key: DoctorSeverityKey } | { kind: 'pattern'; index: number }
}

export const severityTag = (s: DoctorSeverity): DoctorRuleTag => (s === 'hard' ? '필수' : '권고')

const TOKEN_TEXT: Record<DoctorPatternToken, string> = {
  D: 'Day',
  N: 'Night',
  AD: '올데이',
  O: '휴무',
}

// 「N-D」 → 「Night 다음 날 Day」, 3일 이상은 「Night → 휴무 → Day (연속한 날)」
export function patternText(p: readonly DoctorPatternToken[]): string {
  const t = p.map((x) => TOKEN_TEXT[x])
  return p.length === 2 ? `${t[0]} 다음 날 ${t[1]}` : `${t.join(' → ')} (연속한 날)`
}

export function doctorRuleItems(p: DoctorRuleParams): DoctorRuleItem[] {
  const sev = (key: DoctorSeverityKey) => ({
    tag: severityTag(p.severity[key]),
    toggle: { kind: 'severity' as const, key },
  })
  return [
    {
      id: 'shift',
      title: '근무',
      body: `Day ${DOCTOR_TIMES.D} · Night ${DOCTOR_TIMES.N} · O(휴무). 같은 날 Day·Night를 한 사람이 하면 올데이`,
      tag: '필수',
    },
    { id: 'daily', title: '매일 인원', body: '매일 Day 1명 · Night 1명', tag: '필수' },
    {
      id: 'count',
      title: '개수',
      body: `30일 달 의사별 Day ${p.dPerMonth} · Night ${p.nPerMonth}. 31일 달은 두 명이 하나씩 더(Day +1 한 명, Night +1 한 명), 대상은 달마다 순환하고 관리자가 바꿀 수 있습니다`,
      ...sev('COUNT'),
    },
    {
      id: 'employment',
      title: '재직 기간',
      body: '입사일 전·퇴사 예정일 뒤에는 근무를 넣지 않습니다. 그 달 일부만 재직하면 개수는 재직 날짜 비율(반올림)',
      tag: '필수',
    },
    {
      id: 'fixed',
      title: '고정 조건',
      body: '근무 신청 「내 근무 조건」의 매주·홀수 주·짝수 주 × 요일 × Day/Night/근무 × 필수/금지 — 매달 자동 적용, 켜고 끌 수 있습니다',
      ...sev('FIXED'),
    },
    {
      id: 'allday',
      title: '올데이 개수',
      body: '한 달 올데이 개수 범위(없음 / 1~2 / 2~3 / 전부 / 직접) — 생성기가 되도록 맞춥니다',
      ...sev('ALLDAY_RANGE'),
    },
    {
      id: 'request',
      title: '신청',
      body: 'D/N/O/올데이 복수 선택(하나라도 맞으면 반영). 휴가·학회는 O 신청 + 코멘트',
      ...sev('REQUEST'),
    },
    ...p.patterns.map((x, index) => ({
      id: `pattern-${x.pattern.join('-')}`,
      title: `금지 패턴 ${patternLabel(x.pattern)}`,
      body: `${patternText(x.pattern)}. 칸 기준 — Day·Night에는 올데이 날도 포함, 전월 말과 이어서 봅니다`,
      tag: severityTag(x.severity),
      toggle: { kind: 'pattern' as const, index },
    })),
    {
      id: 'schedule',
      title: '일정',
      body: `전월 ${p.requestDeadlineDay}일 신청 마감, ${p.negotiationEndDay}일까지 조정. 그 전에 확정되면 조기 배포`,
      tag: '안내',
    },
    { id: 'leave', title: '연차 없음', body: '의사 근무표에는 연차가 없습니다(필요하면 추가)', tag: '안내' },
    {
      id: 'none',
      title: '없는 규칙',
      body: '연속 휴무 제한, 16시간 휴식. 금지 패턴은 위 목록만 적용합니다(그 밖의 순서는 허용)',
      tag: '안내',
    },
    {
      id: 'public',
      title: '공개',
      body: '확정된 근무표만 간호사·의사가 서로 볼 수 있습니다. 공휴일은 표시만 합니다',
      tag: '안내',
    },
  ]
}

export const ruleTagCls = (t: DoctorRuleTag) =>
  t === '필수'
    ? 'bg-danger-bg text-danger-ink'
    : t === '권고'
      ? 'bg-warn-bg text-warn-ink'
      : 'bg-line-soft text-ink-2'
