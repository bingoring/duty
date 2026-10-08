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

## 공휴일 가져오기 (선택)

[공공데이터포털 「한국천문연구원_특일 정보」](https://www.data.go.kr/data/15012690/openapi.do)에서 활용 신청(자동 승인) 후 받은
**Decoding** 인증키를 `apps/web/.env`(운영은 `.env.prod`)의 `HOLIDAY_API_KEY`에 넣으면, 관리자 → 규칙 설정 → 「공공데이터에서 가져오기」가 켜진다.
키는 커밋하지 않는다.

## 검증

```sh
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test          # 단위
pnpm test:int      # 통합 (duty_test DB)
pnpm test:e2e      # Playwright (duty_e2e DB를 자동 생성·초기화)
```

## 운영

GCP 서울 VM 한 대에 `compose.prod.yaml`(Caddy 자동 TLS · web · solver · db · 매일 암호화 백업)로 운영한다.
설치·최초 부팅·업데이트·되돌리기·백업 확인·복구·장애 대응은 [docs/operations.md](docs/operations.md), 운영 변수는 [.env.prod.example](.env.prod.example).
