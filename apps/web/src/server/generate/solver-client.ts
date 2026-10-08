import { SolverResponse, type SolverCause, type SolverRequest } from '@duty/contract'

// Build Spec 2-6 business-rules R-GEN-9. 솔버는 내부망의 무상태 HTTP 서비스
export type SolveOutcome =
  | { kind: 'solved'; res: Extract<SolverResponse, { status: 'OPTIMAL' | 'FEASIBLE' }> }
  | { kind: 'infeasible'; causes: SolverCause[] }
  | { kind: 'unknown' }
  | { kind: 'unreachable'; error: string }

export const solverUrl = () => process.env.SOLVER_URL ?? 'http://127.0.0.1:8100'
export const solverTimeLimit = () => Number(process.env.SOLVER_TIME_LIMIT_SEC ?? 20)

// 솔버는 풀이에 벽시계 1.5배, 불가능이면 원인 진단에 min(10, 한도)×1.5까지 더 쓴다. 모델 조립 여유 15초(R-1).
// 너무 짧으면 느린 불가능 증명이 "연결할 수 없음"으로 잘못 보인다
export const solverTimeoutMs = (limitSec: number) =>
  (limitSec * 1.5 + Math.min(10, limitSec) * 1.5 + 15) * 1000

export async function callSolver(req: SolverRequest, url = solverUrl()): Promise<SolveOutcome> {
  let body: unknown
  try {
    const r = await fetch(`${url}/solve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(solverTimeoutMs(req.timeLimitSec)),
    })
    if (!r.ok) return { kind: 'unreachable', error: `HTTP ${r.status}` }
    body = await r.json()
  } catch (e) {
    return { kind: 'unreachable', error: e instanceof Error ? e.message : String(e) }
  }
  const parsed = SolverResponse.safeParse(body)
  if (!parsed.success) return { kind: 'unreachable', error: 'invalid response (계약 불일치)' }
  const res = parsed.data
  if (res.status === 'INFEASIBLE') return { kind: 'infeasible', causes: res.causes }
  if (res.status === 'UNKNOWN') return { kind: 'unknown' }
  return { kind: 'solved', res }
}
