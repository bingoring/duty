// 3-11 1: 의사별 고정 색 — D/N 색 대신 사람마다 한 색. 모든 의사 달력(근무표·생성·조정·신청)과 범례가 같은 매핑을 쓴다
// 클래스 이름은 Tailwind가 소스에서 찾도록 문자열 그대로 둔다 (토큰은 globals.css --color-doc-N)
export const DOCTOR_PALETTE = [
  { bg: 'bg-doc-1', ink: 'text-doc-1-ink', tint: 'bg-doc-1/40', dot: 'bg-doc-1-ink' },
  { bg: 'bg-doc-2', ink: 'text-doc-2-ink', tint: 'bg-doc-2/40', dot: 'bg-doc-2-ink' },
  { bg: 'bg-doc-3', ink: 'text-doc-3-ink', tint: 'bg-doc-3/40', dot: 'bg-doc-3-ink' },
  { bg: 'bg-doc-4', ink: 'text-doc-4-ink', tint: 'bg-doc-4/40', dot: 'bg-doc-4-ink' },
  { bg: 'bg-doc-5', ink: 'text-doc-5-ink', tint: 'bg-doc-5/40', dot: 'bg-doc-5-ink' },
  { bg: 'bg-doc-6', ink: 'text-doc-6-ink', tint: 'bg-doc-6/40', dot: 'bg-doc-6-ink' },
  { bg: 'bg-doc-7', ink: 'text-doc-7-ink', tint: 'bg-doc-7/40', dot: 'bg-doc-7-ink' },
  { bg: 'bg-doc-8', ink: 'text-doc-8-ink', tint: 'bg-doc-8/40', dot: 'bg-doc-8-ink' },
  { bg: 'bg-doc-9', ink: 'text-doc-9-ink', tint: 'bg-doc-9/40', dot: 'bg-doc-9-ink' },
  { bg: 'bg-doc-10', ink: 'text-doc-10-ink', tint: 'bg-doc-10/40', dot: 'bg-doc-10-ink' },
] as const

export type DoctorColor = (typeof DOCTOR_PALETTE)[number]
// 의사 id → 팔레트 번호(0부터)
export type DoctorColors = Readonly<Record<string, number>>

export type DoctorColorClasses = { bg: string; ink: string; tint: string; dot: string }
const UNKNOWN: DoctorColorClasses = {
  bg: 'bg-shift-off',
  ink: 'text-ink',
  tint: 'bg-shift-off/40',
  dot: 'bg-ink-3',
}

// 의사 표 순서대로 색을 준다. 재직 중인 의사가 먼저, 그만둔 의사는 그 뒤 — 달마다 같은 사람은 같은 색
export function assignDoctorColors(
  doctors: readonly { id: string; active?: boolean }[],
): Record<string, number> {
  const ordered = [...doctors.filter((d) => d.active !== false), ...doctors.filter((d) => d.active === false)]
  const out: Record<string, number> = {}
  let n = 0
  for (const d of ordered) if (!(d.id in out)) out[d.id] = n++ % DOCTOR_PALETTE.length
  return out
}

export function colorOf(colors: DoctorColors | undefined, id: string | null | undefined): DoctorColorClasses {
  const i = id ? colors?.[id] : undefined
  return i === undefined ? UNKNOWN : DOCTOR_PALETTE[i % DOCTOR_PALETTE.length]!
}
