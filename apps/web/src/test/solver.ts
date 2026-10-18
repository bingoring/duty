import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

// 통합 테스트·E2E 전용 솔버. 개발 서버(8100)와 겹치지 않게 따로 띄운다
export const TEST_SOLVER_PORT = Number(process.env.TEST_SOLVER_PORT ?? 8101)
const solverDir = path.resolve(import.meta.dirname, '../../../../services/solver')

async function healthy(url: string) {
  try {
    return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) })).ok
  } catch {
    return false
  }
}

export async function startSolver(port = TEST_SOLVER_PORT): Promise<() => Promise<void>> {
  const url = `http://127.0.0.1:${port}`
  if (await healthy(url)) return async () => {}
  const child: ChildProcess = spawn(
    'uv',
    ['run', 'uvicorn', 'solver.app:app', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: solverDir,
      stdio: ['ignore', 'ignore', 'inherit'],
      // 테스트는 결정적 시간으로만 멈추게 한다(벽시계 상한을 넉넉히). 느린 CI에서 벽시계 1.5배에 먼저 걸리면
      // 로컬과 다른, 덜 다듬어진 안이 나와 신청 반영 같은 검사가 흔들렸다(3-5·3-6 main CI)
      env: { ...process.env, SOLVER_WALL_FACTOR: process.env.SOLVER_WALL_FACTOR ?? '6' },
    },
  )
  const until = Date.now() + 120_000
  while (!(await healthy(url))) {
    if (child.exitCode !== null) throw new Error(`솔버가 시작하지 못했습니다 (exit ${child.exitCode})`)
    if (Date.now() > until) throw new Error('솔버 시작 시간 초과')
    await new Promise((r) => setTimeout(r, 300))
  }
  return async () => {
    child.kill('SIGTERM')
  }
}
