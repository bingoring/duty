# 벌써 근무표짤 때가 됐어?

응급실 간호사 3교대(D/E/N) 근무표 웹. **운영 주소: https://offplz.com**

개발은 [Waypoint](waypoint/FRAMEWORK.md) 워크플로를 따르며, 설계 문서와 진행 상태는
[`waypoint/projects/duty/STATUS.md`](waypoint/projects/duty/STATUS.md)에 있다.

> **공개 저장소다.** 간호사 실명·사번·실제 근무표는 커밋하지 않는다. 실제 자료는 `.local/`(gitignore)에만 둔다.

## 무엇을 하나

- **근무표** — 확정된 달의 격자(수간호사 맨 위, 나머지 표 순서), 신청·교환·관리자 수정은 칸 테두리와 툴팁으로 구분
- **근무 신청 · 휴가** — 다음 달 OFF/D/E/N 신청(복수 선택), 연차·경조·병가·공가 신청과 관리자 승인
- **듀티 생성** — CP-SAT 솔버가 필수 규칙(인원·K-tass·휴식·금지 패턴 등)을 지키며 공평하게 배정, 리롤·확정
- **근무 조정 · 월 마감** — 관리자 칸 편집(즉시 규칙 검사), 간호사끼리 교환 요청, 월 마감으로 누적 OFF·잔여 N 정산
- **동료 현황 · 규칙 안내 · 간호사 관리 · 규칙 설정**
- **최초 로그인** — 개인정보 동의 → 비밀번호 변경 → 내 정보 확인(관리자가 확인·되돌림)

## 구성

| 경로                 | 내용                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `apps/web`           | Next.js 16 (App Router) · React 19 · Tailwind v4 · Drizzle · PostgreSQL 16 |
| `packages/domain`    | 프레임워크 없는 도메인 코드(규칙 검사기·정산·allowed-set·규칙 기본값)      |
| `packages/contract`  | 솔버 입출력 계약(zod → JSON schema → Python 모델)                          |
| `services/solver`    | Python 3.12 · FastAPI · OR-Tools CP-SAT 듀티 생성                          |
| `deploy/`            | 운영 배포 스크립트, Caddy, 백업 컨테이너, GCP 설정 스크립트                |
| `compose.prod.yaml`  | 운영 구성(Caddy 자동 TLS · web · solver · db · backup)                     |
| `docs/operations.md` | 운영 문서(설치·배포·백업·복구·감시·장애 대응)                              |

## 로컬 실행

```sh
corepack enable                      # pnpm 10
docker compose up -d                 # Postgres (호스트 포트 5433, duty / duty_test)
pnpm install
cp apps/web/.env.example apps/web/.env
pnpm db:migrate && pnpm db:seed      # 가명 11명, 비밀번호 duty-dev-1234
pnpm dev                             # http://localhost:3000 — 00101(관리자) / 00103(간호사), 솔버 :8100
```

> 규칙 기본값이 바뀌면 이미 시드된 개발 DB의 `rule_versions` v1은 그대로다.
> `docker compose down -v && docker compose up -d` 후 `pnpm db:migrate && pnpm db:seed`로 다시 만든다.
> 개발 서버가 새 페이지를 404로 내면 `.next`를 지우고 다시 켠다(`rm -rf apps/web/.next`).

## 검증

```sh
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test          # 단위 (domain · web · contract)
pnpm test:int      # 통합 (duty_test DB)
pnpm test:e2e      # Playwright (duty_e2e DB를 자동 생성·초기화)
```

## 배포 · 운영

- **자동 배포:** `main`에 머지되고 CI(검사·테스트·이미지 빌드·E2E)가 통과하면 GitHub Actions가 운영 서버에 배포한다.
  서버의 [`deploy/deploy.sh`](deploy/deploy.sh)가 업데이트 전 백업 → 다시 빌드·기동(마이그레이션 먼저) → 헬스 체크 → 실패 시 이전 커밋으로 되돌림을 한다.
  문서만 바뀐 커밋은 다시 빌드하지 않는다. DB 마이그레이션은 자동으로 되돌리지 않는다.
- **자리:** GCP 서울 VM 한 대(`compose.prod.yaml`), 도메인 `offplz.com`(www는 기본 도메인으로 이동), HTTPS는 Caddy가 Let's Encrypt로 자동 발급.
- **백업:** 매일 03:00(서울) age 암호화 덤프 → 서버 14일 + Cloud Storage 90일. 복호화 키는 서버에 두지 않는다.
- **감시:** 접속 불가·백업 누락·디스크·메모리·월 예산 이메일 알림.
- 자세한 절차(최초 설치·직접 배포·되돌리기·복구·장애 대응)는 [docs/operations.md](docs/operations.md), 운영 변수는 [.env.prod.example](.env.prod.example).

## 공휴일 가져오기 (선택)

[공공데이터포털 「한국천문연구원_특일 정보」](https://www.data.go.kr/data/15012690/openapi.do)에서 활용 신청(자동 승인) 후 받은
**Decoding** 인증키를 `apps/web/.env`(운영은 `.env.prod`)의 `HOLIDAY_API_KEY`에 넣으면, 관리자 → 규칙 설정 → 「공공데이터에서 가져오기」가 켜진다.
키는 커밋하지 않는다.
