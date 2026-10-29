import Link from 'next/link'

// 3-12: 정보가 많은 관리자 화면은 휴대폰에서 열지 않고 PC 이용을 안내한다(시안 5-admin)
export function pcOnlyItems(group: 'nurse' | 'doctor'): string[] {
  return [
    '듀티 생성 · 생성안 검토',
    '근무 조정 (전체 격자 편집·다시 생성)',
    '규칙 설정',
    group === 'doctor' ? '의사 관리' : '간호사 관리',
  ]
}

export function PcOnlyList({ group }: { group: 'nurse' | 'doctor' }) {
  return (
    <ul className="overflow-hidden rounded-xl bg-surface text-[13px]">
      {pcOnlyItems(group).map((t) => (
        <li key={t} className="flex justify-between border-b border-line-soft px-3 py-2.5 last:border-0">
          {t}
          <span className="text-xs text-ink-3">PC</span>
        </li>
      ))}
    </ul>
  )
}

export function PcOnly({ group }: { group: 'nurse' | 'doctor' }) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-6">
      <h1 className="text-[19px] font-bold tracking-[-0.02em]">PC에서 이용해 주세요</h1>
      <p className="text-[13px] text-ink-2">이 화면은 정보가 많아 PC에서 이용해 주세요.</p>
      <PcOnlyList group={group} />
      <Link
        href={group === 'doctor' ? '/doctor' : '/'}
        className="inline-flex h-10 w-fit items-center rounded-lg border border-line bg-surface px-4 text-[13px] font-semibold"
      >
        근무표로 돌아가기
      </Link>
    </div>
  )
}
