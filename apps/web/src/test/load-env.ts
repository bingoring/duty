import { existsSync } from 'node:fs'
import path from 'node:path'

const envFile = path.resolve(import.meta.dirname, '../../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
