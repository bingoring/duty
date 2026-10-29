import type { SwapCode } from '@duty/domain'

// 두 칸의 근무를 맞바꾼다. 수간호사가 받은 OFF는 S, 교대 근무자가 받은 S는 OFF. 수간호사가 E·N을 받으면 null
export function swapCodes(
  codes: SwapCode[],
  a: number,
  b: number,
  isHead: (i: number) => boolean,
): SwapCode[] | null {
  const next = [...codes]
  ;[next[a], next[b]] = [next[b]!, next[a]!]
  const fixed = next.map((c, k) => (isHead(k) ? (c === 'OFF' ? 'S' : c) : c === 'S' ? 'OFF' : c))
  return fixed.some((c, k) => isHead(k) && c !== 'S' && c !== 'D') ? null : fixed
}
