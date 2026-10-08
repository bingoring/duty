import { readFile } from 'node:fs/promises'

// Build Spec 3-2 R-MON-3 — 백업 컨테이너가 쓴 마지막 성공 시각(epoch 초)이 26시간 안이면 정상
export const BACKUP_MAX_AGE_SEC = 26 * 3600

export function backupFresh(content: string | null, nowMs: number): boolean {
  const at = Number(content?.trim())
  if (!content || !Number.isFinite(at) || at <= 0) return false
  const age = nowMs / 1000 - at
  return age >= -300 && age <= BACKUP_MAX_AGE_SEC
}

export async function readBackupStatus(file = process.env.BACKUP_STATUS_FILE ?? '/backup-status/last-ok') {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}
