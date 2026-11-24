#!/usr/bin/env bash
# Stage 3-13 4단계 — VM 감시를 Cloud Run·Cloud SQL 감시로 바꾼다(비용이 생기지 않는 범위).
#   PROJECT_ID=duty-511008 BUDGET_KRW=30000 ./deploy/gcp/monitoring-serverless.sh
#   DRY_RUN=1 이면 실행할 명령만 출력한다. 이름으로 찾아 이미 있으면 건너뛴다(멱등)
# 알림 채널(duty-email)·업타임 체크 duty-health·정책 duty-down은 deploy/gcp/monitoring.sh가 만든 것을 그대로 쓴다.
# - duty-backup-missing(VM 백업 상태 파일)은 끈다 — Cloud Run에는 그 파일이 없어 계속 울린다. 체크·정책 삭제는 6단계 정리 때
# - VM 디스크·메모리 정책(duty-disk·duty-memory)은 VM을 멈추면 지표가 없어 울리지 않는다 — 6단계 정리 때 지운다
# - Cloud SQL 백업 실패 알림은 실패 로그 형식을 확인한 뒤 더한다(waypoint 13-serverless.md 남은 일)
set -euo pipefail
: "${PROJECT_ID:?PROJECT_ID가 필요합니다}" "${BUDGET_KRW:?BUDGET_KRW가 필요합니다}"
P=(--project="$PROJECT_ID")
run() { echo "+ $*" >&2; [ -n "${DRY_RUN:-}" ] || "$@"; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
API=https://monitoring.googleapis.com/v3/projects/$PROJECT_ID
api() { # GET 경로 | POST 경로 파일 | PATCH 경로?updateMask 파일
  local token
  token=$(gcloud auth print-access-token)
  if [ "$1" = GET ]; then
    curl -fsS -H "Authorization: Bearer $token" "$API/$2"
  else
    echo "+ $1 $2 ($(basename "$3"))"
    [ -n "${DRY_RUN:-}" ] || curl -fsS -X "$1" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
      --data @"$3" "https://monitoring.googleapis.com/v3/$2" >/dev/null
  fi
}
find_name() { { api GET "$1?pageSize=200" 2>/dev/null || echo "{}"; } | python3 -c "import json,sys;d=json.load(sys.stdin);print(next((x['name'] for x in d.get('$2',[]) if x.get('displayName')=='$3'),''))"; }

CHANNEL=$(find_name notificationChannels notificationChannels duty-email)
[ -n "$CHANNEL" ] || { echo "알림 채널 duty-email이 없습니다 — deploy/gcp/monitoring.sh를 먼저 돌리세요" >&2; exit 1; }

# 1) VM 백업 상태 파일 알림 끄기
OLD=$(find_name alertPolicies alertPolicies duty-backup-missing)
if [ -n "$OLD" ]; then
  echo '{"enabled": false}' >"$TMP/disable.json"
  api PATCH "$OLD?updateMask=enabled" "$TMP/disable.json"
fi

# 2) Cloud SQL·Cloud Run 알림 정책
policy() { # 이름 조건이름 필터 정렬 집계 비교 임계 지속(초) 안내
  if [ -n "$(find_name alertPolicies alertPolicies "$1")" ]; then
    echo "알림 정책 $1 있음 — 건너뜀"
    return
  fi
  cat >"$TMP/$1.json" <<JSON
{
  "displayName": "$1",
  "combiner": "OR",
  "notificationChannels": ["$CHANNEL"],
  "documentation": { "content": "$9", "mimeType": "text/markdown" },
  "conditions": [{
    "displayName": "$2",
    "conditionThreshold": {
      "filter": "$3",
      "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "$4"$5 }],
      "comparison": "$6",
      "thresholdValue": $7,
      "duration": "${8}s",
      "trigger": { "count": 1 }
    }
  }]
}
JSON
  python3 -m json.tool "$TMP/$1.json" >/dev/null
  api POST "projects/$PROJECT_ID/alertPolicies" "$TMP/$1.json"
}
policy duty-sql-cpu "Cloud SQL CPU 80% 초과 15분" \
  'metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" AND resource.type=\"cloudsql_database\"' \
  ALIGN_MEAN "" COMPARISON_GT 0.8 900 \
  "Cloud SQL duty-db의 CPU가 15분 넘게 80%를 넘었습니다. 쿼리 인사이트에서 느린 쿼리를 보고, 계속되면 등급(db-f1-micro)을 올리세요."
policy duty-sql-disk "Cloud SQL 디스크 80% 초과" \
  'metric.type=\"cloudsql.googleapis.com/database/disk/utilization\" AND resource.type=\"cloudsql_database\"' \
  ALIGN_MEAN "" COMPARISON_GT 0.8 600 \
  "Cloud SQL duty-db 디스크가 80%를 넘었습니다. 저장 공간 자동 증가가 켜져 있으니 비용 변화를 확인하세요."
policy duty-run-5xx "Cloud Run 5xx 5분에 5건 이상" \
  'metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND metric.label.response_code_class=\"5xx\"' \
  ALIGN_SUM ', "crossSeriesReducer": "REDUCE_SUM", "groupByFields": ["resource.label.service_name"]' COMPARISON_GT 4 0 \
  "Cloud Run에서 5xx가 5분에 5건 이상 났습니다. \`gcloud logging read 'resource.type=cloud_run_revision AND severity>=ERROR'\`로 원인을 보세요."

# 3) 월 예산 금액 바꾸기(전환한 달은 VM과 겹친다)
BILLING=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' | sed 's#billingAccounts/##')
BUDGET=$(gcloud billing budgets list --billing-project="$PROJECT_ID" --billing-account="$BILLING" \
  --filter='displayName=duty-monthly' --format='value(name)' 2>/dev/null | head -1)
if [ -n "$BUDGET" ]; then
  run gcloud billing budgets update "$BUDGET" --billing-project="$PROJECT_ID" --budget-amount="${BUDGET_KRW}KRW"
else
  echo "예산 duty-monthly가 없습니다 — deploy/gcp/monitoring.sh를 먼저 돌리세요" >&2
fi
echo "완료 — 알림 채널: $CHANNEL"
