---
phase: 03-operations
stage: 03-continuous-deployment
status: AI_PROPOSED
updated: 2026-10-10
---

# [Stage 3-3] 자동 배포 (main 머지 → 운영)

## 목적

`main`에 머지되고 CI가 통과하면 사람이 서버에 들어가지 않아도 운영(offplz.com)에 배포되게 한다. 배포 전 백업·배포 뒤 헬스 체크·실패 시 되돌리기는 지금 수동 절차와 같게 지킨다.

## 입력 (Inputs)

- [`01-deployment.md`](01-deployment.md) 운영 구성, 메인 저장소 `docs/operations.md` 5(업데이트·되돌리기), `.github/workflows/ci.yml`
- 사용자 답변(2026-10-10): GitHub Actions가 배포, 앱·설정이 바뀐 커밋만 다시 빌드

## 체크리스트

- [x] Build Spec 작성 → READY (2026-10-10)
- [ ] 구현·운영 적용 → IMPLEMENTED

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(light): [`cd/build-spec-index.md`](cd/build-spec-index.md)

요지:
- **흐름:** main push → CI `check` 통과 → `deploy` 작업(한 번에 하나) → GitHub OIDC로 GCP 배포 계정 → IAP SSH(30분 뒤 만료되는 임시 키) → 서버에서 새 커밋의 `deploy/deploy.sh`를 sudo로 실행.
- **권한:** 키 파일 없음. 토큰은 **이 저장소·main 브랜치·push 이벤트**에서만 나온다(공개 저장소 포크·PR은 못 씀). 배포 계정은 VM 조회·SSH 키 등록·IAP 터널·VM 서비스 계정 사용만. 사람의 SSH 방식(메타데이터 키)은 바뀌지 않는다.
- **서버 쪽:** 잠금 → 대상 커밋이 `origin/main`에 있고 지금보다 새 커밋인지 → 앱·설정 변경이 없으면 git만 따라감 → 있으면 백업(실패 시 중단) → `up -d --build` → 헬스 체크 2분 → 실패하면 이전 커밋으로 되돌려 다시 올림. DB 마이그레이션은 되돌리지 않는다(운영 문서 5·6).
- **비용:** 없음.

## 검토 게이트 (Human Gate)

- [ ] Build Spec과 권한 범위가 맞는가? (승인 = GCP 설정 적용)
- [ ] 적용 후: 실제 main push로 배포 1회(문서만 바뀐 커밋 → git만, 앱 변경 커밋 → 재빌드) 확인

## 다음 단계

승인 → `cd.sh` 적용 → 배포 확인 → HUMAN_APPROVED
