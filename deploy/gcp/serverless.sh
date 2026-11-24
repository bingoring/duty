#!/usr/bin/env bash
# Stage 3-13 — 서버 비용 절감: Cloud Run(요청 없으면 0) + Cloud SQL + Cloud Tasks + Firebase Hosting 자원을 만든다(비용 발생).
# 기본은 만들 명령을 출력만 한다(--dry-run). 실제 실행은 2단계(사람 승인) 뒤 --apply로. 이미 있는 자원은 건너뛴다.
#   ./deploy/gcp/serverless.sh infra                    # API·저장소·Cloud SQL·비밀값·서비스 계정·큐 (출력만)
#   ./deploy/gcp/serverless.sh --apply infra            # 실제로 만든다
#   ./deploy/gcp/serverless.sh --apply services <SHA>   # 그 커밋 이미지로 솔버·마이그레이션 Job·웹 첫 배포(이미지는 CI가 올린다)
#   ./deploy/gcp/serverless.sh --apply hosting          # Firebase 추가·Hosting 배포
# 설계: waypoint/projects/duty/03-operations/13-serverless.md
set -euo pipefail
DRY_RUN=1
case "${1:-}" in
  --apply) DRY_RUN= && shift ;;
  --dry-run) shift ;;
esac
PROJECT=${PROJECT:-duty-511008}
REGION=${REGION:-asia-northeast3}
SQL=${SQL:-duty-db}
DB=${DB:-duty}
DB_USER=${DB_USER:-duty}
QUEUE=${QUEUE:-duty-generate}
BUCKET=${BUCKET:-duty-511008-backups}
AR="${REGION}-docker.pkg.dev/${PROJECT}/duty"
CONN="${PROJECT}:${REGION}:${SQL}"
WEB_SA="duty-web@${PROJECT}.iam.gserviceaccount.com"
SOLVER_SA="duty-solver@${PROJECT}.iam.gserviceaccount.com"
DEPLOY_SA="duty-deployer@${PROJECT}.iam.gserviceaccount.com"
run() { echo "+ $*"; [ -n "$DRY_RUN" ] || "$@"; }
# 출력만 할 때는 조회도 하지 않고 '없음'으로 본다(gcloud 로그인 없이도 돈다)
exists() { [ -z "$DRY_RUN" ] && "$@" >/dev/null 2>&1; }
query() { [ -n "$DRY_RUN" ] && echo "$1" && return; shift; "$@" 2>/dev/null || true; }

infra() {
  run gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com cloudtasks.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com \
    --project="$PROJECT"

  # 이미지 저장소(서울) — 이미지별 최근 5개만 남긴다
  exists gcloud artifacts repositories describe duty --location="$REGION" --project="$PROJECT" ||
    run gcloud artifacts repositories create duty --repository-format=docker --location="$REGION" --project="$PROJECT"
  local policy
  policy=$(mktemp)
  echo '[{"name":"keep-5","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":5}},{"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"any"}}]' >"$policy"
  run gcloud artifacts repositories set-cleanup-policies duty --location="$REGION" --project="$PROJECT" \
    --policy="$policy" --no-dry-run

  # Cloud SQL — Enterprise 에디션이어야 공유 코어(db-f1-micro). 자동 백업 30개, 원하는 시점 복구(로그 7일)
  exists gcloud sql instances describe "$SQL" --project="$PROJECT" ||
    run gcloud sql instances create "$SQL" --project="$PROJECT" --region="$REGION" \
      --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-f1-micro --availability-type=zonal \
      --storage-type=SSD --storage-size=10 --storage-auto-increase \
      --backup-start-time=18:00 --retained-backups-count=30 \
      --enable-point-in-time-recovery --retained-transaction-log-days=7
  # 공개 IP는 있지만 허용 네트워크가 없다 — Cloud Run은 Cloud SQL 커넥터(IAM 인증 터널)로만 붙는다
  exists gcloud sql databases describe "$DB" --instance="$SQL" --project="$PROJECT" ||
    run gcloud sql databases create "$DB" --instance="$SQL" --project="$PROJECT"
  if [ -z "$(query '' gcloud sql users list --instance="$SQL" --project="$PROJECT" --filter="name=$DB_USER" --format='value(name)')" ]; then
    local pw
    pw=$(openssl rand -hex 24)
    echo "+ gcloud sql users create $DB_USER --instance=$SQL --project=$PROJECT --password=(출력하지 않음)"
    [ -n "$DRY_RUN" ] || gcloud sql users create "$DB_USER" --instance="$SQL" --project="$PROJECT" --password="$pw"
    # 소켓으로 붙으므로 URL의 호스트는 자리만 채운다(DB_SOCKET_HOST가 실제 경로)
    printf 'postgres://%s:%s@localhost/%s' "$DB_USER" "$pw" "$DB" | secret duty-database-url
  fi
  exists gcloud secrets describe duty-generation-task-key --project="$PROJECT" ||
    openssl rand -hex 32 | tr -d '\n' | secret duty-generation-task-key
  exists gcloud secrets describe duty-holiday-api-key --project="$PROJECT" ||
    echo "안내: 공휴일 API 키는 사용자가 넣는다 — printf '%s' KEY | gcloud secrets create duty-holiday-api-key --data-file=- --project=$PROJECT"

  # 서비스 계정과 역할
  for sa in duty-web duty-solver; do
    exists gcloud iam service-accounts describe "${sa}@${PROJECT}.iam.gserviceaccount.com" --project="$PROJECT" ||
      run gcloud iam service-accounts create "$sa" --display-name="$sa" --project="$PROJECT"
  done
  for role in roles/cloudsql.client roles/secretmanager.secretAccessor roles/cloudtasks.enqueuer; do
    run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$WEB_SA" --role="$role" --condition=None
  done
  # 배포 계정(GitHub OIDC, deploy/gcp/cd.sh가 만듦): 서비스·Job 배포, 이미지 올리기, Hosting 배포.
  # 실행 계정으로 배포하려면 그 계정에 한해 serviceAccountUser가 필요하다(프로젝트 전체에는 주지 않는다)
  for role in roles/run.admin roles/artifactregistry.writer roles/firebasehosting.admin; do
    run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOY_SA" --role="$role" --condition=None
  done
  for sa in "$WEB_SA" "$SOLVER_SA"; do
    run gcloud iam service-accounts add-iam-policy-binding "$sa" --project="$PROJECT" \
      --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser
  done

  # 생성 작업 큐(서울) — 재시도 2회. 작업은 web의 run.app 엔드포인트를 비밀 키 헤더(x-duty-task-key)로 부르므로
  # 따로 OIDC용 서비스 계정(duty-tasks)은 두지 않는다
  exists gcloud tasks queues describe "$QUEUE" --location="$REGION" --project="$PROJECT" ||
    run gcloud tasks queues create "$QUEUE" --location="$REGION" --project="$PROJECT" --max-attempts=3

  # 전환 때 덤프 파일을 Cloud SQL이 버킷에서 읽는다
  local sql_sa
  sql_sa=$(query SQL_SA gcloud sql instances describe "$SQL" --project="$PROJECT" --format='value(serviceAccountEmailAddress)')
  run gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$sql_sa" --role=roles/storage.objectViewer
}

secret() {
  local name=$1
  if [ -n "$DRY_RUN" ]; then
    echo "+ gcloud secrets create $name --data-file=- (값은 출력하지 않음)"
    cat >/dev/null
  else
    gcloud secrets create "$name" --replication-policy=user-managed --locations="$REGION" --data-file=- --project="$PROJECT"
  fi
}

services() {
  local sha=${1:?커밋 SHA가 필요합니다}
  local tag="c${sha:0:7}"
  run gcloud run deploy duty-solver --project="$PROJECT" --region="$REGION" --image="$AR/solver:$sha" \
    --service-account="$SOLVER_SA" --no-allow-unauthenticated --port=8100 --cpu=2 --memory=1Gi \
    --concurrency=1 --timeout=300 --min-instances=0 --max-instances=2 --set-env-vars=SOLVER_WORKERS=2 \
    --labels=commit-sha="$sha"
  local solver_url
  solver_url=$(query SOLVER_URL gcloud run services describe duty-solver --project="$PROJECT" --region="$REGION" --format='value(status.url)')
  run gcloud run services add-iam-policy-binding duty-solver --project="$PROJECT" --region="$REGION" \
    --member="serviceAccount:$WEB_SA" --role=roles/run.invoker

  # 3-13 스테이징 확인: Firebase Hosting을 거치면 X-Forwarded-For가 「클라이언트, Google 프런트」 두 개라 hops 2
  # (Firebase는 들어온 X-Forwarded-For를 버린다). 시작 프로브 기본 간격 10초는 콜드스타트를 ~10초 늘려 1초로
  local env="DB_SOCKET_HOST=/cloudsql/$CONN,DB_POOL_MAX=4,SOLVER_URL=$solver_url,TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-2}"
  run gcloud run jobs deploy duty-migrate --project="$PROJECT" --region="$REGION" --image="$AR/tools:$sha" \
    --service-account="$WEB_SA" --set-cloudsql-instances="$CONN" \
    --set-env-vars="DB_SOCKET_HOST=/cloudsql/$CONN,DB_POOL_MAX=2" \
    --set-secrets=DATABASE_URL=duty-database-url:latest --max-retries=0 --task-timeout=600
  run gcloud run jobs execute duty-migrate --project="$PROJECT" --region="$REGION" --wait

  run gcloud run deploy duty-web --project="$PROJECT" --region="$REGION" --image="$AR/web:$sha" \
    --service-account="$WEB_SA" --allow-unauthenticated --set-cloudsql-instances="$CONN" \
    --cpu=1 --memory=1Gi --min-instances=0 --max-instances=2 --timeout=300 \
    --startup-probe=httpGet.path=/api/health,periodSeconds=1,failureThreshold=30,timeoutSeconds=1 \
    --set-env-vars="$env" \
    --set-secrets=DATABASE_URL=duty-database-url:latest,GENERATION_TASK_KEY=duty-generation-task-key:latest \
    --labels=commit-sha="$sha" --tag="$tag"
  local web_url
  web_url=$(query WEB_URL gcloud run services describe duty-web --project="$PROJECT" --region="$REGION" --format='value(status.url)')
  run gcloud run services update duty-web --project="$PROJECT" --region="$REGION" \
    --update-env-vars="GENERATION_QUEUE=projects/$PROJECT/locations/$REGION/queues/$QUEUE,GENERATION_TASK_URL=$web_url/api/generate/run"
  if exists gcloud secrets describe duty-holiday-api-key --project="$PROJECT"; then
    run gcloud run services update duty-web --project="$PROJECT" --region="$REGION" \
      --update-secrets=HOLIDAY_API_KEY=duty-holiday-api-key:latest
  fi
}

hosting() {
  run npx --yes firebase-tools@14 projects:addfirebase "$PROJECT"
  run npx --yes firebase-tools@14 deploy --only hosting --project "$PROJECT"
}

case "${1:-all}" in
  infra) infra ;;
  services) services "${2:-}" ;;
  hosting) hosting ;;
  all) infra && echo "다음: CI가 이미지를 올린 뒤 '$0 --apply services <SHA>', 그다음 '$0 --apply hosting'" ;;
  *) echo "사용: $0 [--dry-run|--apply] [infra|services <SHA>|hosting]" >&2 && exit 2 ;;
esac
