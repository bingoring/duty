import { DOCTOR_TIMES } from '@duty/domain'
import { requireDoctor } from '@/server/auth/guards'
import { getDb } from '@/server/db/client'
import { currentDoctorRules } from '@/server/doctor/core'

// 3-7a 의사 규칙 안내 — 규칙 버전 값으로 렌더링
export default async function DoctorRulesGuidePage() {
  await requireDoctor()
  const { version, params: p } = await currentDoctorRules(getDb())
  const items: [string, string, string][] = [
    [
      '근무',
      `Day ${DOCTOR_TIMES.D} · Night ${DOCTOR_TIMES.N} · O(휴무). 같은 날 Day·Night를 한 사람이 하면 올데이`,
      '필수',
    ],
    ['매일 인원', '매일 Day 1명 · Night 1명', '필수'],
    [
      '개수',
      `30일 달 의사별 Day ${p.dPerMonth} · Night ${p.nPerMonth}. 31일 달은 두 명이 하나씩 더(Day +1 한 명, Night +1 한 명), 대상은 달마다 순환하고 관리자가 바꿀 수 있습니다`,
      '필수',
    ],
    [
      '고정 조건',
      '근무 신청 「내 근무 조건」의 요일 × Day/Night/근무 × 필수/금지 — 매달 자동 적용, 켜고 끌 수 있습니다',
      '필수',
    ],
    [
      '올데이 개수',
      '한 달 올데이 개수 범위(없음 / 1~2 / 2~3 / 전부 / 직접) — 생성기가 되도록 맞춥니다',
      '권고',
    ],
    ['신청', 'D/N/O/올데이 복수 선택(하나라도 맞으면 반영). 휴가·학회는 O 신청 + 코멘트', '권고'],
    [
      '일정',
      `전월 ${p.requestDeadlineDay}일 신청 마감, ${p.negotiationEndDay}일까지 조정. 그 전에 확정되면 조기 배포`,
      '안내',
    ],
    ['없는 규칙', '연차·휴가 메뉴, 연속 휴무 제한, 금지 패턴·16시간 휴식(N-O-D·올데이-O-D 허용)', '안내'],
    ['공개', '확정된 근무표만 간호사·의사가 서로 볼 수 있습니다. 공휴일은 표시만 합니다', '안내'],
  ]
  const tag = (t: string) =>
    t === '필수'
      ? 'bg-danger-bg text-danger-ink'
      : t === '권고'
        ? 'bg-warn-bg text-warn-ink'
        : 'bg-line-soft text-ink-2'
  return (
    <div className="flex max-w-[760px] flex-col gap-4 px-7 py-6 text-[13.5px]">
      <h1 className="text-[22px] font-bold tracking-[-0.02em]">규칙 안내 · 의사</h1>
      <p className="text-xs text-ink-2">규칙 v{version}</p>
      <ul className="flex flex-col divide-y divide-line-soft rounded-xl border border-line bg-surface">
        {items.map(([title, body, t]) => (
          <li key={title} className="flex items-start gap-3 px-5 py-3.5">
            <span className="w-24 shrink-0 font-bold">{title}</span>
            <span className="flex-1">{body}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tag(t)}`}>
              {t}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
