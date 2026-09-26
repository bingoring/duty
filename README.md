# 벌써 근무표짤 때가 됐어?

응급실 간호사 3교대(D/E/N) 근무표 웹. 개발은 [Waypoint](waypoint/FRAMEWORK.md) 워크플로를 따르며, 설계 문서와 진행 상태는
[`waypoint/projects/duty/STATUS.md`](waypoint/projects/duty/STATUS.md)에 있다.

> **공개 저장소다.** 간호사 실명·사번·실제 근무표는 커밋하지 않는다. 실제 명단은 `.local/`(gitignore)에 두고 `db:import-roster`로 넣는다.

## 구성

- `apps/web` — Next.js 16 (App Router) · Tailwind v4 · Drizzle · PostgreSQL 16
- `packages/domain` — 프레임워크 의존 없는 도메인 코드(allowed-set, 규칙 기본값, 스키마)

## 로컬 실행

```sh
corepack enable                      # pnpm 10
docker compose up -d                 # Postgres (호스트 포트 5433, duty / duty_test)
pnpm install
cp apps/web/.env.example apps/web/.env
pnpm db:migrate && pnpm db:seed      # 가명 11명, 비밀번호 duty-dev-1234
pnpm dev                             # http://localhost:3000 — 00101(관리자) / 00103(간호사)
```

> 규칙 기본값이 바뀌면(예: 2-2에서 최대 연속 오프 10 → 15) 이미 시드된 개발 DB의 `rule_versions` v1은 그대로다.
> `docker compose down -v && docker compose up -d` 후 `pnpm db:migrate && pnpm db:seed`로 다시 만든다.

## 검증

```sh
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test          # 단위
pnpm test:int      # 통합 (duty_test DB)
pnpm test:e2e      # Playwright (duty_e2e DB를 자동 생성·초기화)
```

## 운영 최초 부팅

```sh
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build     # POSTGRES_PASSWORD 필요
docker compose -f compose.prod.yaml --env-file .env.prod run --rm migrate pnpm db:bootstrap   # ADMIN_EMPLOYEE_NO, ADMIN_NAME
docker compose -f compose.prod.yaml --env-file .env.prod run --rm -v "$PWD/.local:/data:ro" migrate pnpm db:import-roster /data/roster.csv
```

운영 쿠키는 `Secure`이므로 HTTPS 뒤에서 실행해야 한다(TLS는 3-1 Deployment에서 추가).
