#!/usr/bin/env bash
# Build Spec 3-3 R-CD-1·2 — GitHub Actions가 키 파일 없이(OIDC) 배포하도록 GCP를 설정한다. 비용 없음.
#   PROJECT_ID=duty-511008 REPO=bingoring/duty ./deploy/gcp/cd.sh      (DRY_RUN=1 이면 명령만 출력)
# 이 저장소의 main 브랜치 push에서만 토큰이 나온다. 배포 계정은 VM에 IAP SSH(임시 키)로 들어가 sudo로 deploy/deploy.sh를 돌린다
set -euo pipefail
: "${PROJECT_ID:?PROJECT_ID가 필요합니다}" "${REPO:?REPO(owner/name)가 필요합니다}"
ZONE=${ZONE:-asia-northeast3-a}
VM=${VM:-duty-vm}
P=(--project="$PROJECT_ID")
SA=duty-deployer@${PROJECT_ID}.iam.gserviceaccount.com
VM_SA=duty-vm@${PROJECT_ID}.iam.gserviceaccount.com
run() { echo "+ $*" >&2; [ -n "${DRY_RUN:-}" ] || "$@"; }
exists() { "$@" >/dev/null 2>&1; }
NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

run gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iap.googleapis.com "${P[@]}"

# 1) 배포 서비스 계정
exists gcloud iam service-accounts describe "$SA" "${P[@]}" ||
  run gcloud iam service-accounts create duty-deployer --display-name="duty GitHub 배포" "${P[@]}"

# 2) Workload Identity 풀·공급자 — 이 저장소의 main push만
exists gcloud iam workload-identity-pools describe github --location=global "${P[@]}" ||
  run gcloud iam workload-identity-pools create github --location=global --display-name=GitHub "${P[@]}"
exists gcloud iam workload-identity-pools providers describe github --workload-identity-pool=github --location=global "${P[@]}" ||
  run gcloud iam workload-identity-pools providers create-oidc github --workload-identity-pool=github --location=global "${P[@]}" \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref \
    --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main' && assertion.event_name=='push'"
run gcloud iam service-accounts add-iam-policy-binding "$SA" "${P[@]}" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null

# 3) 최소 권한: VM 조회·SSH 키 메타데이터 등록(임시 키) + IAP 터널 + VM 서비스 계정 사용(SSH에 필요)
exists gcloud iam roles describe dutyDeployer "${P[@]}" ||
  run gcloud iam roles create dutyDeployer "${P[@]}" --title="duty deployer" \
    --permissions=compute.instances.get,compute.instances.setMetadata,compute.zoneOperations.get,compute.projects.get
for role in "projects/$PROJECT_ID/roles/dutyDeployer" roles/iap.tunnelResourceAccessor; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$role" --condition=None >/dev/null
done
run gcloud iam service-accounts add-iam-policy-binding "$VM_SA" "${P[@]}" --role=roles/iam.serviceAccountUser \
  --member="serviceAccount:$SA" >/dev/null

# 4) GitHub 저장소 변수(비밀값 아님)
PROVIDER="projects/$NUMBER/locations/global/workloadIdentityPools/github/providers/github"
run gh variable set GCP_WIF_PROVIDER --repo "$REPO" --body "$PROVIDER"
run gh variable set GCP_DEPLOY_SA --repo "$REPO" --body "$SA"
run gh variable set GCP_PROJECT --repo "$REPO" --body "$PROJECT_ID"
run gh variable set GCP_ZONE --repo "$REPO" --body "$ZONE"
echo "완료 — 공급자 $PROVIDER, 배포 계정 $SA"
