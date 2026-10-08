#!/usr/bin/env bash
# 암호화 백업을 DB에 복구한다(기존 객체를 지우고 다시 만든다). 개인키가 있는 곳에서만 실행한다.
#   restore.sh <백업 파일.dump.age> <age 개인키 파일>
# 필요한 env: PGHOST PGUSER PGPASSWORD PGDATABASE (복구 대상 DB — 먼저 별도 DB에 리허설할 것)
set -euo pipefail
file=${1:?백업 파일 경로가 필요합니다}
key=${2:?age 개인키 파일이 필요합니다}
age -d -i "$key" "$file" | pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE"
echo "restore_ok $file → $PGDATABASE"
