// 사용법: pnpm db:import-roster ../../.local/roster.csv
import { readFileSync } from 'node:fs'
import { createDb } from '../db/client'
import { isMain } from './core'
import { importRoster, parseRosterCsv } from './roster'

if (isMain(import.meta.url)) {
  const file = process.argv[2]
  const url = process.env.DATABASE_URL
  if (!file || !url) {
    console.error('사용법: pnpm db:import-roster <CSV 경로>  (DATABASE_URL 필요)')
    process.exit(1)
  }
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    console.error(`파일을 읽을 수 없습니다: ${file}`)
    process.exit(1)
  }
  const parsed = parseRosterCsv(text)
  if (!parsed.ok) {
    console.error('명단 검증에 실패해 아무것도 저장하지 않았습니다:')
    for (const e of parsed.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const { db, close } = createDb(url)
  const r = await importRoster(db, parsed.rows)
  await close()
  console.log(`갱신 ${r.updated}명, 신규 ${r.created.length}명`)
  for (const c of r.created) console.log(`  ${c.employeeNo} ${c.name} — 임시 비밀번호 ${c.tempPassword}`)
  if (r.created.length > 0)
    console.log('임시 비밀번호는 다시 표시되지 않습니다. 각자 첫 로그인 때 바꾸게 됩니다.')
}
