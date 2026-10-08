---
phase: 03-operations
stage: 02-monitoring
status: AI_PROPOSED
updated: 2026-10-09
---

# [Stage 3-2] Monitoring

## 목적

offplz.com이 멈추거나, 매일 백업이 빠지거나, 서버 자원·비용이 넘칠 때 운영자(수간호사 쪽 담당자)가 **이메일로 먼저 알게** 한다.
실제 데이터가 든 백업으로 복구 리허설을 해 복구 절차를 검증한다.

## 입력 (Inputs)

- [`01-deployment.md`](01-deployment.md) 운영 구성(GCP `duty-511008`, `duty-vm`, 버킷 `duty-511008-backups`, `/api/health`, backup 컨테이너)
- 메인 저장소 `docs/operations.md`(장애 대응·백업·복구), `deploy/backup/backup.sh`, `deploy/gcp/provision.sh`
- 사용자 답변(2026-10-09): 알림 = 이메일, 감시 = 접속·백업·디스크/메모리·비용, 복구 리허설은 3-2 안에서

## 체크리스트

- [ ] Build Spec 작성·질문 해소 → READY
- [ ] Build Spec §4 구현 체크리스트 전 항목 완료
- [ ] Build Spec §5 검증 통과 → IMPLEMENTED

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(light): [`monitoring/build-spec-index.md`](monitoring/build-spec-index.md) (READY 후보)

요지:
- **접속:** GCP 업타임 체크가 5분마다 여러 지역에서 `https://offplz.com/api/health`를 부르고, 10분 넘게 실패하면 이메일.
- **백업:** 백업 컨테이너가 버킷 업로드까지 성공하면 상태 파일에 시각을 쓰고, 앱의 `/api/health/backup`이 그 시각이 26시간을 넘었으면 503을 돌려준다. 이 주소도 업타임 체크로 감시 → 실패·누락 모두 이메일(새 인프라 없이 같은 방식).
- **디스크·메모리:** VM에 Ops Agent를 설치하고 디스크 80% 이상·메모리 90% 이상 10분 지속 시 이메일.
- **비용:** 결제 계정에 이 프로젝트 전용 월 예산(금액은 사용자 지정)을 만들고 50·90·100%에서 이메일.
- **설정은 스크립트로:** `deploy/gcp/monitoring.sh`(멱등, `DRY_RUN`) — 3-1 `provision.sh`와 같은 방식. 비용이 생기는 항목은 없다(업타임 체크·알림·Ops Agent 기본 지표는 무료 범위).
- **복구 리허설:** 사용자 PC에서 최신 백업 복호화 → 로컬 Docker Postgres 별도 DB에 복구 → 운영과 행 수 대조(AI가 명령 안내·운영 쪽 행 수 조회).
- **알림 확인:** 업타임 체크를 일부러 실패시키는 대신, 알림 정책의 테스트 알림과 `/api/health/backup`의 503 경로를 로컬·통합 테스트로 확인한다.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 감시 항목·임계값·알림 대상이 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: 알림 수신 확인(테스트 메일), 복구 리허설 행 수 일치

## 다음 단계

승인 → 구현 → IMPLEMENTED → 승인 → 3-3(유지보수·피드백) 또는 운영 안정화
