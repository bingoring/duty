// 3-11 1: 강조 칩 (전체 / 본인 / 의사별) — 근무표·생성·조정·신청 화면이 같이 쓴다.
// 훅이 없어 서버·클라이언트 화면 어디서나 쓸 수 있다. 고른 사람은 URL `hl`로 의사 화면 사이를 따라다닌다.
// 칩마다 그 의사의 색 점이 있어 색 범례를 겸한다
import Link from 'next/link'
import { colorOf, type DoctorColors } from './colors'

export function DoctorHighlightChips({
  doctors,
  viewerId,
  highlight,
  hrefs,
  colors,
}: {
  doctors: readonly { id: string; name: string }[]
  viewerId: string | null
  highlight: string | null
  // 의사 id(null = 전체) → 링크 주소. 서버 화면에서 함수를 못 넘기므로 미리 만든 주소를 받는다
  hrefs: Readonly<Record<string, string>> & { all: string }
  colors?: DoctorColors
}) {
  const chip = (id: string | null, label: string) => (
    <Link
      key={id ?? 'all'}
      href={id ? (hrefs[id] ?? hrefs.all) : hrefs.all}
      aria-current={highlight === id ? 'true' : undefined}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-xs font-semibold ${
        highlight === id ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2'
      }`}
    >
      {id && (
        <span
          aria-hidden
          className={`h-2.5 w-2.5 rounded-full ${colorOf(colors, id).bg} ring-1 ring-ink/15`}
        />
      )}
      {label}
    </Link>
  )
  const viewerIn = !!viewerId && doctors.some((d) => d.id === viewerId)
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-print="hide">
      <span className="text-xs text-ink-2">강조</span>
      {chip(null, '전체')}
      {viewerIn && chip(viewerId, '본인')}
      {doctors.filter((d) => d.id !== viewerId).map((d) => chip(d.id, d.name))}
    </span>
  )
}

// 강조 링크 주소 묶음: base(hl 없는 주소)에 &hl= 를 붙인다
export function highlightHrefs(
  doctors: readonly { id: string }[],
  hrefOf: (hl: string | null) => string,
): Record<string, string> & { all: string } {
  return Object.assign(Object.fromEntries(doctors.map((d) => [d.id, hrefOf(d.id)])), { all: hrefOf(null) })
}
