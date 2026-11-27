# 운영 문서 — 배포·백업·복구·장애 대응

> 3-13(`docs/waypoint/03-operations/13-serverless.md`)부터 Firebase Hosting + Cloud Run + Cloud SQL(서울)로 운영한다.
> 2026-11-24에 VM 한 대(Docker Compose)에서 옮겼고, VM은 2026-11-25에 지웠다. VM 시절 문서는 git 이력(커밋 `136b022`)에 있다.
> 비밀값(DB 비밀번호·작업 키·임시 비밀번호·명단 CSV)은 저장소·채팅·이미지·로그에 남기지 않는다.

## 구성

```
offplz.com ─ Firebase Hosting(인증서·CDN, 모든 경로를 duty-web으로 rewrite, www → offplz.com)
              └─ Cloud Run duty-web (서울, 0~2대) ─ Cloud SQL duty-db (소켓 /cloudsql/…)
                   ├─ Cloud Run duty-solver (비공개, ID 토큰으로 호출)
                   └─ Cloud Tasks duty-generate → duty-web /api/generate/run (run.app 주소, x-duty-task-key)
```

| 자원                        | 내용                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Cloud Run `duty-web`        | Next.js 앱. 1 vCPU·1GiB, 0~2대, 요청을 처리하는 동안만 CPU 비용. 시작 프로브 `/api/health` 1초 간격      |
| Cloud Run `duty-solver`     | CP-SAT 듀티 생성. 2 vCPU·1GiB, 0~2대, 동시 요청 1, `duty-web` 계정만 호출                                |
| Job `duty-migrate`          | tools 이미지로 마이그레이션(배포마다)                                                                    |
| Cloud SQL `duty-db`         | Postgres 16, db-f1-micro, 자동 백업 30개(매일 03:00 KST), 원하는 시점 복구 7일, 저장 공간 자동 증가      |
| Cloud Tasks `duty-generate` | 간호사 근무표 생성 작업(최대 3회 시도, 작업 행이 「대기」일 때만 실행되어 두 번 돌지 않는다)             |
| Secret Manager              | `duty-database-url`, `duty-generation-task-key` (공휴일 API 키 `duty-holiday-api-key`는 넣으면 연결된다) |
| Artifact Registry `duty`    | web·tools·solver 이미지(태그 = 커밋 SHA, 이미지별 최근 5개)                                              |

- Firebase Hosting은 요청 쿠키 중 `__session`만 넘긴다. 세션 쿠키 이름이 `__session`이고, 화면 폭 보정값을 세션 행에 두는 까닭이다.
- Firebase를 거치면 `X-Forwarded-For`가 「클라이언트, Google 프런트」라 `TRUSTED_PROXY_HOPS=2`다. run.app 주소로 직접 들어오면 이 값을 꾸밀 수 있다(받아들인 위험 — Cloud Tasks가 run.app 주소를 쓰므로 끌 수 없다).
- 의사 근무표 생성은 동기(시간 한도 10초)라 Firebase의 60초 제한 안에서 돈다. 간호사 생성은 Cloud Tasks로 비동기.

## 1. 자원 만들기 (한 번)

모두 기본은 명령 출력만 하고, 이미 있는 자원은 건너뛴다.

```bash
./deploy/gcp/serverless.sh infra                       # 출력만 확인
./deploy/gcp/serverless.sh --apply infra               # API·저장소·Cloud SQL·비밀값·서비스 계정·큐(비용 발생)
./deploy/gcp/serverless.sh --apply services <커밋 SHA>  # 그 커밋 이미지로 솔버·마이그레이션 Job·웹 첫 배포(이미지가 저장소에 있어야 한다)
./deploy/gcp/serverless.sh --apply hosting             # Firebase 추가·Hosting 배포(firebase-tools 로그인 필요)
PROJECT_ID=duty-511008 REPO=bingoring/duty ./deploy/gcp/cd.sh                       # GitHub OIDC 배포 계정·저장소 변수
PROJECT_ID=duty-511008 BUDGET_KRW=30000 ALERT_EMAIL=<주소> ./deploy/gcp/monitoring.sh # 알림·업타임 체크·예산
```

- 첫 이미지는 CI가 아직 없으므로 PC에서 `docker build --platform linux/amd64`로 만들어 올렸다(Apple Silicon은 amd64가 아니다).
- 도메인: Firebase 콘솔(또는 Hosting API)에서 사용자 지정 도메인을 추가하면 필요한 레코드를 알려 준다. 지금은 가비아에 `@` A `199.36.158.100`·TXT `hosting-site=duty-511008`, `www` CNAME `duty-511008.web.app.`.

## 2. 배포 · 되돌리기

`main`에 머지되고 CI 검사가 통과하면 GitHub Actions의 `deploy-cloudrun` 잡이 배포한다.

1. 트래픽을 받는 `duty-web` 리비전의 `commit-sha` 라벨과 비교해 실행에 쓰이는 파일(`apps/`·`packages/`·`services/`·`firebase.json`·`deploy/cloudrun/`·패키지 파일)이 안 바뀌었으면 빌드하지 않는다.
2. web·tools·solver 이미지 빌드 → Artifact Registry.
3. `duty-migrate` Job 실행(실패하면 멈춘다). 배포 전 백업은 원하는 시점 복구로 대신한다.
4. 솔버·웹 새 리비전을 트래픽 없이 올리고 web 태그 URL의 `/api/health`가 통과해야 트래픽을 옮긴다.
5. `firebase deploy --only hosting`(CDN 캐시 비우기) → `https://offplz.com/api/health`.

- **되돌리기(앱):** 이전 리비전으로 트래픽을 옮긴다.

  ```bash
  gcloud run revisions list --service duty-web --region asia-northeast3 --project duty-511008
  gcloud run services update-traffic duty-web --to-revisions <이전 리비전>=100 --region asia-northeast3 --project duty-511008
  ```

- **DB 마이그레이션은 자동으로 되돌리지 않는다.** 필요하면 아래 4의 원하는 시점 복구로 배포 직전 시각을 고른다.

## 3. 관리자·명단 도구 (미검증)

VM 시절에는 서버에서 `migrate` 컨테이너로 돌렸다. 지금은 PC에서 Cloud SQL Auth Proxy로 DB에 붙어 돌린다. **아직 한 번도 해 보지 않았다** — 처음 할 때 이 절을 확인·수정한다.

```bash
cloud-sql-proxy duty-511008:asia-northeast3:duty-db --port 5434 &      # gcloud 로그인 계정으로 IAM 인증
# DATABASE_URL: Secret Manager duty-database-url의 사용자·비밀번호로 postgres://duty:<비밀번호>@127.0.0.1:5434/duty
NODE_ENV=production DATABASE_URL=... pnpm --filter web db:bootstrap                    # 첫 관리자(임시 비밀번호가 한 번만 나온다)
NODE_ENV=production DATABASE_URL=... pnpm --filter web db:import-roster ../../.local/roster.csv
```

- 명단·의사 파일(실명)은 PC의 `.local/`에만 둔다. 형식은 `apps/web/src/server/seed/roster.example.csv`, 의사 근무표는 `fixtures/doctor-2026-10.json`.
- 출력된 임시 비밀번호는 각자에게 직접 전달하고 어디에도 저장하지 않는다(첫 로그인 때 변경이 강제된다).
- `NODE_ENV=production`이면 개발 시드(`db:seed`)는 막힌다.

## 4. 백업 · 복구

- **자동 백업:** 매일 03:00(서울) 30개, 트랜잭션 로그 7일(그 안의 아무 시각으로 복구). 목록: `gcloud sql backups list --instance duty-db --project duty-511008`
- **지금 한 번:** `gcloud sql backups create --instance duty-db --project duty-511008`
- **복구는 아직 리허설하지 않았다.** 처음에는 새 인스턴스로 복제해 확인한다(운영 인스턴스는 건드리지 않음, 확인 뒤 지운다).

  ```bash
  gcloud sql instances clone duty-db duty-db-restore --point-in-time '2026-12-01T03:00:00+09:00' --project duty-511008
  ```

- 운영 인스턴스를 백업으로 되돌리기: `gcloud sql backups restore <백업 ID> --restore-instance duty-db --project duty-511008` — **그 시점 뒤의 데이터가 사라진다.** 앱은 그대로 둬도 되지만 복구 중에는 오류가 난다.
- **VM 시절 백업:** 버킷 `gs://duty-511008-backups/duty/`의 age 암호화 덤프(마지막 2026-11-24 03:00, 90일 뒤 자동 삭제). 개인키는 사용자 PC에 있다. 복원 스크립트는 git 이력에 있다: `git show 136b022:deploy/backup/restore.sh`.

## 5. 감시 · 알림

이상이 생기면 알림 채널(`duty-email`)로 온다. 설정은 `deploy/gcp/monitoring.sh`.

| 알림                | 조건                                                    | 먼저 볼 곳                        |
| ------------------- | ------------------------------------------------------- | --------------------------------- |
| `duty-down`         | `/api/health` 업타임 체크가 지역 2곳 이상에서 10분 실패 | 아래 6 「접속 안 됨」             |
| `duty-run-5xx`      | Cloud Run 5xx가 5분에 5건 이상                          | 아래 6 「5xx」                    |
| `duty-sql-cpu`      | Cloud SQL CPU 80% 초과 15분                             | 콘솔 Cloud SQL → 쿼리 인사이트    |
| `duty-sql-disk`     | Cloud SQL 디스크 80% 초과                               | 자동 증가가 켜져 있다 — 비용 확인 |
| 예산 `duty-monthly` | 월 예산 3만 원의 50·90·100%                             | 콘솔 결제 → 보고서                |

- Cloud SQL 백업 실패 알림은 아직 없다(실패 로그 형식을 확인한 뒤 더한다).
- 알림이 실제로 오는지는 콘솔 Monitoring → 알림 → 채널 `duty-email` → 「테스트 알림 보내기」로 확인한다.

## 6. 장애 대응

로그: `gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' --project duty-511008 --freshness 1h`

| 증상                                  | 확인                                                           | 조치                                                                  |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| 접속 안 됨                            | `curl -I https://offplz.com/api/health`, Firebase 콘솔 Hosting | 인증서·도메인 상태, 가비아 DNS 레코드(위 1)                           |
| 5xx                                   | 위 로그, `gcloud run services describe duty-web`               | 503이면 DB(Cloud SQL 상태·연결 수), 최근 배포면 이전 리비전으로(위 2) |
| 첫 화면이 느림                        | 콜드스타트(인스턴스 0대에서 약 4초)                            | 정상. 계속 느리면 리비전의 시작 프로브·로그                           |
| 생성이 "연결할 수 없음"               | 로그에서 `solver_unreachable`, `duty-solver` 로그              | 솔버 리비전 상태, `duty-web` 계정의 솔버 호출 권한                    |
| 간호사 생성이 끝나지 않음             | `/api/generate/run` 요청 로그, Cloud Tasks 큐 `duty-generate`  | 큐가 멈췄는지, 작업 키 비밀값, 6분 넘으면 화면이 멈춤을 알린다        |
| 로그인 "이 네트워크에서 … 막았습니다" | IP 제한(10분 20회 실패, 인스턴스 메모리)                       | 10분 기다리거나 새 리비전 배포(제한 초기화)                           |
