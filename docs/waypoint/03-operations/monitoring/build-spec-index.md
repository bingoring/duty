---
build-spec: monitoring
stage: 03-operations/02-monitoring
status: IMPLEMENTED
depth: light
updated: 2026-10-09
---

# Build Spec — 3-2 Monitoring

## §0. 개요 & 범위
- **목표(한 줄):** 접속·백업·자원·비용 이상을 이메일로 알리고, 실제 데이터 백업으로 복구를 검증한다.
- **SoT:** 3-1 운영 구성, 사용자 답변(2026-10-09).
- **규모/제약:** 앱 변경은 엔드포인트 1개·백업 상태 파일 1개. 나머지는 GCP 설정 스크립트. 개인정보는 알림·지표에 넣지 않는다.
- **깊이 티어 & 사유:** `light` — 새 도메인 규칙 없음, 운영 설정 중심.

## §1. 규칙

| ID | 규칙 |
|---|---|
| R-MON-1 | 업타임 체크 `duty-health`: `GET https://offplz.com/api/health`, 5분 간격, 지역 3곳 이상, 응답 10초. 2회 연속(10분) 실패 → 알림 |
| R-MON-2 | 백업 상태: `backup.sh`가 원격 업로드까지 성공하면(원격이 없으면 로컬 저장 성공) `/backup-status/last-ok`에 epoch 초를 쓴다. 실패하면 쓰지 않는다 |
| R-MON-3 | `GET /api/health/backup`: 상태 파일이 없거나 26시간보다 오래되면 503, 아니면 200. 본문은 `{"ok":bool}`만(시각·파일 이름 등은 내보내지 않는다). 상태 디렉터리는 web에 읽기 전용으로 마운트 |
| R-MON-4 | 업타임 체크 `duty-backup`: R-MON-3 주소, 15분 간격(업타임 체크 최대 주기). 실패가 이어지면 → 알림. 배포 직후처럼 상태 파일이 없는 동안 알림이 오지 않게 배포 때 `backup.sh`를 한 번 돌린다(운영 문서) |
| R-MON-5 | Ops Agent(지표만): 디스크 사용률(`/`) 80% 이상 10분, 메모리 사용률 90% 이상 10분 → 알림 |
| R-MON-6 | 예산 `duty-monthly`: 이 프로젝트만, 월 50,000원, 50·90·100%(실제) → 결제 관리자 이메일 + 알림 채널 |
| R-MON-7 | 알림 채널 하나(이메일 사용자 주소). 모든 정책은 이 채널로, 문서(`documentation`)에 `docs/operations.md` 장애 대응 표의 해당 행 안내를 넣는다 |
| R-MON-8 | 설정 스크립트 `deploy/gcp/monitoring.sh`: 멱등(이름으로 찾아 있으면 건너뜀), `DRY_RUN=1`이면 명령만 출력, 필요한 env는 `PROJECT_ID`·`ALERT_EMAIL`·`BUDGET_KRW`·`BILLING_ACCOUNT` |
| R-MON-9 | 복구 리허설: 최신 버킷 백업 → 사용자 PC에서 `age -d` → 로컬 Postgres 별도 DB(`duty_restore_check`)에 `pg_restore` → 주요 표(users·schedule_cells·balance_entries·month_settlements·month_plans) 행 수가 운영과 같음. 끝나면 복호화 파일과 DB를 지운다 |

## §2. 구현 체크리스트
- [x] `backup.sh` 상태 파일, compose `backup-status` 볼륨(backup 쓰기, web 읽기 전용)
- [x] `/api/health/backup` + 단위 테스트(없음·오래됨·정상, 본문 최소)
- [x] `deploy/gcp/monitoring.sh`(채널·업타임 2·알림 정책 4·예산, DRY_RUN 확인), `deploy/gcp/ops-agent.sh`(지표만)
- [x] `docs/operations.md`: 감시·알림 절(4-1), 배포 직후 백업 1회
- [x] 운영 적용(사람 승인): 서버 갱신 → 백업 1회 → `/api/health/backup` 200 → 스크립트 실행(채널·업타임 2·정책 4·예산) → Ops Agent(VM 재시작, 디스크 지표 `/dev/sda1` 확인) (2026-10-09)
- [x] 테스트 알림 수신(사용자, 2026-10-09) — 콘솔 테스트는 API가 없어 반드시 울리는 임시 정책으로 보내고 10분 뒤 삭제
- [x] 복구 리허설(사용자 PC) → 행 수 대조: 표 8개(users 14·schedule_cells 3,299·balance_entries 219·month_settlements 99·month_plans 11·credentials 14·holidays 45·migrations 7) 운영과 일치

## §3. 미해결 질문
없음. Q1 알림 이메일 = 사용자 주소, Q2 월 예산 = 5만 원(DECISIONS 2026-10-09).

## §4. 검증 계획
- [x] format·typecheck·lint·단위 412·통합 162·E2E 43 그린, `next build` 성공
- [x] 운영에서 확인: 백업 뒤 `/api/health/backup` 200(로컬 compose 리허설 대신, 503 경로는 단위 테스트)
- [x] 운영: 업타임 체크 두 개·알림 정책 4개·예산 생성, 테스트 알림 메일 수신
- [x] 복구 리허설 행 수 일치

## §5. 편차 로그 — 구현 후

| SoT | 실제 구현 | 사유 |
|---|---|---|
| R-MON-4 30분 간격 | 15분 | 업타임 체크 주기는 1·5·10·15분만 |
| R-MON-8 gcloud 명령 | 알림 채널·정책은 Monitoring REST API(v3)를 curl로 | gcloud는 alpha/beta에만 있고 구성 요소 설치 확인 화면에서 멈춘다 |
| R-MON-7 알림 주소 = 사용자 회사 주소 | 사용자가 콘솔에서 개인 메일로 바꿈 | 사용자 결정. 스크립트는 채널이 있으면 건드리지 않는다 |
| R-MON-8 예산 생성 | `--billing-project`로 이 프로젝트를 할당량 프로젝트로 지정 | gcloud 기본 프로젝트가 다른 프로젝트라 예산 API가 그쪽에서 막혔다 |
| §2 Ops Agent 설치 | VM 접근 범위에 `monitoring.write` 추가(재시작) + 서비스 계정 `monitoring.metricWriter`, 로그 파이프라인은 끔 | 3-1 VM은 저장소 범위만 있었다. 로그는 보내지 않아 개인정보가 GCP 로깅에 남지 않는다 |
