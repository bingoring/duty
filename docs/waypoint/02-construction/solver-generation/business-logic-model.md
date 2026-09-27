# business-logic-model — 2-6 솔버·듀티 생성

## §1. 생성 시퀀스 (`generateAction` → `generate(db, actor, ym, priorities, today)`)

```
admin ─ generateAction({ year, month, priorities, seed? })
  1. adminOnly()
  2. plan = ensureRequestPlan(ym, today)            // 마감 지났으면 REQUEST_CLOSED로
     상태 검사 (R-GEN-2)
  3. { input, fixedCheck } = buildGenerationInput(db, plan)
       - buildScheduleInput(db, plan) + 월초 잔여 채움(§2)
       - 고정 칸(domain-entities §3), 수간호사 칸
       - fixedCheck = checkSchedule(고정 칸만 채운 입력)의 하드 위반 중 고정 칸이 원인인 것 → 있으면 반환 (R-GEN-11)
  4. req = toSolverRequest(input, priorities, seed ?? randomInt, timeLimit)
     inputHash = sha256(canonical(req − seed/timeLimit/priorities))
  5. res = solverClient.solve(req)                  // R-GEN-9
     INFEASIBLE → causes 문구(R-GEN-12) 반환, UNKNOWN → "시간 안에 안을 찾지 못했습니다" 반환
  6. cells = res.cells + 수간호사 칸
     check = checkSchedule({ ...input, cells })     // 규칙 설정 토글 기준(Q4)
     hardViolations > 0 → 로그 + 오류 반환 (R-GEN-10)
  7. tx: plan 행 잠금 → generationNo = max+1 → schedule_candidates + candidate_cells(source 판정 §3)
         → 상태 REQUEST_CLOSED면 DRAFTING
  8. refresh() → ?c=<새 후보>
```

리롤은 같은 액션을 새 시드로 부른다(화면의 "↻ 리롤"). 첫 생성 버튼 문구는 "생성", 후보가 있으면 "↻ 리롤".

## §2. 월초 잔여 채움 (`server/generate/input.ts`)

2-5까지 `buildScheduleInput`은 잔여 필드를 0·null로 두었다. 생성에서는 실제 값이 필요하다.

| 필드 | 출처 |
|---|---|
| offCarryBefore · nightBankBefore | `monthStartBalances(db, ym)`(2-3/2-5: 원장 + 앞선 확정·미마감 달 투영) |
| balancesBefore | 같은 함수의 연차·특휴·개원오프·검진·병가 잔여 |
| weekendPairMissedStreak | 직전 달부터 거슬러 확정·마감된 달마다 `hasWeekendPair`가 거짓인 연속 수(없는 달에서 멈춤) |
| weekendPairCarryIn | 전월 확정본의 `weekendPairCarryOut` |
| shiftCountsBefore | 최근 `shiftBalanceWindowMonths − 1`개월 확정본의 D·E·N 합 |
| eduUsedThisYear | 올해 앞선 달 확정본의 edu_cont·edu_union 칸 수 |
| requestMissBefore | 최근 3개월 확정본에서 제출된 복수 옵션 신청 중 불충족 수(Q3) |

목표 OFF(`offTarget`)는 `baselineOff − offCarryBefore`(0.5 단위). 슬리핑오프는 솔버가 N 수에 맞춰 정하므로 목표에 더하지 않는다
(2-5 화면의 "OFF 목표"는 월초 잔여 N 기준 예상치로 그대로 둔다).

## §3. 칸 출처 판정 (후보 저장·확정 공통)

`resolveCellSource`(2-2 R-SOURCE-1)를 쓴다: 고정 칸(휴가·특수 신청)과 신청을 충족한 칸 = `requested`, 나머지 = `auto`, 수간호사 고정 칸 = `auto`.
빨간 외곽선은 `requested` 칸에만 그린다(2-3 격자 규칙과 같음).

## §4. CP-SAT 모델 (`services/solver/solver/model.py`)

변수:
- `x[n,d,c]` ∈ {0,1}, c ∈ {D,E,N,OFF} (고정 칸 날짜는 상수로 두고 변수 없음), `sl[n,d]` ∈ {0,1} (OFF 중 슬리핑, `sl ≤ x[n,d,OFF]`)
- 보조: `work[n,d]`, `rest[n,d]`, 월 N 수, 누적 N(`cumN`, 3인 근무 판정), 연속 쉼 길이 `run[n,d]`(정수 0..maxConsecutiveOff), 주말 통 OFF `wp[n,sat]`
- 전월 꼬리 칸은 상수 리터럴로 타임라인 앞에 붙인다.

제약·목적: business-rules §2·§4 표 그대로. 구현 메모:
- 인원: `Σ_{n 계수} x[n,d,s] + head(d,s) ≥ minStaff`. 3인 근무 신규 계수 여부는 `tripleUntil` 이전이면 상수 0, 이후 N은 `x ∧ cumN_before < k` 리터럴.
- headFill 벌점: `short[d,s] ⇔ Σ 교대 근무자 < minStaff` (head가 있는 날만 가능; 없는 날은 하드가 곧 교대 근무자만으로 충족).
- min-max: `M ≥ 항_n` 형태의 정수 변수로.
- 동점 깨기: `random.Random(seed)`로 칸·코드마다 0~3 계수를 뽑아 `Σ coef × x`.
- 파라미터: `num_workers = 1`, `random_seed = seed`, `max_time_in_seconds = timeLimitSec`.

불가능 진단(`diagnose.py`): 첫 풀이가 INFEASIBLE이면, 하드 제약을 그룹 리터럴(`STAFF[d,s]`, `KTASS[d,s]`, `NIGHT_MAX[n]`, `NIGHT_CONSEC[n]`,
`OFF_CONSEC[n]`, `TRAINING[t]`, `FIXED[n]`, `SLEEPING[n]`)에 `only_enforce_if`로 묶은 모델을 목적 없이 다시 풀고
`sufficient_assumptions_for_infeasibility()`를 원인으로 돌려준다(시간 제한 10초). 원인이 비면 `[{group:'STAFF'}]` 일반 문구.

## §5. 확정 시퀀스 (`confirmCandidateAction({ candidateId })`)

```
1. adminOnly()
2. candidate + plan 로드, plan.status === 'DRAFTING' (R-GEN-4)
3. 입력 재조립 → inputHash 비교 (R-GEN-5)
4. check = checkSchedule(후보 칸) → 하드 0 확인
5. tx: plan 잠금 → schedule_cells 없음 확인 → 후보 칸 복사 → plan CONFIRMED, confirmedCandidateId·By·At, ruleVersion
6. refresh() → 근무표 /?ym= 로 이동 링크 표시
```

## §6. 솔버 서비스 (`services/solver`)

- FastAPI `POST /solve`(SolverRequest → SolverResponse), `GET /health` → `{ ok, version }`. 상태 없음, DB 없음, 인증 없음(내부망: compose 네트워크 안에서만 노출, 포트 공개 안 함).
- web은 `SOLVER_URL`(기본 `http://localhost:8100`)로 부른다.
- 개발: `pnpm dev` = web + solver 동시 실행(`services/solver/package.json`의 `dev` = `uv run uvicorn solver.app:app --port 8100 --reload`).
- 테스트: `pnpm test`가 `uv run pytest`도 돈다. web 통합 테스트는 globalSetup에서 솔버가 없으면 띄운다. E2E는 Playwright `webServer`에 솔버를 추가한다.
- 운영: `services/solver/Dockerfile`(python:3.12-slim + uv sync --frozen), `compose.prod.yaml`에 `solver` 서비스(`mem_limit: 512m`), web에 `SOLVER_URL=http://solver:8100`.
