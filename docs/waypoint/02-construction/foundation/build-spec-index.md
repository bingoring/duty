---
build-spec: foundation
stage: 02-construction/01-foundation
status: IMPLEMENTED
depth: standard
updated: 2026-09-27
---

# Build Spec — 2-1 Foundation

## §0. 개요 & 범위

- **목표(한 줄):** 모노레포·컨테이너·CI, 전 엔티티 DB 스키마(16 테이블), 시드·명단 가져오기, 사번 인증, 공통 셸을 만든다.
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
| DB 계층 | Drizzle 스키마(16 테이블)·마이그레이션·`db` 클라이언트(postgres-js), 트랜잭션 헬퍼 | domain | 신규 |
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
- [x] 루트: pnpm workspace, 스크립트(`dev`·`build`·`typecheck`·`lint`·`test`·`test:int`·`db:*`), Node 24 고정, ESLint·Prettier
- [x] `packages/domain`: allowed-set·zod 스키마·`DEFAULT_RULES`·`SHIFT_TIMES` + 단위 테스트
- [x] `apps/web`: Next.js 16 + Tailwind v4 + Pretendard 자체 호스팅 + `@theme` 토큰(frontend-components §6)

**DB·데이터**
- [x] Drizzle 스키마 16 테이블(domain-entities §2) + 최초 마이그레이션 생성
- [x] `compose.yaml` Postgres 16 + healthcheck, `.env.example`
- [x] 공휴일 2026–2027 시드(business-rules R-HOL) + 검증 테스트
- [x] `db:seed`(가명 11명·병동·규칙 v1·공휴일, 멱등) / `db:bootstrap`(관리자 1명 + 임시 비밀번호 1회 출력) / `db:import-roster`(CSV upsert)

**인증**
- [x] 비밀번호 해시·검증·정책, 세션 토큰 발급·해시 저장·검증·갱신·폐기
- [x] 로그인 액션(잠금·열거 방지·타이밍 균등화), 로그아웃, 비밀번호 변경 액션
- [x] `proxy.ts` + `requireUser`/`requireAdmin` 가드, 첫 로그인 강제 리다이렉트

**화면**
- [x] S1 로그인(1d), 비밀번호 변경, 공통 셸(사이드바·사용자 블록·역할별 메뉴), 자리표시 페이지, 403

**인프라·CI**
- [x] `apps/web/Dockerfile`(standalone, 비루트 사용자), `compose.prod.yaml`
- [x] GitHub Actions CI

## §5. 검증 계획

- [x] `pnpm typecheck` = 0, `pnpm lint` = 0
- [x] 단위(Vitest): `packages/domain`(allowed-set·스키마 경계, 규칙 기본값이 핸드오프 S11 표와 일치), 비밀번호 정책, 세션 토큰 해시, 공휴일 시드(날짜 유효·중복 없음·2026-10-05 대체공휴일 포함·연도별 개수)
- [x] 통합(Vitest + 실제 Postgres): 마이그레이션 적용, 시드 2회 실행 시 행 수 동일(멱등), 로그인 성공·실패·5회 잠금·15분 후 해제(시계 주입), 비활성 사용자 거부, 로그아웃 후 세션 무효, 만료 세션 거부, 첫 로그인 강제 변경, 명단 가져오기(앞자리 0 보존·upsert·신규만 임시 비밀번호)
- [x] E2E(Playwright): 로그인 → 셸 표시(간호사: "권한 없음" / 관리자: 관리자 메뉴 4개), 간호사가 `/admin/*` 접근 시 403, 첫 로그인 시 비밀번호 변경 화면으로 강제 이동
- [x] `docker compose -f compose.prod.yaml up --build` 후 로그인까지 동작
- [x] 수동·시각: 1280×720에서 S1을 프로토타입 1d와 나란히 비교(색·간격·폰트 크기), 셸을 1c `<nav>`와 비교
- [x] 공개 저장소 점검: 커밋 전 실명 목록 grep = 0, `.local/`이 무시되는지 확인

## §6. NFR · 성능

N/A — standard 티어. 인증 관련 보안 요구는 business-rules §3·§4에 규칙으로 둔다.

## §7. 편차 로그 (Deviations) — 구현 후 (2026-09-27)

| SoT | 실제 구현 | 사유 |
|---|---|---|
| 핸드오프에 비밀번호 변경 화면 없음 | `/password`: S1 좌측 패널 + 우측 폼("처음 오셨군요 · {이름} 님" 머리글은 1e 문구 차용). 자발적 변경은 `/settings` 카드 | 첫 로그인 임시 비밀번호 변경이 1-3 §5에서 필수 |
| S1 "비밀번호를 잊으셨나요?" 링크 대상 없음 | 버튼 클릭 시 "관리자(수간호사)에게 비밀번호 재발급을 요청해 주세요." 안내를 폼 아래 표시 | 1-1 Q8 관리자 재발급 |
| S1 좌측 하단 고정 문구 "매월 15일 · ~20일" | 현재 RuleVersion의 `requestDeadlineDay`·`negotiationEndDay`로 렌더링(규칙이 없으면 기본값) | 핸드오프 S7·S11 "수치 하드코딩 금지" |
| 핸드오프 사번 예시 8자리 `20190412` | 사번은 1~20자 문자열(실제 5자리, 앞자리 0 보존) | 요구사항 원문 명단 |
| 스펙 문구 "15 테이블" | 16 테이블(domain-entities §1 표의 행 수가 16) | 스펙 서술 오류 정정 |
| business-logic-model §1 `getSession` 4단계 "연장은 다음 액션 때" | `validateSession(..., { renew })` 옵션 + `POST /api/session/refresh` Route Handler + 셸의 `SessionKeeper`가 페이지 진입 시 1회 호출. 서버 컴포넌트는 `renew: false` | 서버 컴포넌트 렌더 중에는 쿠키를 쓸 수 없어, DB만 연장하면 쿠키 만료와 어긋난다 |
| business-rules §2 "현재 비밀번호와 같으면 안 됨"은 자발적 변경에만 검사 가능 | 강제 변경에서도 저장된 해시와 새 비밀번호를 비교해 임시 비밀번호 재사용을 막는다 | 구현 중 발견한 빈틈(회귀 테스트 추가) |
| frontend-components `Forbidden`을 셸 안에 표시 | `app/forbidden.tsx`(루트 전용 규약)가 세션을 읽어 `AppShell`을 직접 그린다. 응답 코드 403 | Next 16 `forbidden` 파일은 앱 루트에만 둘 수 있다 |
| (스펙 외) Next 개발 표시기 | `devIndicators: false` | 좌측 하단 표시기가 사이드바 사용자 블록·로그아웃 버튼을 덮는다(E2E에서 발견) |
| 가드의 `next` 경로 | `proxy.ts`가 `x-pathname` 요청 헤더를 넣고 `requireUser`가 이를 읽는다 | 서버 컴포넌트는 현재 경로를 직접 알 수 없다 |
| 명단 CSV | 셀 양끝 따옴표만 제거한다. 값 안의 쉼표는 지원하지 않는다 | 이름·사번에 쉼표가 없고, 파서 의존성을 늘리지 않기 위해 |

**3-1 Deployment로 넘기는 사항**
- 운영 쿠키는 `Secure`라서 **HTTPS가 필수**다(localhost 제외). TLS 없이 IP로 접속하면 로그인이 유지되지 않는다 → Caddy 자동 TLS를 3-1에서 붙인다.
- 공휴일 시드(2026-10-05 제외)는 운영 전에 관리자가 검토해야 한다(R-HOL-1).

**검증 결과 (2026-09-27)**: typecheck·lint·format 0 · 단위 60(domain 22 + web 38) · 통합 35(실제 Postgres) · `next build` 성공 · E2E 9(Playwright) ·
`compose.prod.yaml` 빌드 → `db:bootstrap` → 첫 로그인·비밀번호 변경·셸 진입 확인(쿠키 Secure·httpOnly) · 실명 검사 0건.
