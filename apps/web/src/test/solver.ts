import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

// 통합 테스트·E2E 전용 솔버. 개발 서버(8100)와 겹치지 않게 따로 띄운다
export const TEST_SOLVER_PORT = 8101
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
    { cwd: solverDir, stdio: ['ignore', 'ignore', 'inherit'] },
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
