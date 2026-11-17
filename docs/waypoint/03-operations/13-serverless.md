---
phase: 03-operations
stage: 13-serverless
status: READY
updated: 2026-11-17
---

# [Stage 3-13] 서버 비용 절감 — VM 한 대 → Cloud Run(요청 없으면 0) + Cloud SQL + Firebase Hosting ⚠️

> ⚠️ 비가역 게이트: 운영 개인정보가 든 DB를 VM에서 Cloud SQL로 옮기고, offplz.com의 DNS를 바꾼다. 단계마다 사람 승인.

## 요구사항 (사용자 2026-11-17)

- 요청이 없는데도 서버비가 나간다. 요청이 없으면 꺼져 있다가 요청이 오면 켜지게(forin과 같은 방식).
- 결정: ① DB는 **서울 GCP에 고정**(개인정보 안내 「Google Cloud(서울 리전)」). ② 도메인은 Cloud Run 직접 연결을 확인하고 안 되면 **Firebase Hosting**. ③ 백업은 **Cloud SQL 자동 백업(30일) + 원하는 시점 복구(7일)**, 기존 pg_dump·age 백업은 정리. ④ 데이터 이전 중 **다운타임 허용**.

## 조사 결과 (2026-11-17)

- **지금 구성:** `duty-511008` 서울 VM `duty-vm`(e2-medium, pd-balanced 30GB, 고정 IP `34.64.144.77`) 한 대에 Compose로 caddy·web·solver·db(Postgres 16)·backup. 배포 = main CI 통과 → WIF → IAP SSH → `deploy/deploy.sh`. 백업 = 매일 03:00 pg_dump → age 암호화 → 서버 14일 + 버킷 `duty-511008-backups` 90일(최근 파일 약 160KB, 90일치 7.7MB). 감시 = 업타임 체크 `duty-health`(5분)·`duty-backup`(15분, `/api/health/backup`)·자원 알림·월 예산 5만 원.
- **지금 배포 스크립트가 해 주던 것:** 서버 git HEAD 기준 「문서만 바뀐 커밋」 판단(실패로 밀린 변경도 다음 배포에 잡힘), 배포 전 백업, 헬스 체크 실패 시 이전 커밋으로 자동 되돌리기. Caddy: www → apex 301, HSTS.
- **DNS:** offplz.com·www 모두 A `34.64.144.77`, 네임서버 가비아(사용자가 바꾼다).
- **forin:** Cloud Run `min-instances=0` + Cloud SQL(서울, `db-f1-micro`). 고정비는 Cloud SQL뿐(`../../forin/03-operations/01-deployment.md` §3.3).
- **Cloud Run 직접 도메인 연결:** 서울(`asia-northeast3`) **미지원**, 지원 리전도 「미리보기, 운영 비권장」 → **Firebase Hosting**. 로드 밸런서는 월 $18 안팎이라 절감이 사라진다.
- **Firebase Hosting → Cloud Run (공식 문서):**
  - 서울 리전으로 넘기기 지원. 요청 시간 제한 **60초**(넘으면 504).
  - **요청 쿠키는 `__session` 하나만** 전달된다. duty는 `duty_session`(로그인)·`duty_vp`(화면 폭 보정, 3-12)·`duty_fake_today`(E2E 전용, 운영에서 무시)를 쓴다.
  - 동적 응답은 기본 `private`, `Vary`에 `Cookie`·`Authorization`. CDN 캐시는 **Hosting 배포 때만** 비운다. `/privacy`·not-found는 Next가 정적으로 만들어 `s-maxage=31536000`을 붙인다.
  - 고급 설정은 소유권 TXT·ACME TXT로 **A 레코드를 바꾸기 전에 인증서를 받을 수 있다**. 소유권 TXT는 갱신 때문에 계속 둔다.
  - 결제 계정이 연결된 프로젝트라 **Blaze 요금제로 자동 전환**된다.
  - 문서에 없음 → 스테이징에서 확인: 응답 `Set-Cookie` 통과, `X-Forwarded-For`·`X-Forwarded-Host`·`Host` 값, RSC 스트리밍 버퍼링, run.app 기본 주소를 꺼도 넘겨 주는지.
- **Cloud SQL:** PG16은 기본 에디션이 Enterprise Plus라 공유 코어(`db-f1-micro`)를 쓰려면 **`--edition=ENTERPRISE`**를 명시해야 한다. Enterprise의 트랜잭션 로그(PITR) 보관 최대 7일, 명령줄로 만들면 PITR 기본 꺼짐. 0.5GB급 연결 한도 25.
- **코드 확인 (독립 검토 2026-11-17):**
  - DB 드라이버 postgres.js 3.4.9는 forin식 `postgres://…@/db?host=/cloudsql/…` 주소로 **소켓에 붙지 못한다**(TCP localhost로 감, 직접 확인). `postgres(url, { host: '/cloudsql/<연결 이름>' })`처럼 옵션으로 넘겨야 한다(`apps/web/src/server/db/client.ts`). 웹과 마이그레이션 둘 다 `createDb`를 쓴다. 풀 기본값 10.
  - **해가 없는 근무표 생성은 솔버에서 약 60초**까지 간다(풀이 20×1.5초 + 진단 15초 + 풀어 보기 15초, `services/solver/solver/model.py`), 웹 타임아웃 75초. Firebase 60초를 넘을 수 있고, 운영 11월 입력이 실제로 이 경로를 탔다(3-10).
  - 솔버 이미지는 포트 **8100** 고정, 코드 기본 `SOLVER_WORKERS=8`(compose만 2), 솔버를 부르는 곳은 간호사 생성(`server/generate/solver-client.ts`)·의사 생성(`server/doctor/generate.ts`) **두 곳**.
  - 기기 판정은 `proxy.ts`가 `duty_vp`·UA로 하고 `x-device` 헤더로 넘긴다. `ViewportSync`는 마운트마다 동기화한다.
  - `clientIp`(X-Forwarded-For 마지막 값)는 로그인 IP 제한과 **동의 기록 IP** 두 곳에서 쓴다. 서버 액션은 `Origin`을 `x-forwarded-host`/`host`와 비교한다.
  - VM 서비스 계정 범위는 `devstorage.read_write`·`monitoring.write`뿐(Cloud SQL 접속 불가), DB 컨테이너는 호스트 포트를 열지 않는다.
  - 시간대는 모든 코드가 `Asia/Seoul` 명시 → 서버 TZ 무관. Postgres 확장 없음. runner 이미지는 `PORT`·`0.0.0.0`을 따르고 쓰기는 `.next/cache` 정도.
  - duty와 forin은 **같은 결제 계정**이다(Cloud Run 무료 구간을 나눠 쓴다; 넘어도 duty 사용량은 센트 단위).
- **실단가 (GCP 결제 카탈로그, 서울, 2026-11-17 조회):**

| 항목 | 단가 | 월 |
|---|---|---|
| e2-medium(1 vCPU 상당 $0.02803/h + 4GB × $0.00374/h) | $0.04299/h | **$31.4** |
| pd-balanced 30GB | $0.13/GB·월 | $3.9 |
| 사용 중 외부 IP | 약 $0.005/h | 약 $3.7 |
| **지금 합계** | | **약 $39(약 5.5만 원)** |
| Cloud SQL `db-f1-micro` Zonal | $0.0137/h | **$10.0** |
| Cloud SQL SSD 10GB Zonal | $0.221/GB·월 | $2.2 |
| Cloud SQL 백업 | $0.104/GB·월(첫 백업 뒤 증분, DB 수십 MB) | $0.01 안팎 |
| Cloud Run 웹·솔버 | 요청 처리 시간만 | 약 $0 |
| Artifact Registry(서울) | 0.5GB 무료, 이미지별 최근 5개만 남김 | $0.5 미만 |
| Secret Manager·Firebase Hosting(전송) | | $0.5 미만 |
| **바꾼 뒤 합계** | | **약 $13~14(약 1.9만 원), 약 65% 절감** |
| 되돌리기 2주 동안만: 중지된 VM 디스크 + 쓰지 않는 고정 IP($0.015/h) | | 월 약 $15(2주면 약 $7) |

## 결정 (사용자 답변 2026-11-17)

- 위 「요구사항」의 ①~④. 백업은 forin보다 길게 30일 보관.
- 독립 검토(2026-11-17) 뒤 AI 결정: 근무표 생성을 **비동기(시작 → 진행 확인)**로 바꿔 Firebase 60초 제한을 피한다. 솔버 시간을 줄이는 방법은 생성 품질이 떨어질 수 있어 택하지 않는다.

## AI 해석 (구현 계획)

### 1. 목표 구성

```
브라우저 ─ offplz.com(가비아 DNS) ─ Firebase Hosting(duty-511008) ─ rewrite ─▶ Cloud Run `duty-web`(서울, min 0, max 2)
                                                                                 ├─ 소켓 ─▶ Cloud SQL `duty-db`(서울, Enterprise, db-f1-micro)
                                                                                 └─ IAM ID 토큰 ─▶ Cloud Run `duty-solver`(서울, min 0, 비공개)
마이그레이션: Cloud Run Job `duty-migrate`(같은 Dockerfile의 tools 타깃)
```

- **web:** `apps/web/Dockerfile` runner 그대로, 시작 프로브 `/api/health`, CPU는 요청 중에만 할당(기본), `max-instances=2`, **`DB_POOL_MAX=4`**(한도 25 = 리비전 교체 중 2리비전 × 2인스턴스 × 4 + Job·관리 여유), `DB_SOCKET_HOST=/cloudsql/duty-511008:asia-northeast3:duty-db`.
- **solver:** `services/solver` 이미지 그대로, `--port 8100`, `SOLVER_WORKERS=2`, vCPU 2·메모리 1GB, 동시성 1, 요청 시간 제한 300초(웹 타임아웃보다 길게), **비공개**. web 서비스 계정에 `run.invoker`.
- **DB:** Cloud SQL Postgres 16 `--edition=ENTERPRISE --tier=db-f1-micro`, 서울 Zonal, SSD 10GB(자동 증가), 공개 IP + 승인 네트워크 없음(Cloud Run 연결·Auth Proxy로만), `--enable-point-in-time-recovery --retained-transaction-log-days=7 --retained-backups-count=30`.
- **비밀값:** `DATABASE_URL`·`HOLIDAY_API_KEY`·초기 관리자 값을 Secret Manager에 두고 `--set-secrets`로 주입.
- **켜짐 지연:** 업타임 체크 `duty-health`(5분)가 web을 계속 깨워 둔다(체크 요청은 처리 시간만 과금). 솔버는 생성 때만 켜지고, 그 콜드스타트(OR-Tools 로드)는 비동기 생성 시간 안에 흡수된다.

### 2. 바꾸는 앱 코드 (VM 운영 중에도 안전하게)

1단계 PR은 main에 머지되면 곧 **VM에 자동 배포**되므로 VM에서도 그대로 맞게 만든다.

- **로그인 쿠키:** 읽을 때 `__session`을 먼저, 없으면 `duty_session`을 읽고, 쓸 때는 `__session`으로 쓴다(로그아웃 때 둘 다 지움). **아무도 다시 로그인하지 않는다** — 세션 테이블이 함께 옮겨지고 같은 도메인에 `__session`이 이미 있으므로 전환 때도 그대로. 옛 이름 읽기는 6단계에서 뺀다.
- **화면 폭 보정:** 판정을 `proxy.ts`에서 `requestDevice()`로 옮겨 **세션의 보정값 → user-agent** 순으로 한다(`getSession`은 요청 안에서 캐시). `ViewportSync`는 보정값이 **바뀔 때만** 서버 액션으로 세션에 저장하고, 끝난 뒤 `router.refresh()`. 마이그레이션 1개(`sessions.viewport`). `duty_vp` 쿠키는 6단계에서 정리.
- **DB 소켓:** `createDb`가 `DB_SOCKET_HOST`가 있으면 `host` 옵션으로 넘긴다(없으면 지금처럼 URL만). 경로 108자 이하.
- **솔버 ID 토큰:** 메타데이터 서버(`…/computeMetadata/v1/instance/service-accounts/default/identity?audience=<솔버 URL>`, `Metadata-Flavor: Google`)에서 받아 약 50분 캐시하는 **공용 함수 하나**를 간호사·의사 두 호출 모두에 붙인다. `SOLVER_URL`이 http면 토큰 없이(VM·로컬·CI).
- **근무표 생성 비동기화:** 생성 버튼은 작업을 시작만 하고 바로 돌아오며(작업 행 저장, 상태 = 대기·진행·완료·실패), 화면은 몇 초마다 진행을 확인해 끝나면 결과·실패 원인을 그대로 보여 준다. 간호사·의사 생성 모두. Cloud Run은 응답 뒤 CPU가 줄어들 수 있으므로, 생성 작업을 **Cloud Run Job으로** 돌릴지 web만 **`--no-cpu-throttling`**으로 둘지는 계획 단계에서 비용·복잡도를 비교해 정한다. VM에서는 지금처럼 같은 프로세스에서 이어 돌아도 된다.
- **클라이언트 IP:** 믿을 프록시 수를 환경 변수 `TRUSTED_PROXY_HOPS`(VM=1, 지금과 같음)로 받는다. Firebase 값은 스테이징에서 실제 헤더를 보고 정한다. 로그인 IP 제한·동의 기록 IP 모두 같은 함수.
- **서버 액션 Origin:** Firebase가 넘기는 `x-forwarded-host`가 offplz.com이 아니면 모든 액션이 실패한다. 스테이징에서 확인하고 필요하면 `serverActions.allowedOrigins: ['offplz.com', 'duty-511008.web.app']`.
- **HSTS:** Caddy가 붙이던 `Strict-Transport-Security`를 Next `headers()`로 옮긴다.
- `/api/health/backup`·백업 상태 파일은 **6단계에서** 지운다(그 전에 지우면 아직 켜진 `duty-backup` 업타임 체크가 울린다).

### 3. 배포 파이프라인

main CI(검사·E2E)는 그대로. 새 `deploy` 잡:

1. 「문서만 바뀐 커밋」은 **현재 web 리비전의 이미지 태그(커밋 SHA)**와 대상 커밋의 diff로 판단한다.
2. 이미지 빌드 → Artifact Registry(서울, 태그 = SHA, 이미지별 최근 5개만 남김).
3. `duty-migrate` Job 실행(실패하면 중단). 배포 전 백업은 **PITR로 대신**한다(마이그레이션 직전 시각으로 되돌릴 수 있음).
4. `duty-solver`·`duty-web` 새 리비전을 `--no-traffic --tag`로 올리고 태그 URL로 `/api/health` 확인 → 통과하면 트래픽을 옮긴다(실패하면 옮기지 않음 = 지금의 자동 되돌리기).
5. **`firebase deploy --only hosting`**(매 배포, Firebase CDN 캐시를 비워 정적 페이지가 사라진 청크를 가리키지 않게) → `https://offplz.com/api/health`.

- 인증은 지금의 WIF(`duty-deployer`)에 Cloud Run 관리자·Artifact Registry 작성·Cloud SQL Client·Secret Accessor·Firebase Hosting 관리자를 더한다. IAP SSH 권한은 6단계에서 뺀다.
- Firebase 설정(`firebase.json`: 모든 경로 → `duty-web`, `region: asia-northeast3`)은 저장소에 둔다.

### 4. 감시

- `duty-health` 업타임 체크는 주소 그대로(offplz.com) 유지.
- `duty-backup` 업타임 체크·백업 누락 알림 → **Cloud SQL 백업 실패 알림**(로그 기반).
- VM 디스크·메모리 알림(Ops Agent) → Cloud SQL CPU·디스크·연결 수 알림, Cloud Run 5xx 비율 알림.
- 월 예산 5만 원 → **3만 원**(예상 1.9만 원, 전환한 달은 VM과 겹친다; 50·90·100%).
- **받아들이는 위험:** web은 Firebase가 넘겨 주려면 공개여야 해서, run.app 기본 주소로 직접 들어와 `X-Forwarded-For`를 꾸밀 수 있다(로그인 IP 제한 우회, 동의 기록 IP 위조). 기본 주소를 꺼도 Firebase가 넘겨 주는지 스테이징에서 확인하고, 안 되면 받아들인다(계정별 5회 잠금은 DB라 그대로).

### 5. 진행 순서 (단계마다 사람 승인)

1. **코드 PR:** 쿠키·화면 폭·DB 소켓·솔버 ID 토큰·생성 비동기화·IP 판정·HSTS, Cloud Run·Firebase 설정 파일, 새 deploy 잡(아직 꺼 둠). VM 배포에서도 그대로 동작. 로컬·CI 그린.
2. **GCP 자원 생성(비용 발생 시작, 승인):** Artifact Registry, Cloud SQL(위 플래그), Secret Manager, Cloud Run 서비스·Job, Firebase 추가(Blaze 자동)·Hosting 사이트, Cloud SQL 서비스 계정에 백업 버킷 읽기. 스크립트(`deploy/gcp/serverless.sh`)로 만들고 사용자가 실행하거나 승인 아래 실행.
3. **스테이징 확인:** Cloud SQL에 **가명 시드**만 넣고 Firebase 기본 주소(`duty-511008.web.app`)로 확인한다 — E2E 스모크, 로그인·로그인 유지, 서버 액션(Origin), 화면 폭 보정, `Set-Cookie`, IP·Host 헤더(→ `TRUSTED_PROXY_HOPS` 값), RSC 응답, `/privacy` 등 정적 페이지의 `Cache-Control`, 콜드스타트 시간, **해가 없는 가명 입력으로 비동기 생성 총 시간**(Cloud Run 2 vCPU의 CP-SAT 벽시계), run.app 기본 주소 끄기. 실제 개인정보는 아직 넣지 않는다.
4. **전환(다운타임, 승인):**
   1. **하루 전:** 가비아 offplz.com TTL을 300초로 낮춘다. Firebase 고급 설정으로 offplz.com·www의 소유권 TXT·ACME TXT를 가비아에 넣어 **인증서를 먼저 받는다**(인증서 대기로 인한 접속 불가 없음). www는 Firebase 리디렉트(→ offplz.com).
   2. VM 웹을 점검 모드로 멈춘다(DB 컨테이너는 켜 둠). 이때부터 되돌리기 기간 끝까지 **새 마이그레이션 머지를 멈춘다**.
   3. **덤프:** VM에서 `docker compose exec -T db pg_dump --no-owner --no-acl -Fc` → 서울 백업 버킷에 올린다(VM은 이미 쓰기 권한이 있다). 데이터는 GCP 밖으로 나가지 않고 age 개인키도 필요 없다. 명령은 사용자에게 드리고 사용자가 실행한다.
   4. **가져오기:** Cloud SQL의 `duty` 데이터베이스를 지우고 다시 만들어 스테이징 가명 시드·마이그레이션 기록을 없앤 뒤 `gcloud sql import`(Cloud SQL 서비스 계정이 버킷을 읽는다).
   5. **확인:** 테이블별 행 수와 `drizzle.__drizzle_migrations`를 VM과 비교. 덤프 파일은 버킷에서 지운다.
   6. 가비아 A 레코드를 Firebase 값으로 바꾸고, 다른 A·AAAA 레코드가 남지 않게 한다.
   7. 운영 스모크(로그인이 유지된 채로 근무표·신청·교환·관리·근무표 생성) → Cloud SQL 수동 백업 1회.
5. **되돌리기 기간(2주):** VM은 **중지만** 하고 지우지 않는다. 문제가 생기면 DNS를 VM IP로 되돌리고 VM을 켠 뒤, 전환 뒤 바뀐 데이터를 Cloud SQL에서 같은 방식(덤프 → 버킷 → VM 복원)으로 옮긴다.
6. **정리(승인):** VM·디스크·고정 IP 삭제, 백업 버킷은 기존 파일 90일 보관이 끝나면 삭제, IAP SSH 권한·Ops Agent 정책 제거, 저장소의 VM 배포 파일·`/api/health/backup`·옛 쿠키 이름 읽기·`duty_vp` 정리. 개인정보 안내의 처리 위탁 문구(「Google Cloud(서울 리전) — 서버 운영과 암호화 백업 보관」)는 그대로 맞다. Firebase Hosting은 접속을 전달만 하고 보관하지 않는다 — 문구에 「Firebase Hosting(접속 전달)」을 더할지 사용자 확인.

### 범위 밖

- Cloud SQL 고가용성(리전 복제), 읽기 복제본, Memorystore.
- VM을 유지한 채 야간에만 끄는 예약 방식(요청 기반이 아님).
- forin과 Cloud SQL 인스턴스 공유(서비스·개인정보 분리를 위해 따로 둔다).

## 검토 게이트 (Human Gate)

- [x] 설계 질문 답변 (2026-11-17)
- [x] 독립 검토 반영 (2026-11-17)
- [ ] 설계 문서 승인 → 구현 계획
- [ ] 1. 코드 PR 머지
- [ ] 2. GCP 자원 생성 승인
- [ ] 3. 스테이징 확인
- [ ] 4. 전환 승인·실행
- [ ] 6. 2주 뒤 정리 승인
