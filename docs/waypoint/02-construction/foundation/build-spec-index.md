---
build-spec: foundation
stage: 02-construction/01-foundation
status: READY
depth: standard
updated: 2026-09-26
---

# Build Spec — 2-1 Foundation

## §0. 개요 & 범위

- **목표(한 줄):** 모노레포·컨테이너·CI, 전 엔티티 DB 스키마, 시드·명단 가져오기, 사번 인증, 공통 셸을 만든다.
- **SoT:**
  - 엔티티·불변식·권한: [`02-domain-model.md`](../../01-inception/02-domain-model.md) §2·§6·§8
  - 스택·인증·데이터 소스: [`03-architecture-decision.md`](../../01-inception/03-architecture-decision.md) §1·§2·§5·§6
  - 화면: 핸드오프 README「Design Tokens」「공통 셸」「S1」, 프로토타입 `id="1d"`(로그인)·`id="1c"`의 `<nav>`(셸)
  - 명단(가명): [`requirements_v3.md`](../../inputs/requirements_v3.md)「응급실 근무자」
  - 규칙 기본값: 핸드오프 README「S11」항목/기본값 + 「State Management」`WardRules`
- **범위 밖:** 근무표·신청·생성·조정 화면(2-3~2-7), 도메인 계산 로직(2-2), 솔버(2-6), TLS·백업·배포(3-1).
- **규모/제약:** 사용자 11명, 단일 병동. 데스크톱 1280px 기준. 공개 저장소 → 실명·사번 커밋 금지.
- **깊이 티어:** `standard` + business-logic-model·frontend-components 둘 다 작성 — 인증은 흐름(로직)이, 로그인·셸은 픽셀 재현(화면)이
  핵심이라 어느 하나를 생략하면 누락이 생긴다. 고위험 알고리즘이 없어 NFR 절은 생략한다.

## §1. 분해 (Decomposition)

| 단위 | 책임 | 의존 | 신규 |
|---|---|---|---|
| 모노레포 골격 | `pnpm-workspace.yaml`, 루트 `package.json`(scripts), `tsconfig.base.json`, ESLint·Prettier, `.nvmrc`(24), `packageManager` 고정 | — | 신규 |
| `packages/domain` 골격 | allowed-set 상수·zod 스키마, 공용 타입, 규칙 기본값(`DEFAULT_RULES`), 근무 시각표. 계산 로직은 2-2 | — | 신규 |
| `apps/web` 골격 | Next.js 16 App Router, Tailwind v4 `@theme` 토큰, Pretendard 자체 호스팅, `output: 'standalone'` | domain | 신규 |
| DB 계층 | Drizzle 스키마(15 테이블)·마이그레이션·`db` 클라이언트(postgres-js), 트랜잭션 헬퍼 | domain | 신규 |
| 시드·스크립트 | `db:seed`(개발 가명), `db:bootstrap`(운영 최초), `db:import-roster`(로컬 CSV), 공휴일 2026–2027 | DB 계층 | 신규 |
| 인증 | 비밀번호 해시·정책, 세션 발급·검증·폐기, 잠금, `getSession()`/`requireUser()`/`requireAdmin()`, `proxy.ts` | DB 계층 | 신규 |
| 화면 | S1 로그인, 비밀번호 변경, 공통 셸, 자리표시 페이지, 403 | 인증 | 신규 |
| 인프라 | `compose.yaml`(db), `compose.prod.yaml`(db+web), `apps/web/Dockerfile`, `.env.example` | — | 신규 |
| CI | GitHub Actions: install → typecheck → lint → unit → integration(Postgres 서비스) → build | 전부 | 신규 |

**저장소 배치**

```
duty/
├─ apps/web/
│  ├─ src/app/(auth)/login/page.tsx          S1
│  ├─ src/app/(auth)/password/page.tsx       비밀번호 변경(첫 로그인 강제)
│  ├─ src/app/(app)/layout.tsx               공통 셸 + requireUser
│  ├─ src/app/(app)/page.tsx                 근무표 자리표시(2-3)
│  ├─ src/app/(app)/{requests,leave,peers,rules,settings}/page.tsx
│  ├─ src/app/(app)/admin/{generate,adjust,staff,rules}/page.tsx  + admin/layout.tsx(requireAdmin)
│  ├─ src/server/db/{schema.ts,client.ts,migrations/}
│  ├─ src/server/auth/{password.ts,session.ts,guards.ts,login.ts}
│  ├─ src/server/seed/{dev.ts,bootstrap.ts,import-roster.ts,holidays.ts}
│  ├─ src/proxy.ts
│  └─ src/styles/globals.css                 @theme 토큰
├─ packages/domain/src/{allowed-sets.ts,schemas.ts,rules-defaults.ts,shift-times.ts,index.ts}
├─ compose.yaml · compose.prod.yaml · .env.example
└─ .github/workflows/ci.yml
```

## §2. 아티팩트 인덱스 (Manifest)

| 아티팩트 | 상태 | 링크 / N/A 사유 |
|---|---|---|
| domain-entities | ✅ | [`domain-entities.md`](domain-entities.md) |
| business-rules | ✅ | [`business-rules.md`](business-rules.md) |
| business-logic-model | ✅ | [`business-logic-model.md`](business-logic-model.md) |
| frontend-components | ✅ | [`frontend-components.md`](frontend-components.md) |

## §3. 미해결 질문 (Open Questions)

없음. 스펙 안에서 AI가 정한 사항은 아래와 같으며 READY 승인으로 함께 확정된다.
- 비밀번호 정책: 8자 이상, 사번과 같으면 안 됨, 현재 비밀번호와 같으면 안 됨(복잡도 규칙은 두지 않음).
- 비로그인 유지 세션 12시간, 로그인 유지 세션 30일(남은 기간 15일 미만이면 갱신).
- 2차 범위 메뉴(휴가 신청·동료 현황·규칙 안내)는 사이드바에 그대로 두고 "준비 중" 자리표시로 연결한다.

## §4. 구현 체크리스트

**골격**
- [ ] 루트: pnpm workspace, 스크립트(`dev`·`build`·`typecheck`·`lint`·`test`·`test:int`·`db:*`), Node 24 고정, ESLint·Prettier
- [ ] `packages/domain`: allowed-set·zod 스키마·`DEFAULT_RULES`·`SHIFT_TIMES` + 단위 테스트
- [ ] `apps/web`: Next.js 16 + Tailwind v4 + Pretendard 자체 호스팅 + `@theme` 토큰(frontend-components §6)

**DB·데이터**
- [ ] Drizzle 스키마 15 테이블(domain-entities §2) + 최초 마이그레이션 생성
- [ ] `compose.yaml` Postgres 16 + healthcheck, `.env.example`
- [ ] 공휴일 2026–2027 시드(business-rules R-HOL) + 검증 테스트
- [ ] `db:seed`(가명 11명·병동·규칙 v1·공휴일, 멱등) / `db:bootstrap`(관리자 1명 + 임시 비밀번호 1회 출력) / `db:import-roster`(CSV upsert)

**인증**
- [ ] 비밀번호 해시·검증·정책, 세션 토큰 발급·해시 저장·검증·갱신·폐기
- [ ] 로그인 액션(잠금·열거 방지·타이밍 균등화), 로그아웃, 비밀번호 변경 액션
- [ ] `proxy.ts` + `requireUser`/`requireAdmin` 가드, 첫 로그인 강제 리다이렉트

**화면**
- [ ] S1 로그인(1d), 비밀번호 변경, 공통 셸(사이드바·사용자 블록·역할별 메뉴), 자리표시 페이지, 403

**인프라·CI**
- [ ] `apps/web/Dockerfile`(standalone, 비루트 사용자), `compose.prod.yaml`
- [ ] GitHub Actions CI

## §5. 검증 계획

- [ ] `pnpm typecheck` = 0, `pnpm lint` = 0
- [ ] 단위(Vitest): `packages/domain`(allowed-set·스키마 경계, 규칙 기본값이 핸드오프 S11 표와 일치), 비밀번호 정책, 세션 토큰 해시, 공휴일 시드(날짜 유효·중복 없음·2026-10-05 대체공휴일 포함·연도별 개수)
- [ ] 통합(Vitest + 실제 Postgres): 마이그레이션 적용, 시드 2회 실행 시 행 수 동일(멱등), 로그인 성공·실패·5회 잠금·15분 후 해제(시계 주입), 비활성 사용자 거부, 로그아웃 후 세션 무효, 만료 세션 거부, 첫 로그인 강제 변경, 명단 가져오기(앞자리 0 보존·upsert·신규만 임시 비밀번호)
- [ ] E2E(Playwright): 로그인 → 셸 표시(간호사: "권한 없음" / 관리자: 관리자 메뉴 4개), 간호사가 `/admin/*` 접근 시 403, 첫 로그인 시 비밀번호 변경 화면으로 강제 이동
- [ ] `docker compose -f compose.prod.yaml up --build` 후 로그인까지 동작
- [ ] 수동·시각: 1280×720에서 S1을 프로토타입 1d와 나란히 비교(색·간격·폰트 크기), 셸을 1c `<nav>`와 비교
- [ ] 공개 저장소 점검: 커밋 전 실명 목록 grep = 0, `.local/`이 무시되는지 확인

## §6. NFR · 성능

N/A — standard 티어. 인증 관련 보안 요구는 business-rules §3·§4에 규칙으로 둔다.

## §7. 편차 로그 (Deviations) — 구현 후

| SoT | 실제 구현 | 사유 |
|---|---|---|
| (예정) 핸드오프에 비밀번호 변경 화면 없음 | S1 우측 패널 스타일로 설계 | 첫 로그인 임시 비밀번호 변경이 1-3 §5에서 필수 |
| (예정) S1 "비밀번호를 잊으셨나요?" 링크 대상 없음 | 클릭 시 "관리자(수간호사)에게 재발급을 요청해 주세요" 안내를 인라인 표시 | 1-1 Q8 관리자 재발급 |
| (예정) S1 좌측 하단 "오프 신청 마감 매월 15일 · 협의 수정 ~20일" 고정 문구 | 현재 RuleVersion 값으로 렌더링 | 핸드오프 S7·S11 "수치 하드코딩 금지" |
| (예정) 핸드오프 사번 예시 8자리 `20190412` | 사번은 자유 문자열(실제 5자리, 앞자리 0) | 요구사항 원문 명단 |
