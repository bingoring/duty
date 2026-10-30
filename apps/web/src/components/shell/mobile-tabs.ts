// 3-12 모바일 아래 탭. 관리자는 데스크톱에서도 교환 요청을 보내지 않으므로 교환 자리에 「관리」
export type MobileTab = {
  href: string
  label: '근무표' | '신청' | '교환' | '관리' | '더보기'
  icon: string
  badge?: 'swap' | 'proposal' | 'approval'
}

export function mobileTabs(group: 'nurse' | 'doctor', isAdmin: boolean): MobileTab[] {
  const base = group === 'doctor' ? '/doctor' : ''
  const third: MobileTab = isAdmin
    ? {
        href: `${base}/manage`,
        label: '관리',
        icon: '✓',
        // 3-12 3차: 간호사 관리자 = 승인 대기 휴가 수(의사는 휴가가 없다)
        ...(group === 'nurse' ? { badge: 'approval' as const } : {}),
      }
    : { href: `${base}/adjust`, label: '교환', icon: '⇄', badge: 'swap' }
  return [
    { href: base || '/', label: '근무표', icon: '▦' },
    {
      href: `${base}/requests`,
      label: '신청',
      icon: '✎',
      ...(group === 'nurse' ? { badge: 'proposal' as const } : {}),
    },
    third,
    { href: `${base}/more`, label: '더보기', icon: '≡' },
  ]
}
