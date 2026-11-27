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

// 뒤에서부터 믿을 프록시 수만큼 건너뛴 값을 클라이언트 IP로 본다. 운영(Firebase Hosting → Cloud Run)은
// 「클라이언트, Google 프런트」라 TRUSTED_PROXY_HOPS=2(deploy/gcp/serverless.sh). 기본 1은 프록시 하나 뒤(VM 시절 Caddy)
export function clientIp(
  headers: Headers,
  hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1),
): string | null {
  const xff = headers.get('x-forwarded-for')
  if (!xff) return null
  const parts = xff.split(',').map((p) => p.trim())
  return parts[Math.max(0, parts.length - Math.max(1, hops))] || null
}

export const loginLimiter = new IpLimiter()
