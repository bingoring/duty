// 사용법: pnpm db:import-history <묶음.json> [--dry-run]   (DATABASE_URL 필요, 빈 DB 전용)
// 실명·초기 비밀번호가 든 묶음은 .local/에만 두고, 서버에는 잠시 올렸다가 지운다(docs/operations.md).
// 출력에는 사번과 개수만 남긴다(이름·비밀번호 없음).
import { readFileSync } from 'node:fs'
import { createDb } from '../db/client'
import { isMain } from './core'
import { importHistory, type HistoryBundle } from './history'

if (isMain(import.meta.url)) {
  const file = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')
  const url = process.env.DATABASE_URL
  if (!file || !url) {
    console.error('사용법: pnpm db:import-history <묶음.json> [--dry-run]  (DATABASE_URL 필요)')
    process.exit(1)
  }
  const bundle = JSON.parse(readFileSync(file, 'utf8')) as HistoryBundle
  const { db, close } = createDb(url)
  try {
    const r = await importHistory(db, bundle, { dryRun })
    console.log(
      `${dryRun ? '[미리보기, 저장 안 함] ' : ''}사람 ${r.users}명(재직 ${r.active}) · 마감 ${r.plans.closed}달 · 확정 ${r.plans.confirmed}달 · 칸 ${r.cells}개 · 이월 조정 ${r.adjustments}건`,
    )
    console.log(`엑셀과 앱 계산이 다른 곳 ${r.diffs.length}건 (엑셀 값을 기록)`)
    for (const d of r.diffs) console.log(`  ${d}`)
    for (const w of r.warnings) console.log(`  주의: ${w}`)
  } finally {
    await close()
  }
}
