import { addDays, type IsoDate } from './dates'

// 3-5: KTAS 자격은 수료일부터 3년 유효. 만료 6개월 전부터 갱신 필요로 표시하고, 만료 뒤에는 KTAS 인원에서 뺀다
export const KTAS_VALID_YEARS = 3
export const KTAS_RENEW_MONTHS = 6

function shiftMonths(iso: IsoDate, months: number): IsoDate {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

// 유효 마지막 날 = 수료일 + 3년 − 1일 (2024-03-01 수료 → 2027-02-28까지)
export function ktasValidUntil(certifiedOn: IsoDate): IsoDate {
  return addDays(shiftMonths(certifiedOn, KTAS_VALID_YEARS * 12), -1)
}

// 그날 KTAS 인원으로 세는가. 수료일을 모르면(입력 전) 자격을 유지한다
export function ktasValidOn(n: { kTass: boolean; kTassUntil?: IsoDate | null }, date: IsoDate): boolean {
  return n.kTass && (!n.kTassUntil || date <= n.kTassUntil)
}

export type KtasStatus =
  { kind: 'none' } | { kind: 'missing' } | { kind: 'valid' | 'renew' | 'expired'; until: IsoDate }

// 3-6: 갱신했으면 갱신일부터 다시 3년. 취득일·갱신일 중 늦은 날이 기준
export function ktasBaseDate(certifiedOn: IsoDate | null, renewedOn?: IsoDate | null): IsoDate | null {
  if (certifiedOn && renewedOn) return certifiedOn > renewedOn ? certifiedOn : renewedOn
  return renewedOn ?? certifiedOn
}

export function ktasStatus(
  kTass: boolean,
  certifiedOn: IsoDate | null,
  today: IsoDate,
  renewedOn?: IsoDate | null,
): KtasStatus {
  if (!kTass) return { kind: 'none' }
  const base = ktasBaseDate(certifiedOn, renewedOn)
  if (!base) return { kind: 'missing' }
  const until = ktasValidUntil(base)
  if (today > until) return { kind: 'expired', until }
  if (today >= shiftMonths(until, -KTAS_RENEW_MONTHS)) return { kind: 'renew', until }
  return { kind: 'valid', until }
}
