---
phase: 03-operations
stage: 01-deployment
status: HUMAN_APPROVED
updated: 2026-10-09
---

# [Stage 3-1] Deployment ⚠️

## 목적

R-1까지 통과한 앱을 GCP 서울 리전의 전용 VM 한 대에 Docker Compose로 올리고, 새 도메인의 HTTPS 주소로 간호사들이 접속하게 한다.
매일 암호화 백업과 복구 절차, 업데이트·되돌리기 절차를 함께 갖춘다.

> ⚠️ 비가역 게이트: 실제 간호사 개인정보(이름·사번·휴가 사유)가 외부 서버에 저장되기 시작한다.

## 입력 (Inputs)

- [`../01-inception/03-architecture-decision.md`](../01-inception/03-architecture-decision.md) §8 배포 선택지(A2 ① 클라우드 VPS + Caddy)
- 메인 저장소 `compose.prod.yaml`, `apps/web/Dockerfile`, `services/solver/Dockerfile`, `README.md` 「운영 최초 부팅」
- R-1에서 3-1로 넘긴 항목(속도 제한, 헬스체크, TLS, 백업, 운영 env 예시, 임시 비밀번호 로그)
- [`../DECISIONS.md`](../DECISIONS.md) 2026-10-08 「3-1 배포 (Q1~Q5)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-10-08)
- [x] Build Spec §4 구현 체크리스트(저장소 쪽) 완료, 로컬 리허설 통과 (2026-10-08)
- [x] GCP 구축·최초 배포(사람 승인 아래) → 운영 확인 (2026-10-09)
- [x] 비가역 게이트 체크리스트 확인 (2026-10-09)

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec: [`deployment/build-spec-index.md`](deployment/build-spec-index.md)

요지:
- **자리:** 새 GCP 프로젝트(기존 서비스와 분리) · Compute Engine `e2-medium`(2vCPU·4GB) · `asia-northeast3`(서울) · Ubuntu 24.04 LTS · 고정 외부 IP. 방화벽은 80·443만 공개, SSH는 IAP 터널로만.
- **구성:** 기존 compose 한 벌 + **Caddy**(자동 TLS, 유일한 공개 진입점) + **backup** 컨테이너. web·solver·db 포트는 호스트에 공개하지 않는다.
- **백업:** 매일 03:00(서울) `pg_dump` → `age` 공개키로 암호화 → 서버에 14일 보관 + Cloud Storage 버킷(서울, 90일 보관 규칙)에 복사. 복호화 개인키는 서버에 두지 않는다. 복구 절차를 리허설로 검증한다.
- **R-1에서 넘긴 것:** 로그인 IP 속도 제한(앱, Caddy 뒤 실제 IP 기준), `/api/health` 헬스체크, 운영 env 예시, 임시 비밀번호는 `--rm` 1회 실행으로만.
- **진행 방식:** 저장소 쪽(설정·스크립트·운영 문서)을 먼저 만들고 로컬에서 운영 구성 그대로 리허설한다. GCP 자원 생성(비용 발생)과 도메인 구매·DNS는 사람 승인 아래 진행한다.

### 로컬 리허설 결과 (2026-10-08)

운영 compose 그대로 `DOMAIN=localhost`(Caddy 내부 인증서)로 올렸다.
- 공개 포트는 Caddy(80·443)뿐, web·db·solver는 호스트에 열리지 않음. HTTP→HTTPS 308, HSTS·X-Frame-Options, `Server` 헤더 없음, `/api/health` 200
- `run --rm migrate`로 관리자 만들기·명단 가져오기(남는 컨테이너 없음) → 브라우저로 로그인·비밀번호 변경 강제·근무표·간호사 관리·규칙 안내·동료 현황·듀티 생성 화면, 세션 쿠키 Secure·HttpOnly
- web → solver 연결 200
- 백업 1회: age 암호화(`age-encryption.org/v1`), 파일 권한 600, 서버·원격 양쪽 저장, 다음 예약 03:00(서울)
- 복구 2가지(컨테이너 restore.sh, 문서의 PC 복호화 → `pg_restore`) 모두 새 DB의 행 수 일치
- 리허설에서 발견·수정: 빈 메일 옵션으로 Caddy 설정 오류, 백업 파일 권한, rclone 설정 경고

### 운영 구축 (2026-10-08)

- GCP `duty-511008`(기존 결제 계정): `deploy/gcp/provision.sh`로 API·서비스 계정·버킷 `duty-511008-backups`(서울, 90일)·고정 IP·방화벽(80·443, SSH는 IAP)·VM `duty-vm`(e2-medium, Ubuntu 24.04) 생성. 기본 SSH·RDP 전체 허용 규칙 삭제
- 도메인 **offplz.com**(가비아, 가비아 네임서버) → A 레코드 `@`·`www` = 고정 IP. www는 기본 도메인으로 301
- `server-setup.sh`(IAP SSH) → `.env.prod`(권한 600, DB 비밀번호는 서버에서 생성·출력 안 함, 백업 공개키) → `up -d --build`
- 확인: Let's Encrypt 인증서, `/api/health` 200, HTTP→HTTPS, 보안 헤더, 외부에서 3000·5432·8100·22 닫힘, 첫 백업이 서버·버킷 양쪽에 올라감, 서버 서비스 계정은 버킷 백업 삭제 403
- 남은 일: 최초 관리자·실명 명단(개인정보, 사람 확인 뒤), 운영 확인(관리자·간호사 로그인), 복구 리허설

### 최초 데이터·운영 확인 (2026-10-09)

- 운영 전 사용자 피드백 6건을 2-11로 반영(수간호사 S·칸 출처 표시·최초 로그인 동의·초기 설정)한 뒤 서버 갱신(마이그레이션 7개).
- 명단·근무표는 `db:bootstrap`·`db:import-roster` 대신 **이력 가져오기**(DECISIONS 2026-10-09)로: 미리보기 = 버리는 DB 검증값 → 가져오기(14명·마감 9달·확정 1달·칸 3,299·이월 조정 9) → 서버 파일 `shred`. 업로드는 IAP scp가 끊겨 SSH 표준 입력으로 보내고 체크섬을 대조했다.
- 즉시 백업 `duty-20261009-0254.dump.age`가 서버·버킷 양쪽에 올라감.
- 첫 로그인은 동의 화면부터(2-11). 동의서가 병원 검토 전 초안이라 수간호사 확인은 동의 화면까지.
- **다시 가져오기 (2026-10-09 밤):** 사용자가 시험 로그인(2계정: 동의·비밀번호 변경·초기 설정)을 한 뒤, 요청으로 운영 DB를 처음 상태로 되돌렸다 — 초기화 전 백업 `duty-20261009-2350` → 스키마 삭제 → 마이그레이션 7개 → 같은 묶음으로 가져오기(결과 동일) → 서버 파일 `shred` → 백업 `duty-20261009-2353`. 동의·세션 0건, 14명 모두 비밀번호 변경 필요.
- **넘긴 일:** 실제 데이터 백업의 복구 리허설(사용자 PC 개인키) → 3-2. 동의서 병원 검토·개원기념일·신청 마감일 설정은 간호사 공지 전 운영 준비(STATUS).

## 비가역 게이트 추가 체크리스트

- [x] 번복 시 영향: 다른 곳으로 옮기면 DB 백업을 복구하고 DNS만 바꾸면 된다(앱·설정은 같은 compose). GCP 프로젝트·VM·버킷·고정 IP는 지우면 데이터가 사라지므로 삭제 전 백업 확인
- [x] 대안 검토: 병원 내부 서버(외부 접속 불가)·관리형 분산(공급자 3곳·솔버 콜드 스타트)은 1-3에서 탈락, 기존 GCP VM 공유는 개인정보·자원 분리를 위해 탈락(Q2)
- [x] 외부 의존성·비용: GCP(VM·디스크·고정 IP·Cloud Storage·외부 트래픽), 도메인 등록비, Let's Encrypt(무료). 공공데이터 공휴일 API 키(선택)

## 검토 게이트 (Human Gate)

- [x] Build Spec이 READY이고 구성·백업·보안 수준이 운영과 맞는가? (승인 = 저장소 쪽 구현·리허설 착수)
- [x] 리허설 뒤: GCP 자원 생성·최초 배포 승인
- [x] 운영 확인 뒤: 비가역 게이트 체크리스트 확인 → `HUMAN_APPROVED` (2026-10-09, 사용자)

## 다음 단계

승인 후 → `STATUS.md`의 3-1을 `HUMAN_APPROVED`로 → `02-monitoring.md`(3-2)
