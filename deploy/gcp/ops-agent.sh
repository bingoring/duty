#!/usr/bin/env bash
# Build Spec 3-2 R-MON-5 — VM에 Ops Agent(지표만)를 설치한다. PC에서 실행한다.
#   PROJECT_ID=duty-511008 ./deploy/gcp/ops-agent.sh     (DRY_RUN=1 이면 명령만 출력)
# ⚠️ VM 접근 범위에 monitoring.write를 더하려면 VM을 멈췄다 켜야 한다(1분 안팎 접속 불가). 이미 있으면 건너뛴다
set -euo pipefail
: "${PROJECT_ID:?PROJECT_ID가 필요합니다}"
ZONE=${ZONE:-asia-northeast3-a}
VM=${VM:-duty-vm}
SA=duty-vm@${PROJECT_ID}.iam.gserviceaccount.com
P=(--project="$PROJECT_ID")
run() { echo "+ $*"; [ -n "${DRY_RUN:-}" ] || "$@"; }

# 1) 서비스 계정: 지표 쓰기만(로그는 보내지 않는다)
run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" \
  --role=roles/monitoring.metricWriter --condition=None >/dev/null

# 2) 접근 범위: 백업 버킷(devstorage.read_write) + 지표 쓰기
SCOPES=$(gcloud compute instances describe "$VM" --zone="$ZONE" "${P[@]}" --format='value(serviceAccounts[0].scopes)')
if [[ "$SCOPES" == *monitoring.write* ]]; then
  echo "접근 범위에 monitoring.write 있음 — 건너뜀"
else
  run gcloud compute instances stop "$VM" --zone="$ZONE" "${P[@]}"
  run gcloud compute instances set-service-account "$VM" --zone="$ZONE" "${P[@]}" --service-account="$SA" \
    --scopes=https://www.googleapis.com/auth/devstorage.read_write,https://www.googleapis.com/auth/monitoring.write
  run gcloud compute instances start "$VM" --zone="$ZONE" "${P[@]}"
fi

# 3) 설치 + 지표만 보내는 설정(기본 로그 파이프라인 끔). compose는 restart: unless-stopped라 재시작 뒤 스스로 올라온다
run gcloud compute ssh "$VM" --zone="$ZONE" "${P[@]}" --tunnel-through-iap --command='set -e
if ! systemctl is-active --quiet google-cloud-ops-agent; then
  curl -fsSL https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh -o /tmp/ops.sh
  sudo bash /tmp/ops.sh --also-install
fi
sudo tee /etc/google-cloud-ops-agent/config.yaml >/dev/null <<YAML
logging:
  service:
    pipelines:
      default_pipeline:
        receivers: []
metrics:
  service:
    pipelines:
      default_pipeline:
        receivers: [hostmetrics]
YAML
sudo systemctl restart google-cloud-ops-agent
systemctl is-active google-cloud-ops-agent'
