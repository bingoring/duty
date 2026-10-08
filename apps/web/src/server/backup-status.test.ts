import { describe, expect, it } from 'vitest'
import { BACKUP_MAX_AGE_SEC, backupFresh } from './backup-status'

describe('backupFresh (3-2 R-MON-3)', () => {
  const now = Date.UTC(2026, 9, 9, 3, 0) // ms
  const at = (agoSec: number) => String(Math.floor(now / 1000) - agoSec)
  it('파일이 없거나 숫자가 아니면 실패', () => {
    expect(backupFresh(null, now)).toBe(false)
    expect(backupFresh('', now)).toBe(false)
    expect(backupFresh('abc', now)).toBe(false)
  })
  it('26시간 안이면 정상, 넘으면 실패', () => {
    expect(backupFresh(at(3600) + '\n', now)).toBe(true)
    expect(backupFresh(at(BACKUP_MAX_AGE_SEC), now)).toBe(true)
    expect(backupFresh(at(BACKUP_MAX_AGE_SEC + 1), now)).toBe(false)
  })
  it('미래 시각(시계 어긋남 5분 넘음)은 실패', () => {
    expect(backupFresh(at(-60), now)).toBe(true)
    expect(backupFresh(at(-3600), now)).toBe(false)
  })
})
