// 3-2 R-MON-3·4: 업타임 체크가 부른다. 마지막 백업 성공이 26시간 안이면 200, 아니면 503. 본문은 ok만(시각·파일 이름은 내보내지 않는다)
import { backupFresh, readBackupStatus } from '@/server/backup-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ok = backupFresh(await readBackupStatus(), Date.now())
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } })
}
