import { SolverResponse, type SolverCause, type SolverRequest } from '@duty/contract'

// Build Spec 2-6 business-rules R-GEN-9. 솔버는 내부망의 무상태 HTTP 서비스
export type SolveOutcome =
  | { kind: 'solved'; res: Extract<SolverResponse, { status: 'OPTIMAL' | 'FEASIBLE' }> }
  | { kind: 'infeasible'; causes: SolverCause[] }
  | { kind: 'unknown' }
  | { kind: 'unreachable'; error: string }

export const solverUrl = () => process.env.SOLVER_URL ?? 'http://127.0.0.1:8100'
export const solverTimeLimit = () => Number(process.env.SOLVER_TIME_LIMIT_SEC ?? 20)

export async function callSolver(req: SolverRequest, url = solverUrl()): Promise<SolveOutcome> {
  let body: unknown
  try {
    const r = await fetch(`${url}/solve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      // 솔버는 벽시계 1.5배에서 멈춘다. 여유 10초
      signal: AbortSignal.timeout((req.timeLimitSec * 1.5 + 10) * 1000),
    })
    if (!r.ok) return { kind: 'unreachable', error: `HTTP ${r.status}` }
    body = await r.json()
  } catch (e) {
    return { kind: 'unreachable', error: e instanceof Error ? e.message : String(e) }
  }
  const parsed = SolverResponse.safeParse(body)
  if (!parsed.success) return { kind: 'unreachable', error: 'invalid response' }
  const res = parsed.data
  if (res.status === 'INFEASIBLE') return { kind: 'infeasible', causes: res.causes }
  if (res.status === 'UNKNOWN') return { kind: 'unknown' }
  return { kind: 'solved', res }
}
