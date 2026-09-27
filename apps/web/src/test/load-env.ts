import { existsSync } from 'node:fs'
import path from 'node:path'

const envFile = path.resolve(import.meta.dirname, '../../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

// 통합 테스트 전용 솔버 (global-setup이 띄운다). 시간 제한은 짧게
process.env.SOLVER_URL ??= 'http://127.0.0.1:8101'
process.env.SOLVER_TIME_LIMIT_SEC ??= '4'
