// Build Spec 3-1 R-OPS-7 — 로그인 실패를 IP별로 센다(계정 잠금 5회와 별개).
// 병원 공용 IP 뒤의 여러 사람을 고려해 넉넉히: 10분에 20회 → 그 IP를 10분 막는다.
// 앱 서버는 한 프로세스라 메모리에 둔다(재시작하면 초기화 — 공격을 늦추는 용도로 충분)
const LIMIT = 20
const WINDOW_MS = 10 * 60_000
const BLOCK_MS = 10 * 60_000
const MAX_KEYS = 10_000

export class IpLimiter {
  private fails = new Map<string, number[]>()
  private blocked = new Map<string, number>()

  blockedUntil(ip: string, now: number): number | null {
    const until = this.blocked.get(ip)
    if (until === undefined) return null
    if (until <= now) {
      this.blocked.delete(ip)
      return null
    }
    return until
  }

  recordFailure(ip: string, now: number) {
    const recent = (this.fails.get(ip) ?? []).filter((t) => t > now - WINDOW_MS)
    recent.push(now)
    if (recent.length >= LIMIT) {
      this.blocked.set(ip, now + BLOCK_MS)
      this.fails.delete(ip)
    } else this.fails.set(ip, recent)
    // 많은 IP로 메모리를 채우지 못하게 오래된 키부터 버린다
    if (this.fails.size > MAX_KEYS) this.fails.delete(this.fails.keys().next().value!)
  }
}

// Caddy는 들어온 X-Forwarded-For를 믿지 않고 실제 연결 IP를 붙인다 → 마지막 값만 믿는다
export function clientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (!xff) return null
  return xff.split(',').at(-1)!.trim() || null
}

export const loginLimiter = new IpLimiter()
