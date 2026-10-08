#!/usr/bin/env bash
# Build Spec 3-1 — GCP 자원 생성(비용 발생). 새 프로젝트에 서울 VM·고정 IP·방화벽·백업 버킷·서비스 계정을 만든다.
#   PROJECT_ID=duty-xxxx BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX BUCKET=duty-xxxx-backups ./deploy/gcp/provision.sh
#   DRY_RUN=1 이면 실행할 명령만 출력한다
set -euo pipefail
: "${PROJECT_ID:?PROJECT_ID가 필요합니다}" "${BILLING_ACCOUNT:?BILLING_ACCOUNT가 필요합니다}" "${BUCKET:?BUCKET이 필요합니다}"
REGION=${REGION:-asia-northeast3}
ZONE=${ZONE:-asia-northeast3-a}
MACHINE=${MACHINE:-e2-medium}
SA=duty-vm@${PROJECT_ID}.iam.gserviceaccount.com
run() { echo "+ $*"; [ -n "${DRY_RUN:-}" ] || "$@"; }

# 1) 프로젝트·결제·API
run gcloud projects create "$PROJECT_ID" --name=duty
run gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
run gcloud services enable compute.googleapis.com storage.googleapis.com iap.googleapis.com --project="$PROJECT_ID"

# 2) VM 서비스 계정 — 백업 버킷에 쓰기(+존재 확인용 읽기)만, 삭제 권한 없음(R-OPS-2)
run gcloud iam service-accounts create duty-vm --display-name="duty VM" --project="$PROJECT_ID"
[ -n "${DRY_RUN:-}" ] || sleep 15 # 새 서비스 계정이 IAM에 퍼질 때까지

# 3) 백업 버킷 — 서울, 공개 차단, 90일 뒤 삭제(R-OPS-3)
run gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT_ID" --location="$REGION" \
  --uniform-bucket-level-access --public-access-prevention
LC=$(mktemp)
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":90}}]}' > "$LC"
run gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$LC"
for role in roles/storage.objectCreator roles/storage.objectViewer; do
  run gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA" --role="$role"
done

# 4) 네트워크 — 조직 정책으로 기본 네트워크가 안 만들어졌으면 만든다
if [ -z "${DRY_RUN:-}" ] && ! gcloud compute networks describe default --project="$PROJECT_ID" >/dev/null 2>&1; then
  run gcloud compute networks create default --subnet-mode=auto --project="$PROJECT_ID"
fi

# 5) 고정 IP · 방화벽 — 80·443만 공개, SSH는 IAP 대역만(R-OPS-1). 기본 SSH·RDP 전체 허용 규칙은 지운다
run gcloud compute addresses create duty-ip --region="$REGION" --project="$PROJECT_ID"
run gcloud compute firewall-rules create duty-web --project="$PROJECT_ID" --network=default \
  --allow=tcp:80,tcp:443,udp:443 --target-tags=duty-web --source-ranges=0.0.0.0/0
run gcloud compute firewall-rules create duty-ssh-iap --project="$PROJECT_ID" --network=default \
  --allow=tcp:22 --target-tags=duty-web --source-ranges=35.235.240.0/20
for r in default-allow-ssh default-allow-rdp; do
  run gcloud compute firewall-rules delete "$r" --project="$PROJECT_ID" --quiet || true
done

# 6) VM — e2-medium(2vCPU·4GB), Ubuntu 24.04, 30GB, 보안 부팅
run gcloud compute instances create duty-vm --project="$PROJECT_ID" --zone="$ZONE" \
  --machine-type="$MACHINE" --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-balanced --address=duty-ip --tags=duty-web \
  --service-account="$SA" --scopes=https://www.googleapis.com/auth/devstorage.read_write \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring

echo
echo "고정 IP (도메인 DNS A 레코드에 넣을 값):"
run gcloud compute addresses describe duty-ip --region="$REGION" --project="$PROJECT_ID" --format='value(address)'
