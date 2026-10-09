---
build-spec: cd
stage: 03-operations/03-continuous-deployment
status: READY
depth: light
updated: 2026-10-10
---

# Build Spec — 3-3 자동 배포

## §0. 개요 & 범위
- **목표(한 줄):** main 머지 + CI 통과 → 운영 자동 배포(백업·헬스 체크·되돌리기 포함).
- **SoT:** 사용자 답변(2026-10-10), 운영 문서 5.
- **깊이 티어 & 사유:** `light` — 운영 절차 자동화, 앱 변경 없음.

## §1. 규칙

| ID | 규칙 |
|---|---|
| R-CD-1 | GitHub OIDC → Workload Identity 풀 `github`. 조건 `repository == bingoring/duty && ref == refs/heads/main && event_name == push`. 서비스 계정 키 파일은 만들지 않는다 |
| R-CD-2 | 배포 계정 `duty-deployer` 권한: 사용자 정의 역할(instances.get·setMetadata·zoneOperations.get·projects.get) + `iap.tunnelResourceAccessor` + VM 서비스 계정의 `serviceAccountUser`. SSH 키는 `--ssh-key-expire-after=30m` |
| R-CD-3 | 서버의 현재 커밋 → 대상 커밋 사이에 운영 파일(apps·packages·services·deploy/backup·Caddyfile·deploy.sh·compose·lock·package·workspace·.nvmrc)이 안 바뀌었으면 fast-forward만 |
| R-CD-4 | 다시 빌드할 때는 먼저 백업(`backup.sh`). 실패하면 배포하지 않는다 |
| R-CD-5 | 대상 커밋은 `origin/main`에 있어야 하고 지금 커밋보다 뒤여야 한다(되감기 금지). 배포는 서버 잠금(`flock`) + GitHub `concurrency`로 한 번에 하나 |
| R-CD-6 | `up -d --build` 뒤 `https://<DOMAIN>/api/health` 2분 안 200이 아니면 이전 커밋으로 되돌려 다시 올리고 작업을 실패로 끝낸다. 마이그레이션은 되돌리지 않는다 |
| R-CD-7 | 저장소 변수(`GCP_WIF_PROVIDER` 등)가 없으면 `deploy` 작업을 건너뛴다(설정 전·포크) |

## §2. 구현 체크리스트
- [x] `deploy/deploy.sh`, `deploy/gcp/cd.sh`, `ci.yml` `deploy` 작업, 운영 문서 5
- [x] `cd.sh` 운영 적용(사람 승인, 2026-10-10) → 저장소 변수 4개
- [x] 배포 확인: 앱 변경 커밋 2번(`255b52d`·`b69d760`) 백업 → 재빌드 → 헬스 체크 → `deploy_ok`
- [ ] 문서만 바뀐 커밋 → `deploy_docs_only`(이 기록 커밋으로 확인)

## §3. 미해결 질문
없음.

## §4. 편차 로그 — 구현 후

| SoT | 실제 구현 | 사유 |
|---|---|---|
| R-CD-6 실패 감지 | 스크립트 전체를 `main()`으로 감싸고 표준 입력을 닫음 + 워크플로가 끝 표시(`deploy_ok`·`deploy_skip`·`deploy_docs_only`)를 확인 | 첫 자동 배포에서 `docker compose exec`가 표준 입력으로 보낸 스크립트의 나머지를 읽어, 백업만 하고 성공(0)으로 끝났다 |
