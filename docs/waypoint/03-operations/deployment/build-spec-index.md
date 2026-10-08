---
build-spec: deployment
stage: 03-operations/01-deployment
status: READY
depth: standard
updated: 2026-10-08
---

# Build Spec — 3-1 Deployment (GCP)

## §0. 개요 & 범위
- **목표(한 줄):** 같은 compose 한 벌에 Caddy·백업을 더해 GCP 서울 VM 한 대에 올리고, 설치·업데이트·백업·복구를 문서와 스크립트로 반복 가능하게 만든다.
- **SoT:** 1-3 §8 ①, R-1 보류 항목(3-1 몫), DECISIONS 2026-10-08 「3-1 배포」.
- **규모/제약:** 사용자 11명 안팎, 동시 접속 소수. 솔버는 생성 때만 CPU를 쓴다(2vCPU에서 `SOLVER_WORKERS=2`).
- **깊이 티어 & 사유:** `standard` — 새 화면은 없지만 보안·백업·복구가 틀리면 되돌리기 어렵다.

## §1. 분해

| 단위 | 책임 | 신규/기존 |
|---|---|---|
| `compose.prod.yaml` | `caddy` 추가(80·443 공개, 인증서 볼륨), `web` 공개 포트 제거·헬스체크, `solver` 작업자 수 env, `backup` 추가, 모든 서비스 로그 크기 제한(json-file 10MB×3) | 수정 |
| `deploy/Caddyfile` | `{$DOMAIN}` → `web:3000` 역방향 프록시, HSTS, 압축. `X-Forwarded-For`는 Caddy가 덮어쓴다 | 신규 |
| `apps/web/src/app/api/health/route.ts` | `select 1`로 DB 확인 → 200/503(내용 없음) | 신규 |
| 로그인 속도 제한 | 실패 로그인을 IP별로 센다(10분에 20회 → 잠시 거부). IP는 Caddy가 넣은 `X-Forwarded-For`의 마지막 값. 한 프로세스 메모리(앱 서버는 한 개) | 신규 |
| `deploy/backup/` | `Dockerfile`(postgres 16 클라이언트·age·rclone), `backup.sh`(매일 03:00 서울: `pg_dump -Fc` → age 암호화 → 14일 보관 → rclone으로 GCS 복사), `restore.sh` | 신규 |
| `.env.prod.example` | 운영 변수 전부(설명 포함): DOMAIN·POSTGRES_PASSWORD·ADMIN_*·HOLIDAY_API_KEY·SOLVER_WORKERS·BACKUP_AGE_RECIPIENT·BACKUP_GCS_BUCKET | 신규 |
| `deploy/gcp/provision.sh` | gcloud로 프로젝트 안 자원 생성: VM(e2-medium·Ubuntu 24.04·30GB), 고정 IP, 방화벽(80·443, SSH는 IAP 대역만), 서비스 계정(버킷 객체 생성 권한만), 버킷(서울·90일 삭제 규칙·버전 관리 끔) | 신규 |
| `deploy/server-setup.sh` | VM 안: Docker 설치, 자동 보안 업데이트, 스왑 2GB, 배포 사용자 | 신규 |
| `docs/operations.md` | 설치·최초 부팅(관리자·명단)·업데이트·되돌리기·백업 확인·복구·키 보관·장애 대응 순서 | 신규 |
| README | 「운영」 절을 docs/operations.md로 연결 | 수정 |

## §2. 아티팩트 인덱스
| 아티팩트 | 상태 | 링크 / N/A 사유 |
|---|---|---|
| domain-entities | N/A | 데이터 모델 변경 없음 |
| business-rules | N/A | 운영 규칙은 §3·§5에 직접 |
| business-logic-model | N/A | 백업·복구 흐름은 §3 표로 충분 |
| frontend-components | N/A | 화면 변경 없음(로그인 오류 문구 1개) |

## §3. 운영 규칙 (결정 포함)

| ID | 규칙 |
|---|---|
| R-OPS-1 | 공개 포트는 80(→443 리다이렉트)·443뿐. SSH는 `gcloud compute ssh --tunnel-through-iap`(방화벽은 35.235.240.0/20만 22 허용) |
| R-OPS-2 | 비밀값은 VM의 `.env.prod`(권한 600)에만. 저장소·이미지·로그에 넣지 않는다. 버킷 쓰기는 VM 서비스 계정(키 파일 없음, 메타데이터 인증) |
| R-OPS-3 | 백업 = 매일 03:00 서울. 파일명 `duty-YYYYMMDD-HHMM.dump.age`. 서버 14일, 버킷 90일. 실패하면 컨테이너 로그에 `backup_failed`를 남긴다(알림은 3-2) |
| R-OPS-4 | 암호화는 age 공개키. 개인키는 사용자 PC와 오프라인 보관 1곳에만(서버·저장소 금지). 복구는 개인키가 있는 곳에서 |
| R-OPS-5 | 업데이트 = `git pull` → `docker compose ... up -d --build`(migrate가 먼저 돈다). 되돌리기 = 이전 커밋으로 `git checkout` 후 같은 명령, 마이그레이션이 바뀌었으면 백업 복구 |
| R-OPS-6 | 최초 관리자·명단 가져오기의 임시 비밀번호는 `run --rm`로 한 번 출력되고 컨테이너 로그로 남지 않는다. 명단 CSV는 가져온 뒤 VM에서 지운다 |
| R-OPS-7 | 로그인 실패가 한 IP에서 10분에 20회를 넘으면 그 IP의 로그인을 10분 막는다(계정 잠금 5회와 별개, 병원 공용 IP를 고려해 넉넉히) |

## §4. 구현 체크리스트
- [ ] compose·Caddyfile·헬스체크·속도 제한(+단위 테스트)
- [ ] backup 이미지·backup.sh·restore.sh
- [ ] .env.prod.example·provision.sh·server-setup.sh·docs/operations.md·README
- [ ] 로컬 리허설(§5) 통과
- [ ] (승인 뒤) GCP 자원 생성 → 서버 설정 → DNS → 최초 부팅 → 운영 확인(§5)

## §5. 검증 계획
- [ ] 저장소: format·typecheck·lint·단위·통합·E2E 그린, 이미지 빌드(CI)
- [ ] **로컬 리허설**(`DOMAIN=localhost`, Caddy 내부 인증서): HTTPS로 로그인·근무표·듀티 생성 1회, 헬스체크 200, web·db·solver 포트가 호스트에 열리지 않음, 백업 1회(로컬 rclone 대상) → 새 DB에 복구 → 행 수 일치, 속도 제한 동작
- [ ] **운영 확인**: 도메인 HTTPS(인증서 정상), 관리자 로그인·비밀번호 변경, 명단 11명, 간호사 1명 로그인, 첫 백업이 버킷에 올라감, 복구 리허설 1회(별도 DB)

## §6. NFR
- 가용성: 단일 VM(재부팅 시 `restart: unless-stopped`로 복구). 복구 목표 시간 1시간, 데이터 손실 최대 24시간(일일 백업).
- 보안: TLS 1.2+, HSTS, 보안 헤더(R-1), 계정 잠금 + IP 속도 제한, IAP SSH, 최소 권한 서비스 계정.
- 비용: VM·디스크·고정 IP·소량 저장소·트래픽(정확한 금액은 GCP 가격 계산기) + 도메인.

## §7. 편차 로그 (Deviations) — 구현 후

| SoT | 실제 구현 | 사유 |
|---|---|---|
|  |  |  |
