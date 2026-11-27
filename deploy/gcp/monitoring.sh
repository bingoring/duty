#!/usr/bin/env bash
# 감시 설정(비용이 생기지 않는 범위) — 이메일 알림 채널·업타임 체크·알림 정책·월 예산.
#   PROJECT_ID=duty-511008 BUDGET_KRW=30000 [ALERT_EMAIL=you@example.com] [DOMAIN=offplz.com] ./deploy/gcp/monitoring.sh
#   DRY_RUN=1 이면 실행할 명령만 출력한다. 이름으로 찾아 이미 있으면 건너뛴다(멱등). 예산은 금액을 맞춘다
#   ALERT_EMAIL은 알림 채널이 없을 때(처음 한 번)만 필요하다
# 3-2(R-MON-1~8)에서 VM용으로 만들고, 3-13에서 Cloud Run·Cloud SQL용으로 바꿨다:
#   VM 백업 상태 파일 체크(duty-backup)·디스크·메모리(Ops Agent) 정책은 없앴고, Cloud SQL·Cloud Run 정책을 더했다.
#   Cloud SQL 백업 실패 알림은 아직 없다(실패 로그 형식을 확인한 뒤 더한다 — docs/waypoint/03-operations/13-serverless.md)
set -euo pipefail
: "${PROJECT_ID:?PROJECT_ID가 필요합니다}" "${BUDGET_KRW:?BUDGET_KRW가 필요합니다}"
DOMAIN=${DOMAIN:-offplz.com}
P=(--project="$PROJECT_ID")
run() { echo "+ $*" >&2; [ -n "${DRY_RUN:-}" ] || "$@"; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# 알림 채널·정책은 gcloud alpha/beta에만 있어 정식 REST API(v3)를 직접 부른다(구성 요소 설치 없이).
# 접근 토큰이 출력되지 않게 curl은 run으로 감싸지 않는다
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
  : "${ALERT_EMAIL:?알림 채널이 없어 ALERT_EMAIL이 필요합니다}"
  printf '{"type":"email","displayName":"duty-email","labels":{"email_address":"%s"}}' "$ALERT_EMAIL" >"$TMP/channel.json"
  api POST notificationChannels "$TMP/channel.json"
  CHANNEL=$(find_name notificationChannels notificationChannels duty-email)
fi
CHANNEL=${CHANNEL:-projects/$PROJECT_ID/notificationChannels/DRY_RUN}

# 2) 업타임 체크 (R-MON-1) — Firebase Hosting을 거쳐 Cloud Run web의 /api/health
uptime_id() {
  gcloud monitoring uptime list-configs "${P[@]}" --filter="displayName=\"$1\"" --format='value(name)' 2>/dev/null |
    head -1 | sed 's#.*/##'
}
if [ -n "$(uptime_id duty-health)" ]; then
  echo "업타임 체크 duty-health 있음 — 건너뜀"
else
  run gcloud monitoring uptime create duty-health "${P[@]}" --resource-type=uptime-url \
    --resource-labels=host="$DOMAIN",project_id="$PROJECT_ID" --protocol=https --path=/api/health \
    --period=5 --timeout=10 --regions=asia-pacific,usa-oregon,europe
fi

# 3) 알림 정책
policy() { # 이름 파일
  if [ -n "$(find_name alertPolicies alertPolicies "$1")" ]; then
    echo "알림 정책 $1 있음 — 건너뜀"
    return
  fi
  python3 -m json.tool "$2" >/dev/null # JSON 형식 확인
  api POST alertPolicies "$2"
}

# 접속 실패 10분(R-MON-1). 정렬 구간이 체크 주기보다 길어야 지역별 마지막 결과를 센다
HEALTH_ID=$(uptime_id duty-health)
cat >"$TMP/duty-down.json" <<JSON
{
  "displayName": "duty-down",
  "combiner": "OR",
  "notificationChannels": ["$CHANNEL"],
  "documentation": { "content": "offplz.com에 접속되지 않습니다. Cloud Run duty-web 리비전·로그와 Firebase Hosting 상태를 보세요(docs/operations.md 장애 대응).", "mimeType": "text/markdown" },
  "conditions": [{
    "displayName": "duty-health 실패",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${HEALTH_ID:-DRY_RUN}\"",
      "aggregations": [{ "alignmentPeriod": "1200s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.*"] }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 1,
      "duration": "600s",
      "trigger": { "count": 1 }
    }
  }]
}
JSON
policy duty-down "$TMP/duty-down.json"

metric_policy() { # 이름 조건이름 필터 정렬 집계 비교 임계 지속(초) 안내
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
  policy "$1" "$TMP/$1.json"
}
metric_policy duty-sql-cpu "Cloud SQL CPU 80% 초과 15분" \
  'metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" AND resource.type=\"cloudsql_database\"' \
  ALIGN_MEAN "" COMPARISON_GT 0.8 900 \
  "Cloud SQL duty-db의 CPU가 15분 넘게 80%를 넘었습니다. 쿼리 인사이트에서 느린 쿼리를 보고, 계속되면 등급(db-f1-micro)을 올리세요."
metric_policy duty-sql-disk "Cloud SQL 디스크 80% 초과" \
  'metric.type=\"cloudsql.googleapis.com/database/disk/utilization\" AND resource.type=\"cloudsql_database\"' \
  ALIGN_MEAN "" COMPARISON_GT 0.8 600 \
  "Cloud SQL duty-db 디스크가 80%를 넘었습니다. 저장 공간 자동 증가가 켜져 있으니 비용 변화를 확인하세요."
metric_policy duty-run-5xx "Cloud Run 5xx 5분에 5건 이상" \
  'metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND metric.label.response_code_class=\"5xx\"' \
  ALIGN_SUM ', "crossSeriesReducer": "REDUCE_SUM", "groupByFields": ["resource.label.service_name"]' COMPARISON_GT 4 0 \
  "Cloud Run에서 5xx가 5분에 5건 이상 났습니다. \`gcloud logging read 'resource.type=cloud_run_revision AND severity>=ERROR'\`로 원인을 보세요."

# 4) 월 예산 (R-MON-6) — 결제 계정 관리자 이메일 + 알림 채널. 있으면 금액만 맞춘다
BILLING=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' | sed 's#billingAccounts/##')
NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
# 예산 API는 할당량 프로젝트가 필요하다 — gcloud 기본 프로젝트가 다른 곳이어도 이 프로젝트로 부른다
BUDGET=$(gcloud billing budgets list --billing-project="$PROJECT_ID" --billing-account="$BILLING" \
  --filter='displayName=duty-monthly' --format='value(name)' 2>/dev/null | head -1)
if [ -n "$BUDGET" ]; then
  if [ "$(gcloud billing budgets describe "$BUDGET" --billing-project="$PROJECT_ID" --format='value(amount.specifiedAmount.units)')" = "$BUDGET_KRW" ]; then
    echo "예산 duty-monthly ${BUDGET_KRW}원 — 건너뜀"
  else
    run gcloud billing budgets update "$BUDGET" --billing-project="$PROJECT_ID" --budget-amount="${BUDGET_KRW}KRW" >/dev/null
  fi
else
  run gcloud billing budgets create --billing-project="$PROJECT_ID" --billing-account="$BILLING" --display-name=duty-monthly \
    --budget-amount="${BUDGET_KRW}KRW" --filter-projects="projects/$NUMBER" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
    --notifications-rule-monitoring-notification-channels="$CHANNEL"
fi
echo "완료 — 알림 채널: $CHANNEL"
