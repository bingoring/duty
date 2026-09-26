---
artifact: business-logic-model
build-spec: foundation
status: IMPLEMENTED
updated: 2026-09-26
---

# Business Logic Model — 2-1 Foundation

> 규칙 ID는 [`business-rules.md`](business-rules.md), 테이블은 [`domain-entities.md`](domain-entities.md) 참조.
> 시계(`now`)는 모든 인증 함수에 **주입 가능한 인자**로 받는다(잠금·만료 테스트용).

## 1. 워크플로

### `login(employeeNo, password, keep, userAgent, now)` — Server Action
1. **입력 검증** (§2 검증 규칙). 실패 → 필드 오류 반환.
2. `user = users where employee_no = trim(employeeNo)` + `credentials` 조인.
3. `user` 없음 또는 `active = false` → 더미 해시 검증(R-AUTH-2) → R-AUTH-1 오류.
4. `locked_until > now` → R-AUTH-4 오류(검증 생략).
5. `argon2.verify(hash, password)` 실패 → 트랜잭션으로 R-AUTH-3 적용 → R-AUTH-1 오류.
6. 성공 → 트랜잭션: R-AUTH-5 + 세션 생성(§2 `issueSession`) → 쿠키 설정.
7. 리다이렉트: `must_change_password` → `/password`, 아니면 안전한 `next` 또는 `/`.

### `logout()` — Server Action
쿠키의 토큰 해시로 세션 행 삭제 → 쿠키 삭제 → `/login`.

### `changePassword(current?, next, confirm, now)` — Server Action
1. `requireUser({ allowMustChange: true })`.
2. 첫 로그인 강제 변경(`must_change_password = true`)이면 `current`를 받지 않는다(방금 임시 비밀번호로 로그인했으므로). 자발적 변경(`/settings`)이면 `current` 검증.
3. 새 비밀번호 검증(R-PW, §2) → 해시 → `credentials` 갱신(`must_change_password = false`, `password_changed_at = now`).
4. R-AUTH-12: 현재 세션을 제외한 그 사용자의 세션 삭제.
5. `/`로 이동.

### `getSession(now)` — 서버 전용, 요청당 1회 캐시(React `cache`)
1. 쿠키 없음 → `null`.
2. `sessions where id = sha256(token)` + `users` 조인.
3. 없음 → `null`. `expires_at <= now` → 행 삭제 → `null`. `user.active = false` → `null`.
4. R-AUTH-8 갱신 조건이면 `expires_at` 연장 + 쿠키 재설정(Route Handler·Server Action 문맥에서만. 서버 컴포넌트 렌더 중에는 쿠키를 쓸 수 없으므로 갱신은 다음 액션 때 한다).
5. `last_seen_at`은 5분 이상 지났을 때만 갱신(쓰기 부하 절감).
6. 반환: `{ user: { id, name, employeeNo, role, rotation, wardName }, mustChangePassword, sessionId }`.

### 가드
```
requireUser({ allowMustChange = false }):
  s = getSession(); if !s → redirect('/login?next=' + 현재 경로)
  if s.mustChangePassword && !allowMustChange → redirect('/password')
  return s
requireAdmin():
  s = requireUser(); if s.user.role != 'admin' → forbidden()   // 403 페이지
```

### `proxy.ts` (Next.js 16, 이전 명칭 middleware)
- 매처: `/((?!_next|fonts|favicon.ico|login).*)`
- `duty_session` 쿠키가 없으면 `/login?next=경로`로 리다이렉트. 있으면 통과(DB 검증은 가드가 함).

## 2. 알고리즘

```
issueSession(userId, keep, userAgent, now):
  token = base64url(randomBytes(32))
  id    = sha256hex(token)
  ttl   = keep ? 30d : 12h
  insert sessions { id, userId, persistent: keep, expiresAt: now + ttl, userAgent: ua[0..200] }
  cookie = { name: 'duty_session', value: token, httpOnly, sameSite: 'lax', path: '/', secure: isProd,
             maxAge: keep ? 30d : undefined }
  return cookie

safeNext(next): return (next startsWith '/' && !next startsWith '//') ? next : '/'

tempPassword(): 12자, 문자 집합 = 영대소문자·숫자에서 0 O o 1 l I 제외, crypto.randomInt 사용
```

**시드 순서** (`db:seed`, 한 트랜잭션)
1. `wards`: `ER / 응급실` (없으면).
2. `rule_versions`: (ER, 1) 없으면 `DEFAULT_RULES`로 삽입.
3. `holidays`: 목록의 날짜마다 없으면 삽입(`source='seed'`).
4. `users` + `credentials`: 가명 11명(아래), 사번이 없으면 삽입.

| 사번 | 이름 | role | rotation | rank | tier | K-tass | 노조 |
|---|---|---|---|---|---|---|---|
| 00101 | 한수정 | admin | fixed_weekday | 1 | senior | ✅ | ✅ |
| 00102 | 박서연 | nurse | rotating | 2 | senior | ✅ | ✅ |
| 00103 | 정하늘 | nurse | rotating | 3 | senior | ✅ | ✅ |
| 00104 | 오민지 | nurse | rotating | 4 | senior | ✅ | ✅ |
| 00105 | 강도윤 | nurse | rotating | 5 | senior | — | — |
| 00106 | 윤채원 | nurse | rotating | 6 | senior | ✅ | — |
| 00107 | 임소라 | nurse | rotating | 7 | mid | ✅ | — |
| 00108 | 배지현 | nurse | rotating | 8 | mid | ✅ | — |
| 00109 | 서예린 | nurse | rotating | 9 | junior | — | — |
| 00110 | 홍다은 | nurse | rotating | 10 | junior | — | — |
| 00111 | 문가을 | nurse | rotating | 11 | junior | — | — |

(요구사항 원문의 연차 구분·K-tass·노조 구성을 그대로 두고 이름·사번만 가명으로 바꾼 것이다. `hire_date`는 비운다.)

## 3. 상태 전이 — `credentials`

| 현재 | 이벤트 | 다음 | 액션 | 가드 |
|---|---|---|---|---|
| 정상(failed=k<4) | 비밀번호 틀림 | 정상(failed=k+1) | | R-AUTH-3 |
| 정상(failed=4) | 비밀번호 틀림 | 잠금 | locked_until=now+15m, failed=0 | R-AUTH-3 |
| 잠금 | 로그인 시도(now < locked_until) | 잠금 | 거부 | R-AUTH-4 |
| 잠금 | 로그인 시도(now ≥ locked_until) | 정상으로 간주 후 5단계부터 | | |
| 임의 | 로그인 성공 | 정상(failed=0) | locked_until=null | R-AUTH-5 |
| 임시 비밀번호 | 비밀번호 변경 | 확정 비밀번호 | must_change=false | R-AUTH-11·12 |

## 4. 시퀀스 — 첫 로그인

```
브라우저 ─POST login(00103, 임시PW, keep)──▶ Server Action
Server Action ─▶ DB: users+credentials 조회 → argon2.verify → 세션 삽입
Server Action ─Set-Cookie + redirect /password──▶ 브라우저
브라우저 ─GET /password──▶ proxy(쿠키 있음) ─▶ (auth)/password: requireUser({allowMustChange})
브라우저 ─POST changePassword──▶ Server Action ─▶ DB: 해시 갱신, 다른 세션 삭제 ─redirect /──▶ 셸
```

## 5. 통합 지점

| 대상 | 호출 시점 | 실패 처리 |
|---|---|---|
| PostgreSQL | 모든 요청 | 연결 실패 시 사용자에게 일반 오류 문구, 서버 로그에 오류 코드만(개인정보·비밀번호 제외) |
| `@node-rs/argon2` (네이티브) | 로그인·변경 | Docker 이미지에서 `linux-x64-gnu`/`musl` 바이너리 확인을 CI 빌드로 검증 |
| 파일 시스템(`.local/roster.csv`) | `db:import-roster` 실행 시 | 파일 없음·인코딩 오류 → 종료 코드 1 + 경로 안내. UTF-8(BOM 허용)만 지원 |
