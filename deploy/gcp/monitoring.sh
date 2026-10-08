#!/usr/bin/env bash
# Build Spec 3-2 — 이메일 알림 채널·업타임 체크 2개·알림 정책 4개·월 예산(R-MON-1~8). 비용이 생기지 않는 범위.
#   PROJECT_ID=duty-511008 ALERT_EMAIL=you@example.com BUDGET_KRW=50000 DOMAIN=offplz.com ./deploy/gcp/monitoring.sh
#   DRY_RUN=1 이면 실행할 명령만 출력한다. 이름으로 찾아 이미 있으면 건너뛴다(멱등)
# VM 쪽 Ops Agent(디스크·메모리 지표)는 deploy/gcp/ops-agent.sh — VM 접근 범위 변경(재시작)이 필요해 따로 돈다
set -euo pipefail
: "${PROJECT_ID:?PROJECT_ID가 필요합니다}" "${ALERT_EMAIL:?ALERT_EMAIL이 필요합니다}" "${BUDGET_KRW:?BUDGET_KRW가 필요합니다}"
DOMAIN=${DOMAIN:-offplz.com}
P=(--project="$PROJECT_ID")
run() { echo "+ $*"; [ -n "${DRY_RUN:-}" ] || "$@"; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# 알림 채널·정책은 gcloud alpha/beta에만 있어 정식 REST API(v3)를 직접 부른다(구성 요소 설치 없이)
API=https://monitoring.googleapis.com/v3/projects/$PROJECT_ID
api() { # GET 경로 | POST 경로 파일
  local token
  token=$(gcloud auth print-access-token)
  if [ "$1" = GET ]; then
    curl -fsS -H "Authorization: Bearer $token" "$API/$2"
  else
    echo "+ POST $2 ($(basename "$3"))"
    [ -n "${DRY_RUN:-}" ] || curl -fsS -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
      --data @"$3" "$API/$2" >/dev/null
  fi
}
# 표시 이름이 같은 자원의 name (없으면 빈 값)
find_name() { { api GET "$1?pageSize=200" 2>/dev/null || echo "{}"; } | python3 -c "import json,sys;d=json.load(sys.stdin);print(next((x['name'] for x in d.get('$2',[]) if x.get('displayName')=='$3'),''))"; }

run gcloud services enable monitoring.googleapis.com billingbudgets.googleapis.com "${P[@]}"

# 1) 알림 채널 (R-MON-7)
CHANNEL=$(find_name notificationChannels notificationChannels duty-email)
if [ -n "$CHANNEL" ]; then
  echo "알림 채널 있음 — 건너뜀"
else
  printf '{"type":"email","displayName":"duty-email","labels":{"email_address":"%s"}}' "$ALERT_EMAIL" >"$TMP/channel.json"
  api POST notificationChannels "$TMP/channel.json"
  CHANNEL=$(find_name notificationChannels notificationChannels duty-email)
fi
CHANNEL=${CHANNEL:-projects/$PROJECT_ID/notificationChannels/DRY_RUN}

# 2) 업타임 체크 (R-MON-1·4)
uptime_id() {
  gcloud monitoring uptime list-configs "${P[@]}" --filter="displayName=\"$1\"" --format='value(name)' 2>/dev/null |
    head -1 | sed 's#.*/##'
}
uptime() { # 이름 경로 주기(분)
  if [ -n "$(uptime_id "$1")" ]; then
    echo "업타임 체크 $1 있음 — 건너뜀"
    return
  fi
  run gcloud monitoring uptime create "$1" "${P[@]}" --resource-type=uptime-url \
    --resource-labels=host="$DOMAIN",project_id="$PROJECT_ID" --protocol=https --path="$2" \
    --period="$3" --timeout=10 --regions=asia-pacific,usa-oregon,europe
}
uptime duty-health /api/health 5
uptime duty-backup /api/health/backup 15 # 주기는 1·5·10·15분만 된다

# 3) 알림 정책 (R-MON-1·4·5)
policy() { # 이름 파일
  if [ -n "$(find_name alertPolicies alertPolicies "$1")" ]; then
    echo "알림 정책 $1 있음 — 건너뜀"
    return
  fi
  python3 -m json.tool "$2" >/dev/null # JSON 형식 확인
  api POST alertPolicies "$2"
}
uptime_policy() { # 정책 이름 체크 이름 지속(초) 안내 정렬(초): 정렬 구간이 체크 주기보다 길어야 지역별 마지막 결과를 센다
  local id
  id=$(uptime_id "$2")
  id=${id:-DRY_RUN}
  cat >"$TMP/$1.json" <<JSON
{
  "displayName": "$1",
  "combiner": "OR",
  "notificationChannels": ["$CHANNEL"],
  "documentation": { "content": "$4", "mimeType": "text/markdown" },
  "conditions": [{
    "displayName": "$2 실패",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"$id\"",
      "aggregations": [{ "alignmentPeriod": "${5}s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.*"] }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 1,
      "duration": "$3s",
      "trigger": { "count": 1 }
    }
  }]
}
JSON
  policy "$1" "$TMP/$1.json"
}
uptime_policy duty-down duty-health 600 \
  "offplz.com에 접속되지 않습니다. 서버에서 \`ps\`, \`logs caddy\`·\`logs web\`을 보세요(docs/operations.md 7. 장애 대응)." 1200
uptime_policy duty-backup-missing duty-backup 0 \
  "최근 26시간 안에 성공한 백업이 없습니다. \`logs backup\`에서 backup_failed를 보고, \`exec backup backup.sh\`로 한 번 돌리세요(docs/operations.md 4)." 1800

agent_policy() { # 이름 지표 임계(%) 안내 [추가 필터]
  cat >"$TMP/$1.json" <<JSON
{
  "displayName": "$1",
  "combiner": "OR",
  "notificationChannels": ["$CHANNEL"],
  "documentation": { "content": "$4", "mimeType": "text/markdown" },
  "conditions": [{
    "displayName": "$1 $3% 초과 10분",
    "conditionThreshold": {
      "filter": "metric.type=\"agent.googleapis.com/$2\" AND resource.type=\"gce_instance\" AND metric.label.state=\"used\"${5:-}",
      "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_MEAN" }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": $3,
      "duration": "600s",
      "trigger": { "count": 1 }
    }
  }]
}
JSON
  policy "$1" "$TMP/$1.json"
}
# 스냅 loop 장치(항상 100%)는 빼고 루트 디스크만
agent_policy duty-disk disk/percent_used 80 \
  "VM 디스크가 80%를 넘었습니다. \`df -h\`, \`docker system df\` → \`docker image prune -f\`, 백업 보관 일수(docs/operations.md 7)." \
  ' AND metric.label.device=monitoring.regex.full_match(\"/dev/(sda|nvme0n1p)1\")'
agent_policy duty-memory memory/percent_used 90 \
  "VM 메모리가 90%를 넘었습니다. \`docker stats\`로 확인하고 솔버면 SOLVER_WORKERS를 줄이거나 VM 크기를 키우세요(docs/operations.md 7)."

# 4) 월 예산 (R-MON-6) — 결제 계정 관리자 이메일 + 알림 채널
BILLING=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' | sed 's#billingAccounts/##')
NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
# 예산 API는 할당량 프로젝트가 필요하다 — gcloud 기본 프로젝트가 다른 곳이어도 이 프로젝트로 부른다
if gcloud billing budgets list --billing-project="$PROJECT_ID" --billing-account="$BILLING" --format='value(displayName)' 2>/dev/null | grep -qx duty-monthly; then
  echo "예산 duty-monthly 있음 — 건너뜀"
else
  run gcloud billing budgets create --billing-project="$PROJECT_ID" --billing-account="$BILLING" --display-name=duty-monthly \
    --budget-amount="${BUDGET_KRW}KRW" --filter-projects="projects/$NUMBER" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
    --notifications-rule-monitoring-notification-channels="$CHANNEL"
fi
echo "완료 — 알림 채널: $CHANNEL"
