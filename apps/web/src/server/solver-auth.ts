// 3-13: Cloud Run 솔버는 비공개 서비스다. web 서비스 계정의 ID 토큰(메타데이터 서버)을 Authorization으로 붙인다.
// http 주소(VM compose·로컬·CI)는 토큰 없이 부른다
const METADATA =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience='
const TTL_MS = 50 * 60_000 // ID 토큰은 1시간 유효

let cached: { audience: string; token: string; at: number } | null = null

export function resetSolverTokenCache() {
  cached = null
}

export async function solverHeaders(
  url: string,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<Record<string, string>> {
  if (!url.startsWith('https://')) return {}
  const audience = new URL(url).origin
  if (!cached || cached.audience !== audience || now() - cached.at >= TTL_MS) {
    const r = await fetchFn(METADATA + encodeURIComponent(audience), {
      headers: { 'Metadata-Flavor': 'Google' },
    })
    if (!r.ok) throw new Error(`ID 토큰을 받지 못했습니다 (HTTP ${r.status})`)
    cached = { audience, token: (await r.text()).trim(), at: now() }
  }
  return { authorization: `Bearer ${cached.token}` }
}
