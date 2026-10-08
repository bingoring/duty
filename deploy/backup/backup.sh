#!/usr/bin/env bash
# 매일 03:00(서울) DB 덤프 → age 공개키로 암호화 → /backups에 14일 보관 → rclone으로 원격 복사.
#   --daemon : 매일 03:00까지 기다렸다가 실행(컨테이너 기본)
#   (인자 없음) : 지금 한 번 실행
# 필요한 env: PGHOST PGUSER PGPASSWORD PGDATABASE BACKUP_AGE_RECIPIENT
# 선택 env: BACKUP_REMOTE (rclone 대상, 예 ":gcs,env_auth=true,bucket_policy_only=true:버킷/duty") — 없으면 서버에만
set -euo pipefail
umask 077 # 백업 파일은 소유자만 읽는다
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
DIR=/backups

run_once() {
  local name="duty-$(date +%Y%m%d-%H%M).dump.age"
  local tmp="$DIR/.partial-$name"
  : "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT(age 공개키)가 필요합니다}"
  pg_dump --format=custom --no-owner | age -r "$BACKUP_AGE_RECIPIENT" > "$tmp"
  mv "$tmp" "$DIR/$name"
  echo "backup_ok $name $(stat -c %s "$DIR/$name")B"
  find "$DIR" -name 'duty-*.dump.age' -mtime +"$KEEP_DAYS" -delete
  if [ -n "${BACKUP_REMOTE:-}" ]; then
    rclone copyto "$DIR/$name" "$BACKUP_REMOTE/$name" --retries 3 --no-check-dest
    echo "backup_uploaded $name"
  fi
}

if [ "${1:-}" = "--daemon" ]; then
  while true; do
    now=$(date +%s)
    next=$(date -d "tomorrow 03:00" +%s)
    [ "$(date +%H%M)" -lt 0300 ] && next=$(date -d "today 03:00" +%s)
    sleep $((next - now))
    run_once || echo "backup_failed $(date -Iseconds)" >&2
  done
else
  run_once
fi
