#!/usr/bin/env bash
# Build Spec 3-3 — 서버에서 한 커밋을 배포한다(R-CD-3~6). root로 돈다.
#   GitHub Actions: gcloud compute ssh ... --command 'sudo bash -s -- <커밋>' < deploy/deploy.sh
#   사람이 직접:    sudo bash /opt/duty/deploy/deploy.sh <커밋>
# 순서: 잠금 → 대상 커밋이 origin/main에 있는지 → 백업(실패하면 중단) → fast-forward → up -d --build(마이그레이션 먼저)
#       → 헬스 체크 → 실패하면 이전 커밋으로 되돌려 다시 올림(DB 마이그레이션은 되돌리지 않는다 — 운영 문서 5)
set -euo pipefail
# 표준 입력으로 받은 스크립트(bash -s)를 끝까지 읽은 뒤 실행한다. 안에서 docker compose exec 등이 표준 입력을 읽으면
# 남은 스크립트를 삼켜 중간에 "성공"으로 끝난다(3-3 첫 배포에서 발견) → 전체를 함수로 감싸고 표준 입력을 비운다
main() {
exec </dev/null
TARGET=${1:?배포할 커밋이 필요합니다}
DIR=${DUTY_DIR:-/opt/duty}
cd "$DIR"
exec 9>/var/lock/duty-deploy.lock
flock -w 600 9 || { echo "deploy_locked"; exit 1; }

OWNER=$(stat -c %U "$DIR")
g() { sudo -u "$OWNER" git -C "$DIR" "$@"; } # 저장소 파일은 원래 주인으로 둔다
C=(docker compose -f compose.prod.yaml --env-file .env.prod)
DOMAIN=$(grep -E '^DOMAIN=' .env.prod | cut -d= -f2-)

g fetch -q origin main
if ! g merge-base --is-ancestor "$TARGET" origin/main; then
  echo "deploy_refused $TARGET 는 origin/main에 없습니다"
  exit 1
fi
PREV=$(g rev-parse HEAD)
if [ "$(g rev-parse "$TARGET")" = "$PREV" ]; then
  echo "deploy_skip 이미 $PREV"
  exit 0
fi
if ! g merge-base --is-ancestor "$PREV" "$TARGET"; then
  echo "deploy_refused 지금 커밋($PREV)보다 오래된 커밋입니다"
  exit 1
fi

# 문서만 바뀌었으면(waypoint·docs 등) 다시 빌드하지 않고 git만 따라간다(R-CD-3). 실패로 밀린 변경도 여기서 함께 잡힌다
RUNTIME='^(apps/|packages/|services/|deploy/(backup/|Caddyfile|deploy\.sh)|compose\.prod\.yaml|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.nvmrc)'
if ! g diff --name-only "$PREV" "$TARGET" | grep -qE "$RUNTIME"; then
  g merge -q --ff-only "$TARGET"
  echo "deploy_docs_only $PREV → $TARGET (다시 빌드하지 않음)"
  exit 0
fi

# 업데이트 전 백업(R-CD-4)
"${C[@]}" exec -T backup backup.sh

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 "https://$DOMAIN/api/health"; then return 0; fi
    sleep 4
  done
  return 1
}

g merge -q --ff-only "$TARGET"
echo "deploy_start $PREV → $TARGET"
if "${C[@]}" up -d --build --remove-orphans && healthy; then
  docker image prune -f >/dev/null
  echo "deploy_ok $TARGET"
  exit 0
fi

# 되돌리기(R-CD-6)
echo "deploy_failed $TARGET — $PREV 로 되돌립니다"
"${C[@]}" logs --tail 60 migrate web 2>&1 | tail -60 || true
g reset -q --hard "$PREV"
"${C[@]}" up -d --build --remove-orphans && healthy && echo "deploy_rolled_back $PREV" || echo "deploy_rollback_failed $PREV"
exit 1
}
main "$@"
