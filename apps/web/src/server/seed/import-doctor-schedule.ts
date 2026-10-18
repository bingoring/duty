// 사용법: pnpm db:import-doctor-schedule ../../.local/doctor-schedule-2026-10.json [--replace]
// 의사 확정 근무표(첫 달 전 달)를 가져온다. day·night = 성명 또는 로그인 ID. 의사 명단을 먼저 가져와야 한다
import { readFileSync } from 'node:fs'
import { createDb } from '../db/client'
import { isMain } from './core'
import { importDoctorSchedule } from './doctors'

if (isMain(import.meta.url)) {
  const file = process.argv[2]
  const url = process.env.DATABASE_URL
  if (!file || !url) {
    console.error('사용법: pnpm db:import-doctor-schedule <JSON 경로> [--replace]  (DATABASE_URL 필요)')
    process.exit(1)
  }
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    console.error(`파일을 읽을 수 없습니다: ${file}`)
    process.exit(1)
  }
  const { db, close } = createDb(url)
  try {
    const r = await importDoctorSchedule(db, data, { replace: process.argv.includes('--replace') })
    if (!r.ok) {
      console.error('검증에 실패해 아무것도 저장하지 않았습니다:')
      for (const e of r.errors) console.error(`  - ${e}`)
      process.exitCode = 1
    } else {
      console.log(`${r.year}년 ${r.month}월 의사 근무표 ${r.days}일 확정으로 가져옴`)
      for (const c of r.counts) console.log(`  ${c.name} D ${c.D} · N ${c.N}`)
    }
  } finally {
    await close()
  }
}
