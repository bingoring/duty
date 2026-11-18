# 3-13 서버 비용 절감 1단계 (코드 PR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱이 VM(지금)과 Cloud Run + Cloud SQL + Firebase Hosting(전환 뒤) **둘 다에서** 동작하게 고치고, Cloud Run 배포에 필요한 설정 파일·스크립트·CI 잡을 꺼 둔 채로 넣는다.

**Architecture:** 실행 환경 차이는 환경 변수로만 가른다(`DB_SOCKET_HOST`, `TRUSTED_PROXY_HOPS`, `GENERATION_QUEUE` 등 — 없으면 지금 VM 동작 그대로). Firebase가 `__session` 쿠키만 넘기는 제약은 쿠키 이름(새 이름으로 쓰고 옛 이름도 읽음)과 화면 폭 보정값을 세션 행으로 옮겨 푼다. 간호사 근무표 생성은 「작업 행 + 디스패치 + 폴링」으로 바꾸고, Cloud Run에서는 Cloud Tasks가 run.app 작업 엔드포인트를 불러 Firebase 60초 제한을 피한다(VM·로컬·E2E는 같은 프로세스에서 바로 실행).

**Tech Stack:** Next.js 16(코드 전 `apps/web/node_modules/next/dist/docs` 확인), React 19, Drizzle(Postgres 16), postgres.js 3.4.9, Vitest(unit·integration), Playwright, GitHub Actions, gcloud·firebase CLI.

**Spec:** `waypoint/projects/duty/03-operations/13-serverless.md`

## Global Constraints

- **VM에서 그대로 동작:** 이 PR은 main 머지 즉시 VM에 자동 배포된다. 새 환경 변수가 없을 때 동작은 지금과 같아야 하고, 기존 E2E·통합 테스트는 수정 없이 통과(생성 화면 E2E는 버튼·결과 문구가 같으면 그대로 통과해야 한다).
- **쿠키:** 쓰기 `__session`, 읽기 `__session` → 없으면 `duty_session`, 지우기 둘 다. 속성(HttpOnly·SameSite=Lax·Path=/·Secure(운영)·로그인 유지 maxAge)은 그대로.
- **DB:** `DB_SOCKET_HOST`가 있으면 postgres.js `host` 옵션으로 넘긴다(예 `/cloudsql/duty-511008:asia-northeast3:duty-db`). `DB_POOL_MAX` 기본 10 유지.
- **IP:** `TRUSTED_PROXY_HOPS` 기본 1(= 지금처럼 `X-Forwarded-For` 마지막 값).
- **솔버 인증:** `SOLVER_URL`이 `https://`일 때만 메타데이터 서버 ID 토큰을 붙인다(audience = `SOLVER_URL`의 origin, 캐시 50분).
- **생성 작업:** Cloud Run에서는 `GENERATION_QUEUE`(`projects/duty-511008/locations/asia-northeast3/queues/duty-generate`)·`GENERATION_TASK_URL`(web run.app 주소 + `/api/generate/run`)·`GENERATION_TASK_KEY`(비밀값)가 있을 때 Cloud Tasks로 디스패치. 없으면 같은 프로세스에서 실행. 작업이 진행 중인데 5분 넘게 갱신이 없으면 실패로 본다. 의사 생성은 **동기 그대로**(시간 한도 10초라 60초 안).
- **HSTS:** 운영(`NODE_ENV=production`)에서 `Strict-Transport-Security: max-age=31536000`(Caddy와 같은 값).
- **인프라 파일은 꺼 둔다:** 새 CI 잡은 `vars.DEPLOY_TARGET == 'cloudrun'`일 때만, 기존 VM 잡은 그 외에만 돈다. `deploy/gcp/serverless.sh`는 만들기만 하고 실행하지 않는다(2단계 승인 뒤 실행).
- 실명 금지, 커밋 트레일러 없음, 실명 검사 0건, 포맷 검사는 `.superpowers/`로 시작하는 경로만 빼고 본다. E2E는 다른 스펙이 바꾼 DB 상태에 기대지 않는다. 사용자 `pnpm dev`가 도는 폴더에서 E2E를 돌리지 않는다(scratchpad worktree).

## Review Focus

- 옛 쿠키(`duty_session`)만 가진 사용자가 로그인 유지 연장(`/api/session/refresh`)을 거치면 새 쿠키가 생기고, 로그아웃하면 둘 다 지워진다.
- 생성 버튼을 두 번 누르거나 관리자 둘이 동시에 누르면 작업은 하나만 돈다(「다른 생성이 진행 중입니다」).
- 작업 엔드포인트(`/api/generate/run`)를 키 없이·틀린 키로·없는 작업 ID로 부르면 거부되고 아무것도 실행되지 않는다.
- 생성 중 화면을 떠났다 돌아와도 진행 중인 작업을 이어서 보여 주고, 끝난 결과(생성안 또는 원인)를 잃지 않는다.
- 세션이 없는 화면(로그인 화면 등)과 세션의 보정값이 없는 사용자는 지금처럼 user-agent로 화면을 고른다.

---

### Task 1: DB 소켓 연결

**Files:** Modify `apps/web/src/server/db/client.ts`; Create `apps/web/src/server/db/client.test.ts`

**Interfaces:** Produces `export function pgOptions(env: NodeJS.ProcessEnv): postgres.Options<{}>` — 지금 옵션(`max`, `connect_timeout: 10`, `idle_timeout: 60`, `connection.statement_timeout: 30_000`)에 `DB_SOCKET_HOST`가 있으면 `host: [그 값]`을 더한다. `createDb(url)`는 `postgres(url, pgOptions(process.env))`.

- [ ] **Step 1:** 테스트 — `pgOptions({})`에 `host`가 없다, `max === 10`; `pgOptions({ DB_SOCKET_HOST: '/cloudsql/a:b:c', DB_POOL_MAX: '4' })`는 `host`에 `/cloudsql/a:b:c`, `max === 4`. 그리고 `postgres('postgres://u:p@localhost/duty', pgOptions({ DB_SOCKET_HOST: '/cloudsql/a:b:c' })).options.path`가 `/cloudsql/a:b:c/.s.PGSQL.5432`(연결은 열지 않는다 — `postgres()`는 쿼리 전까지 접속하지 않음).
- [ ] **Step 2:** `vitest run src/server/db/client.test.ts` → FAIL
- [ ] **Step 3:** 구현 → **Step 4:** PASS, `test:int` 일부(`src/server/auth`) 그대로 통과
- [ ] **Step 5:** 커밋 `feat(web): DB_SOCKET_HOST로 Cloud SQL 소켓 연결`

---

### Task 2: 로그인 쿠키 `__session`

**Files:** Modify `apps/web/src/server/auth/cookies.ts`(+test), `session.ts`, `apps/web/src/proxy.ts`

**Interfaces:**

- `export const SESSION_COOKIE = '__session'`, `export const LEGACY_SESSION_COOKIE = 'duty_session'`
- `export function pickSessionToken(get: (name: string) => string | undefined): string | undefined` — 새 이름 우선, 없으면 옛 이름
- `session.ts`: `getSession`·`getSessionToken`이 `pickSessionToken`을 쓰고, `clearSessionCookie`는 두 이름을 지운다. `writeSessionCookie`는 새 이름만.
- `proxy.ts`: 둘 중 하나라도 있으면 통과.

- [ ] **Step 1:** 단위 테스트 — `pickSessionToken`이 둘 다 있으면 새 값, 옛 것만 있으면 옛 값, 없으면 undefined; `sessionCookie(...).name === '__session'`. E2E는 기존 auth 스펙이 그대로 통과하는 것으로 확인(로그인 → 새 쿠키).
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** 단위 PASS, `playwright test e2e/auth.spec.ts --project=chromium` PASS, 새 E2E 1건(`e2e/legacy-cookie.spec.ts`): 로그인 후 브라우저 쿠키의 `__session` 값을 `duty_session`으로 옮기고 `__session`을 지운 뒤 `/`가 로그인 상태로 열리고, 로그아웃하면 두 쿠키 모두 없다.
- [ ] **Step 5:** 커밋 `feat(web): 로그인 쿠키를 __session으로(옛 이름도 읽음)`

---

### Task 3: 화면 폭 보정값을 세션에

**Files:** Create `apps/web/src/server/db/migrations/0017_session_viewport.sql`(drizzle-kit generate), `apps/web/src/server/device-actions.ts`; Modify `schema.ts`(`sessions.viewport text`), `server/request-device.ts`, `server/device.ts`(+test), `components/shell/ViewportSync.tsx`, `proxy.ts`(기기 판정 제거)

**Interfaces:**

- `export function deviceFor(a: { saved: string | null | undefined; cookie: string | undefined; ua: string }): Device` — 세션 저장값 → 쿠키 → user-agent(`detectDevice` 재사용)
- `requestDevice()`: `getSession()`(요청 캐시)의 `viewport`, `duty_vp` 쿠키, `user-agent` 헤더로 `deviceFor`. `x-device` 헤더는 더 쓰지 않는다.
- `export async function saveViewportAction(device: unknown): Promise<{ ok: boolean }>` — 로그인 사용자만, `'mobile' | 'desktop'`만, 그 세션 행의 `viewport`를 바꾼다.
- `ViewportSync`: 판정이 어긋날 때만(지금 `shouldRefresh` 조건) `await saveViewportAction(want)` 뒤 `router.refresh()`. `duty_vp` 쿠키 쓰기는 유지(로그인 전·VM 호환).

- [ ] **Step 1:** 테스트 — 단위 `deviceFor`(저장값이 쿠키·UA보다 앞, 저장값 없으면 기존 순서), 통합 `saveViewportAction` 대신 서비스 함수 `setSessionViewport(db, sessionId, device)`가 그 세션만 바꾼다(`device-actions.ts`는 이 함수를 감싼다).
- [ ] **Step 2:** FAIL → **Step 3:** 구현, 마이그레이션 생성 → **Step 4:** 단위·통합 PASS, `playwright test e2e/mobile --project=mobile --no-deps` PASS(1차 「달을 넘기면…」·shell 스펙)
- [ ] **Step 5:** 커밋 `feat(web): 화면 폭 보정값을 세션에 저장(쿠키가 전달되지 않는 Firebase 대비)`

---

### Task 4: 솔버 ID 토큰, 클라이언트 IP, HSTS

**Files:** Create `apps/web/src/server/solver-auth.ts`(+test); Modify `server/generate/solver-client.ts`, `server/doctor/generate.ts`, `server/auth/ip-limit.ts`(+test), `next.config.ts`

**Interfaces:**

- `export async function solverHeaders(url: string, fetchFn?: typeof fetch, now?: () => number): Promise<Record<string, string>>` — http면 `{}`; https면 `Authorization: Bearer <token>`, 토큰은 `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=<origin>`(`Metadata-Flavor: Google`)에서 받아 50분 캐시. 두 솔버 호출이 `fetch` 헤더에 펼친다.
- `export function clientIp(headers: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null` — `X-Forwarded-For`를 쉼표로 나눠 뒤에서 `hops`번째 값(1 = 마지막, 지금과 같음). 값이 모자라면 첫 값.
- `next.config.ts` `headers()`: 운영에서만 HSTS 한 줄 추가.

- [ ] **Step 1:** 테스트 — `solverHeaders('http://solver:8100')`는 `{}`이고 fetch를 부르지 않는다; https면 메타데이터 URL·헤더로 한 번 부르고 50분 안 두 번째는 캐시, 50분 뒤 다시 부른다. `clientIp`: `'a, b, c'` → hops 1 = `c`, hops 2 = `b`, hops 5 = `a`, 헤더 없음 = null.
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS, `test:int`의 생성 테스트(로컬 솔버 http) 그대로 통과
- [ ] **Step 5:** 커밋 `feat(web): Cloud Run 솔버 ID 토큰, 믿을 프록시 수, 운영 HSTS`

---

### Task 5: 간호사 근무표 생성 작업(서버)

**Files:** Create `apps/web/src/server/db/migrations/0018_generation_jobs.sql`, `apps/web/src/server/generate/jobs.ts`, `jobs.int.test.ts`, `apps/web/src/server/generate/dispatch.ts`(+test), `apps/web/src/app/api/generate/run/route.ts`; Modify `schema.ts`, `server/generate/actions.ts`(+`actions.test.ts`), `server/generate/service.ts`(메모리 잠금 `generating` 제거 — 작업 행이 대신)

**Interfaces:**

- 테이블 `generation_jobs`: `id uuid pk`, `year int`, `month int`, `priorities jsonb`, `status text`(`queued`·`running`·`done`·`failed`), `result jsonb null`(`GenerateResult`), `created_by uuid`, `created_at`, `updated_at`. 부분 유일 인덱스 `(year, month) where status in ('queued','running')`.
- `export async function startGeneration(db, actor, ym, priorities): Promise<{ ok: true; jobId: string } | Fail>` — 권한·`busy`(같은 달 진행 중, 단 `updated_at`이 5분 넘게 지난 작업은 먼저 `failed`로 바꾸고 새로 만든다).
- `export async function runGenerationJob(db, jobId, today): Promise<void>` — `queued`면 `running`으로 바꾸고 지금의 `generateOnce`를 돌려 `result`·`done`/`failed` 저장(예외도 `failed` + 일반 문구). 이미 끝난 작업이면 아무것도 안 한다(Cloud Tasks 재시도 대비).
- `export async function readGenerationJob(db, jobId, actor): Promise<{ status; result } | null>` — 오래된 진행 작업은 `failed`로 보여 준다.
- `export async function dispatchGeneration(jobId: string, env, deps): Promise<void>` — `GENERATION_QUEUE`가 있으면 Cloud Tasks REST(`POST https://cloudtasks.googleapis.com/v2/{queue}/tasks`, 메타데이터 액세스 토큰, `httpRequest: { url: GENERATION_TASK_URL, httpMethod: 'POST', headers: { 'x-duty-task-key': GENERATION_TASK_KEY, 'content-type': 'application/json' }, body: base64({ jobId }) }`, `dispatchDeadline: '300s'`), 없으면 `void runGenerationJob(...)`(같은 프로세스, 요청과 분리).
- 액션: `startGenerateAction(input)`(기존 `generateAction` 대체, 같은 입력 스키마) → `{ ok, jobId }`, `generationJobAction(jobId)` → `readGenerationJob`. `actions.test.ts` 목록 갱신.
- 라우트 `POST /api/generate/run`: `x-duty-task-key`가 env와 다르거나 env가 없으면 403, 본문 `jobId` 형식이 틀리면 400, 맞으면 `await runGenerationJob(...)` 뒤 204(Cloud Tasks가 응답을 기다리는 동안 CPU가 할당된다).

- [ ] **Step 1: 테스트(통합 `jobs.int.test.ts`, 로컬 솔버 사용)** — 시작 → 실행 → 읽기가 `done`과 생성안 ID; 같은 달 두 번째 시작은 `busy`; `updated_at`을 6분 전으로 돌린 진행 작업이 있으면 새 시작이 성공; 끝난 작업을 다시 실행해도 생성안이 늘지 않음; 해가 없는 입력(기존 service 통합 테스트의 infeasible 픽스처)은 `failed`가 아니라 `done` + `result.ok === false`와 원인. 단위 `dispatch.test.ts`: 큐 env가 있으면 Cloud Tasks URL·헤더·본문으로 한 번 부르고 실행 함수는 부르지 않음, 없으면 실행 함수를 부름. 라우트는 단위로 키 없음·틀린 키 403.
- [ ] **Step 2:** FAIL → **Step 3:** 구현(마이그레이션 생성) → **Step 4:** PASS, 기존 `service.int.test.ts` 그대로 통과
- [ ] **Step 5:** 커밋 `feat(web): 근무표 생성을 작업 행 + 디스패치로(Cloud Tasks 또는 같은 프로세스)`

---

### Task 6: 생성 화면 폴링

**Files:** Modify `apps/web/src/components/generate/GenerateScreen.tsx`, `apps/web/src/app/(app)/admin/generate/page.tsx`(진행 중 작업 ID를 초기값으로)

**Interfaces:** Consumes `startGenerateAction`, `generationJobAction` (Task 5). 페이지는 그 달의 진행 중 작업(`queued`·`running`, 5분 이내)을 읽어 `initialJobId`로 넘긴다(`server/generate/jobs.ts`에 `activeGenerationJob(db, ym)` 추가).

- [ ] **Step 1: 구현** — 생성·리롤 버튼 → `startGenerateAction` → 2초마다 `generationJobAction`(최대 6분) → `done`이면 결과가 성공이면 `router.refresh()`로 새 생성안(지금과 같은 안내), 실패면 지금과 같은 메시지·원인 목록. 진행 중 버튼 문구는 「생성 중…」, 화면을 다시 열면 `initialJobId`로 이어서 폴링.
- [ ] **Step 2: 확인** — 기존 `e2e/generate.spec.ts`·`cycle` 스펙이 수정 없이 통과(같은 프로세스 실행 경로). 새 E2E 1건: 생성을 누른 뒤 곧바로 새로 고침해도 「생성 중…」이 이어지고 생성안이 나타난다.
- [ ] **Step 3:** 커밋 `feat(web): 생성 화면은 작업을 시작하고 진행을 확인한다`

---

### Task 7: Cloud Run·Firebase 설정과 꺼 둔 배포 잡

**Files:** Create `firebase.json`, `.firebaserc`, `deploy/gcp/serverless.sh`, `deploy/cloudrun/README.md`; Modify `.github/workflows/ci.yml`, `apps/web/Dockerfile`(필요하면 tools 타깃이 `DB_SOCKET_HOST`로 마이그레이션)

- [ ] **Step 1: 작성**
  - `firebase.json`: `hosting.public`(빈 폴더 `deploy/cloudrun/public` + `.gitkeep`), `rewrites: [{ source: '**', run: { serviceId: 'duty-web', region: 'asia-northeast3' } }]`. `.firebaserc`: `default: duty-511008`.
  - `serverless.sh`(멱등, 단계별 함수, `--dry-run` 기본): API 켜기(run·sqladmin·artifactregistry·secretmanager·cloudtasks·firebase·firebasehosting), Artifact Registry `duty`(서울, 정리 규칙 최근 5개), Cloud SQL `duty-db`(설계 §1 플래그 그대로), DB·사용자, Secret Manager(`duty-database-url`, `duty-holiday-api-key`, `duty-generation-task-key`), 서비스 계정 `duty-web`·`duty-solver`·`duty-tasks`와 역할(web: cloudsql.client·secretAccessor·run.invoker(솔버)·cloudtasks.enqueuer·iam.serviceAccountUser(tasks)), Cloud Tasks 큐 `duty-generate`(서울, 재시도 2회), Cloud SQL 서비스 계정에 백업 버킷 objectViewer, `duty-deployer`에 run.admin·artifactregistry.writer·firebasehosting.admin. 실제 실행은 2단계 승인 뒤.
  - CI: 기존 `deploy` 잡에 `if: … && vars.DEPLOY_TARGET != 'cloudrun'`, 새 `deploy-cloudrun` 잡(`vars.DEPLOY_TARGET == 'cloudrun'`): 설계 §3의 1~5(리비전 태그 SHA 비교 → 빌드·푸시 → 마이그레이션 Job → `--no-traffic --tag` → 태그 URL 헬스 → 트래픽 → `firebase deploy --only hosting` → offplz.com 헬스).
- [ ] **Step 2: 확인** — `bash -n deploy/gcp/serverless.sh`, `bash deploy/gcp/serverless.sh --dry-run`이 만들 명령을 출력만 함, `node -e "JSON.parse(require('fs').readFileSync('firebase.json'))"`, 워크플로 YAML 파싱(`npx --yes yaml-lint` 또는 `python3 -c 'import yaml…'`), `docker compose -f compose.prod.yaml config -q`(VM 경로 그대로).
- [ ] **Step 3:** 커밋 `chore: Cloud Run·Firebase Hosting 설정과 꺼 둔 배포 잡`

---

### Task 8: 마무리와 PR

- [ ] 포맷(`.superpowers/`만 제외)·`typecheck`·`lint`·`test`·`test:int`·`build`, 전체 E2E(CI 순서), 실명 검사 0건
- [ ] waypoint `13-serverless.md`에 「구현 결과 — 1단계 코드 PR」(Cloud Tasks 선택·의사 생성 동기 유지 결정 포함), STATUS 배너 → waypoint push → duty 포인터
- [ ] 브랜치 push, PR, CI 확인. 머지되면 VM 배포 뒤 운영에서 로그인 유지(옛 쿠키 사용자 포함)·근무표 생성 확인
