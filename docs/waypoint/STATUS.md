# duty (벌써 근무표짤 때가 됐어?) — Waypoint Status

**Framework:** [Waypoint](https://github.com/bingoring/waypoint)
**Requirements:** [inputs/requirements_v3.md](inputs/requirements_v3.md) (근무 지침 원문 + 근무자 명단)
**Design handoff:** [inputs/design-handoff_v5/](inputs/design-handoff_v5/README.md) (최신, 2026-09-30) · [v4](inputs/design-handoff_v4/README.md) · [v3](inputs/design-handoff_v3/README.md) · [v2](inputs/design-handoff_v2/README.md) · [v1](inputs/design-handoff_v1/README.md)
**Decisions (audit):** [DECISIONS.md](DECISIONS.md)
**Last updated:** 2026-10-09

> 🔒 **개인정보:** 공개 저장소다. 간호사 이름·사번은 모두 가명이며, 실명 자료는 커밋하지 않는다([DECISIONS](DECISIONS.md) 2026-09-26).

> ✅ **3-1 배포 승인 (2026-10-09).** offplz.com 운영 중(실제 데이터). 2-11도 승인. 다음: 3-2 모니터링 — 실제 데이터 백업 복구 리허설 포함.
> 간호사 공지 전 준비: 동의서 병원 검토, 개원기념일·신청 마감일 설정.
>
> 🚀 **3-1 운영 최초 데이터 가져오기 완료 (2026-10-09).** 서버를 2-11 코드로 갱신(마이그레이션 7개) → 이력 묶음 미리보기 = 기대값 → 가져오기(14명·마감 9달·확정 1달·칸 3,299·이월 조정 9) → 서버 파일 `shred` → 즉시 백업(서버·버킷).
> 남은 일: 수간호사 첫 로그인 확인(동의 화면까지, 사용자), 복구 리허설(사용자 PC 개인키), 동의서 병원 검토, 개원기념일·신청 마감일 설정 → 공지.
>
> 🏗️ **2-11 수간호사 S·칸 출처 표시·최초 로그인 구현 완료 → 승인 대기 (2026-10-09).** 수간호사 평일 S(솔버는 필수 인원을 달리 못 채울 때만 D), 교환에 수간호사(S↔D), 외곽선 3종·툴팁 카드,
> 최초 로그인 동의(민감정보 별도) → 비밀번호 → 초기 설정(본인 확인·수정, 관리자 확인·되돌리기). 단위 409·pytest 19·통합 162·E2E 43 그린, 편차 7건. 동의서 문안은 병원 검토 필요.
>
> 📝 **2-11 수간호사 S·칸 출처 표시·최초 로그인 Build Spec READY (2026-10-09).** 운영 이력 가져오기 전에 사용자 피드백 6건 반영 — 수간호사 평일 S(D는 신청·조정·필수 인원 보충만), 교환에 수간호사, 외곽선 3종(교환 = 빨간 점선)·툴팁,
> 최초 로그인 개인정보 동의(민감정보 별도) → 비밀번호 → 초기 설정(미리 채움, 본인 확인·수정, 관리자 확인). **2-10 「S2 만들지 않음」을 뒤집음**(DECISIONS). 구현 착수 승인 대기. 3-1 이력 가져오기는 2-11 승인 뒤로 미룸.
>
> 🏗️ **3-1 배포 1단계 완료 (2026-10-08).** Caddy·백업·헬스체크·IP 제한·GCP 생성 스크립트·운영 문서, 로컬 리허설(HTTPS·백업·복구) 통과. 다음: GCP 자원 생성(비용 발생, 승인 필요).
>
> 📝 **3-1 배포 Build Spec READY (2026-10-08).** GCP 별도 프로젝트·서울 e2-medium VM 한 대 + Caddy 자동 TLS + 매일 암호화 백업(서버 14일 + Cloud Storage 90일).
> 로컬 리허설 뒤 사람 승인 아래 GCP 자원 생성·최초 배포. 구현 착수 승인 대기.
>
> ✅ **R-1 독립 코드 리뷰 승인 (2026-10-08).** Operations(3-1 배포) 착수.
>
> 🔍 **R-1 독립 코드 리뷰 완료 → 승인 대기 (2026-10-08).** 독립 리뷰어 4명(보안·동시성·도메인·웹/운영) — CRITICAL 1·HIGH 11 포함 결함을 재현 테스트와 함께 수정(운영 이미지 빌드, 동시성 잠금, 연말·연초 경계, 잔여 N 음수 등).
> 정책 4건 결정(휴가 사유 숨김·연속 근무 상한·순환 역방향 벌점·개원기념 OFF 휴가). 보류는 근거와 함께 3-1 등으로. 단위 393·pytest 17·통합 151·E2E 40 그린.
>
> 🔍 **R-1 독립 코드 리뷰 착수 (2026-10-08).** Construction(2-1~2-10) 전체를 작성자와 컨텍스트가 분리된 리뷰어 4명(보안·동시성·도메인·웹/운영)이 적대적으로 검토한다.
>
> ✅ **2-10 동료 현황·규칙 안내 승인 (2026-10-08).**
>
> 🏗️ **2-10 동료 현황·규칙 안내 구현 완료 → 승인 대기 (2026-10-08).** S6 동료 현황(근무표와 같은 계산, 주말 통 OFF 날짜), S7 규칙 안내(목차 7개, 규칙 버전 값으로 렌더링, 태그 3종).
> 단위 378·pytest 14·통합 137·E2E 40 그린, 편차 8건.
>
> 📝 **2-10 동료 현황·규칙 안내 Build Spec READY (2026-10-08).** S6: 이번 달 + 월 이동, 교대 근무자 전원의 오프·나이트·주말 통 OFF 현황(근무표와 같은 계산).
> S7: 목차 7개, 규칙 버전 값에서 렌더링, 태그 자동 적용·권고·안내. **S2 초기 설정은 만들지 않음**(원문 §10·11과 다름, DECISIONS). 구현 착수 승인 대기.
>
> ✅ **2-9 통합·E2E 승인 (2026-10-07).** 2차 범위 중 S6 동료 현황·S7 규칙 안내를 배포 전 2-10으로 넣기로 했다(DECISIONS).
>
> 🏗️ **2-9 통합·E2E 구현 완료 → 승인 대기 (2026-10-07).** 쿠키 시계로 11월 한 달 흐름(신청·휴가 → 생성·확정 → 교환·관리자 조정 → 12월 확정 → 마감 → 이월)을 E2E 하나로 확인,
> 커버리지 표·보강 3건. **발견 결함 수정:** 다음 달이 확정된 달을 생성하면 늘 재검사 탈락 → 솔버 `nextHead`. 단위 362·pytest 14·통합 137·E2E 38 그린, 편차 7건.
>
> 📝 **2-9 통합·E2E Build Spec READY (2026-10-07).** 11월 한 달 흐름(신청·휴가 → 생성·확정 → 교환·관리자 조정 → 마감 → 12월 이월)을 요청별 쿠키 시계로 "오늘"을 옮기며 하나의 E2E로 확인,
> 화면 × 역할 커버리지 점검·보강. Q1~Q3 해소. 구현 착수 승인 대기.
>
> ✅ **2-8 근무 교환 요청 승인 (2026-10-07).** 사용자 피드백 반영 — 바뀐 근무 안내 링크가 칸을 짚고(확인·강조 열 클릭으로 해제), 근무표 격자가 화면 폭에 비례해 커진다. 재검증 E2E 35·통합 136.
>
> 🏗️ **2-8 근무 교환 요청 구현 완료 → 승인 대기 (2026-09-30).** 3a 간호사 교환 요청(체크·재배정 팝업·받은/보낸 패널 접기), 전원 수락 시 재검사 뒤 즉시 반영,
> 겹침·관리자 편집 무효, 만료, 메뉴 배지·근무표 띠. 단위 361·통합 136·E2E 34 그린, 편차 4건.
>
> 📝 **2-8 근무 교환 요청 Build Spec READY (2026-09-30).** 3a 간호사 교환 요청(하루 단위, 칩 두 개 맞바꾸기, 즉시 규칙 검사) → 전원 수락 시 재검사 뒤 즉시 반영(Q1·Q2),
> 겹침·관리자 편집 무효 처리, 받은 요청 배지·근무표 띠. 구현 착수 승인 대기.
>
> ✅ **2-7 근무 조정·월 마감 승인 (2026-09-30).** 핸드오프 예시 코멘트의 실명 이름 조각(v2~v5)을 가명으로 바꾸고 실명 검사를 보강했다.
>
> 🎨 **핸드오프 v5 반영 (2026-09-30).** 근무 조정 관리자 셀 편집을 하단 편집 도크(5a·5b)로 교체 — 손잡이·리사이즈·최소화·최대화·닫기, 칩 클릭 즉시 적용,
> 위반 시에만 ↔ 대체자·사유·그래도 적용. 호버·선택 행열 강조, 월 마감, 덜 일한 사람 먼저 후보 순서는 유지(DECISIONS). 입력의 실명 141곳 가명 치환·사진 제외.
>
> 🏗️ **2-7 근무 조정·월 마감 구현 완료 → 승인 대기 (2026-09-30).** S9 관리자(1j) 칸 편집(즉시 검사·예외 적용·맞바꾸기·대체 지정)·저장 재배포,
> 월 마감(종이 10월 마감 = 원장 누적 OFF 일치)·마감 취소, 확정된 달 휴가 대체 지정·승인 취소, 근무표 "바뀐 근무" 안내.
> 단위 353·pytest 12·통합 129·E2E 32 그린, 편차 7건.
>
> 📝 **2-7 근무 조정·월 마감 Build Spec READY (2026-09-30).** S9 관리자(1j): 칸 편집 팝오버·즉시 검사·맞바꾸기·대체 지정·저장·재배포,
> 월 마감(정산 원장)·마감 취소, 확정된 달 휴가 대체 지정·승인 취소, 근무표 상단 "바뀐 근무" 안내. Q1~Q4 해소(Q3 안내 위치는 검토 뒤 근무표로). 구현 착수 승인 대기.
>
> ✅ **2-6 솔버·듀티 생성 승인 (2026-09-29).**
>
> 🏗️ **2-6 솔버·듀티 생성 구현 완료 → 승인 대기 (2026-09-28).** CP-SAT 솔버 서비스(`services/solver`)·계약 패키지·S8(1i + 생성안 격자·안 이동).
> 생성 → TS 재검사 → n번째 안 보관 → 확정(입력이 바뀐 안은 차단) → 근무표 공개. 해가 없으면 원인 최대 5개. 교차 검증 5 시나리오 하드 위반 0.
> 단위 343·pytest 12·통합 117·E2E 30 그린, 편차 8건. `pnpm dev`가 솔버도 함께 띄운다.
>
> 📝 **2-6 솔버·듀티 생성 Build Spec READY (2026-09-28).** CP-SAT 솔버 서비스(`services/solver`, Python) + 계약 패키지 + S8(1i + 생성안 격자).
> 질문 Q1~Q4 해소 — 마감 뒤에만 생성, 결과 아래 격자·안 이동, 신청 충돌은 한 사람에게 몰리지 않게, 우선 반영은 생성마다. 공정성(목표 OFF 부족 최댓값)이 1순위.
> 구현 착수 승인 대기.
>
> ✅ **2-5 근무 신청·휴가 승인 (2026-09-28).** 4a 패널을 핸드오프 치수로 다시 맞추고 확정된 달 대체 후보를 표시했다.
>
> 🏗️ **2-5 근무 신청·휴가 구현 완료 → 승인 대기 (2026-09-27).** 다음 달 격자 위 근무 신청(복수 옵션·교육, 임시 → 제출)·휴가 팝오버(경조사 종료일 자동,
> 잔여 초과 차단)·관리자 휴가 승인 패널(4a: 접기, 월 배지, 인원 영향, 처리 이력, 코멘트 호버). 확정된 달 휴가는 신청·승인 즉시 칸 대체.
> 단위 331·통합 104·E2E 28 그린, 편차 5건. 대체 지정·확정된 달 승인 취소는 2-7.
>
> 🎨 **핸드오프 v4 반영 (2026-09-27).** 4a 휴가 승인 패널(근무 신청 화면의 관리자 시점, 접기·펼치기, 확정된 달 인원 영향)과 S9 패널 접기(2-8).
> 2-5 범위 조정(Q5): 확정된 달의 휴가도 신청·승인(칸 대체)까지 2-5, 대체 지정만 2-7. 입력의 실명 16건 가명 치환·사진 제외.
>
> 📝 **2-5 근무 신청·휴가 Build Spec READY (2026-09-27).** 다음 달 격자 위 근무 신청(복수 옵션·교육)·휴가 신청(3b 팝오버) — 임시 저장 후 제출(Q2),
> 관리자는 같은 화면에서 편집·휴가 승인(Q1), OFF 목표 = 기준 − 누적 + 슬리핑오프(Q3), 대기 휴가 점선 '휴'(Q4). 확정된 달의 휴가는 2-7. 구현 착수 승인 대기.
> 2-4 후속 수정: 금지 패턴 입력 검사(D·E·N·S·OFF 외 문자·한글·중복 차단).
>
> ✅ **2-4 관리자 설정 승인 (2026-09-27).** S10 간호사 관리(추가·임시 비밀번호·트레이닝·잔여치 조정·재발급·제거)·
> S11 규칙 설정(수치 22 + 토글 5, 버전 이력, 동시 저장 차단)·공휴일(공공데이터 가져오기 + 병원 지정일·개원기념일, 개원오프 재계산)·
> 연초 자동 처리(12월 마감 뒤, 시스템 첫해 제외). 단위 298·통합 77·E2E 22 그린, 편차 4건. 공휴일 API는 `HOLIDAY_API_KEY` 필요.
>
> 📝 **2-4 관리자 설정 Build Spec READY (2026-09-27).** S10 간호사 관리(연차 구분·노조·근무 방식·권한·초기 잔여치 포함, 임시 비밀번호 1회 표시,
> 자동 부여, 잔여치 조정 원장 기록)·S11 규칙 설정(수치 22개 + 토글 5, 버전 이력)·공휴일(공공데이터 API 가져오기 + 병원 지정일·개원기념일)·
> 연초 자동 처리(전년 12월 마감 뒤). 구현 착수 승인 대기.
>
> 🎨 **핸드오프 v3 반영 (2026-09-27).** 변경 1건: S3 격자의 오늘 열 강조(헤더 청록·흰 글자, 열 전체 연청록 세로 띠, 이번 달만).
> 2-3에 구현했고 E2E는 `DUTY_FAKE_TODAY=2026-10-13`으로 날짜를 고정했다(운영에서는 무시). 입력의 실명 16건 가명 치환·사진 제외.
>
> ✅ **2-3 근무표 조회 승인 (2026-09-27).** S3 격자(1c)·요약 카드 5개·월 이동·인쇄(A4 가로 1장) + 공통 셸 v2(메뉴 재구성,
> 「내 휴가 잔여」). 이월 값은 마감 달 스냅샷 / 미마감 달 원장 + 앞선 확정 달 투영. 개발 시드에 종이 10월(가명) 확정본.
> 단위 276·통합 47·E2E 15 그린, 편차 4건(Build Spec §7). 확인: `pnpm db:seed` → `/?ym=2026-10`.
>
> 🎨 **핸드오프 v2 반영 (2026-09-27).** 근무 조정을 모든 간호사에게 열고 간호사 간 교환 요청(3a) 추가, 휴가 신청을 근무 신청 팝오버에 통합(3b, 증빙 없음),
> 메뉴 재구성(근무 조정이 일반 메뉴로), 사이드바 「내 휴가 잔여」, 휴가 칩 `휴`(#D8E6C3). 입력의 실명 16건은 가명 치환, 종이 사진은 제외했다.
> 단계 조정: 2-5에 휴가 포함, 2-8 교환 요청 신설, 통합은 2-9. 2-3 Build Spec에 메뉴·잔여 카드·휴가 칩 반영.
>
> 📝 **2-3 근무표 조회 Build Spec READY (2026-09-27).** 1c 격자·요약 카드 5개·월 이동·인쇄를 서버 컴포넌트로 만든다. 이월 값은 마감된 달은
> 정산 스냅샷, 미마감 달은 원장 + 앞선 확정 달 투영. 질문 Q1~Q4 해소 — 누적 OFF 색 없이 부호+설명, 동료 정보 모두 공개,
> 이번달 OFF = 정산 기준, 기본 달 = 이번 달. 구현 착수 승인 대기.
>
> ✅ **2-2 Domain Core 승인 (2026-09-27).** `@duty/domain`에 규칙 검사기(하드 12·소프트 7)·인원 집계(신규 3인 근무·
> 수간호사 보충)·월 정산·특휴·셀 출처·근무표 상태 전이·위반 문구. 종이 10월: 누적 OFF 10명 일치, 하드 위반 0.
> 다음 달 검사도 전월 말 15일을 이어서 본다(10/31 N → 11월 초 N 최대 2개). 달을 걸친 주말은 토요일이 속한 달로 세고,
> 한 사람의 D·E·N 차이가 2를 넘으면 경고한다. 이월 확장: 다음 달이 있을 때 앞 달 수정의 경계 검사, 주말 미배정 연속 개월 수,
> D·E·N 3개월 누적, 교육 연간 횟수, 잔여 초과. 요구사항 원문 절별 추적표(Build Spec §5). 단위 255·통합 35·E2E 9 그린. 편차 7건(Build Spec §7).
>
> 📝 **2-2 Domain Core Build Spec READY (2026-09-27).** 규칙 검사기(하드 12·소프트 7)·월 정산·특휴·셀 출처·근무표 상태 전이를
> `@duty/domain` 순수 함수로 설계했다. 종이 10월에 규칙을 대 보니 16시간 휴식은 다른 코드 사이에만 적용되고, 10/2 D는 수간호사 보충이었다.
> 질문 Q1~Q5 해소 — 수간호사 D는 최후의 수단(소프트 경고), 최대 연속 오프 기본값 10 → 15, 신규 3인 기간 완전 신규 3주·경력자 2주 +
> 기간 뒤 첫 N 3개도 3인. 구현 착수 승인 대기.
>
> ✅ **2-1 Foundation 승인 (2026-09-27).** pnpm 모노레포(`apps/web` Next.js 16 + `packages/domain`),
> 16 테이블 스키마·마이그레이션, 가명 시드·부트스트랩·실명 CSV 가져오기, argon2id·DB 세션·잠금·첫 로그인 비밀번호 변경,
> S1 로그인·공통 셸(1d·1c 재현), Docker(운영 compose)·CI. 단위 60·통합 35·E2E 9 그린, 운영 빌드에서 로그인까지 확인.
> 편차 11건(Build Spec §7) — 주요: 세션 연장을 Route Handler로, 강제 변경의 임시 비밀번호 재사용 차단 추가.
>
> 📝 **2-1 Foundation Build Spec READY (2026-09-26).** Inception 1-1~1-3 승인. 공개 저장소에 실명 자료를 올린 사고를 정리했다
> (가명 치환 + 이 프로젝트 커밋을 1개로 다시 씀, 원본은 메인 저장소 `.local/`). 2-1 스펙: pnpm 모노레포 + 15 테이블 스키마 +
> 가명 시드·실명 로컬 CSV 가져오기 + argon2id·DB 세션·5회 잠금·첫 로그인 비밀번호 변경 + S1·공통 셸. 구현 착수 승인 대기.
>
> 📝 **1-3 Architecture Decision ⚠️ 제안 (2026-09-26).** 1-2 승인. 인원 여유를 계산해 보니 신규 1명이 3인 배정 기간이면
> 10월은 최소 인원만으로 6칸이 모자라고 나이트 여유는 1칸이다 → 하드 제약 보장 · 불가능 판정 · min-max 공정성이 필요해
> **OR-Tools CP-SAT(Python 무상태 서비스)** 를 권고했다. 규칙 SoT는 TS `@duty/domain` 검사기이고, 솔버 결과는 항상 재검사한다.
> 스택: Next.js 16 + Tailwind v4 + Postgres 16 + Drizzle, 자체 세션 인증, Docker Compose 한 벌. 질문 A1~A3 기본안으로 확정, 승인됨(CP-SAT · 클라우드 VPS · 인원 부족 달은 누적 OFF 음수 허용).
>
> 📝 **1-2 Domain Model 제안 (2026-09-26).** 1-1 승인(질문은 기본안대로 확정, Q5 답변 반영). 요구사항 원문을 입력으로
> 등록했다. **핸드오프 안에서 누적 OFF 부호가 충돌**해 종이 근무표 10월분 10명을 옮겨 계산했고,
> `누적 = 이월 + (실제 OFF − 슬리핑오프 − 기준 OFF)`, 기준 OFF 11(대체공휴일 포함)에서 10명 전원이 일치했다
> (양수 = 더 쉼 → 반납). 잔여치는 스냅샷이 아니라 append-only 원장으로 둔다. 질문 D1~D5 해소(특휴는 원문 §6-7
> 해당 연도 재직 일수 산식으로 정정) — 승인됨.
>
> 🚩 **프로젝트 착수 (2026-09-26).** 응급실 병동 간호사 3교대 근무표 웹. 핸드오프 v1(hi-fi HTML 프로토타입 +
> 종이 근무표 원본 사진)을 입력으로 등록하고 1-1 Context Synthesis를 제안했다. 코드베이스는 아직 없다.

---

## Phase 1 — Inception (What)

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| 1-1 Context Synthesis | [01-context-synthesis.md](01-inception/01-context-synthesis.md) | HUMAN_APPROVED |
| 1-2 Domain Model | [02-domain-model.md](01-inception/02-domain-model.md) | HUMAN_APPROVED |
| 1-3 Architecture Decision ⚠️ | [03-architecture-decision.md](01-inception/03-architecture-decision.md) | HUMAN_APPROVED |

## Phase 2 — Construction (How)

> 1-3 §10의 분해(승인됨)를 핸드오프 v2에 맞춰 조정(2026-09-27): 휴가 신청은 S4 팝오버로 들어와 2-5에 포함, 간호사 교환 요청은 2-8로 분리.
> 2차 범위 중 S6·S7은 배포 전 2-10으로 당겼다(2026-10-07). S2 초기 설정은 만들지 않는다(2026-10-08) → 운영 전 2-11로 되살림(2026-10-09, 본인 확인·수정 + 관리자 확인).

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| 2-1 Foundation | [01-foundation.md](02-construction/01-foundation.md) · [Build Spec](02-construction/foundation/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-2 Domain Core | [02-domain-core.md](02-construction/02-domain-core.md) · [Build Spec](02-construction/domain-core/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-3 근무표 조회 (S3) | [03-schedule-view.md](02-construction/03-schedule-view.md) · [Build Spec](02-construction/schedule-view/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-4 관리자 설정 (S10·S11) | [04-admin-settings.md](02-construction/04-admin-settings.md) · [Build Spec](02-construction/admin-settings/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-5 근무 신청·휴가 (S4 + S5 팝오버 통합) | [05-shift-requests.md](02-construction/05-shift-requests.md) · [Build Spec](02-construction/shift-requests/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-6 솔버·듀티 생성 (S8) | [06-solver-generation.md](02-construction/06-solver-generation.md) · [Build Spec](02-construction/solver-generation/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-7 근무 조정·월 마감 (S9 관리자) | [07-adjust-close.md](02-construction/07-adjust-close.md) · [Build Spec](02-construction/adjust-close/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-8 근무 교환 요청 (S9 간호사, 3a) | [08-swap-requests.md](02-construction/08-swap-requests.md) · [Build Spec](02-construction/swap-requests/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-9 통합·E2E | [09-integration-e2e.md](02-construction/09-integration-e2e.md) · [Build Spec](02-construction/integration-e2e/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-10 동료 현황·규칙 안내 (S6·S7) | [10-peers-rules.md](02-construction/10-peers-rules.md) · [Build Spec](02-construction/peers-rules/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 2-11 수간호사 S·칸 출처 표시·최초 로그인 (S2 부활) | [11-head-firstlogin.md](02-construction/11-head-firstlogin.md) · [Build Spec](02-construction/head-firstlogin/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |

## Phase R — Independent Code Review 🔍 (Construction → Operations 게이트)

> 작성자와 **컨텍스트가 분리된** 독립·적대적 리뷰어가 코드를 검토한다. FRAMEWORK "리뷰 게이트" 참조.

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| R-1 Independent Code Review | [01-independent-review.md](0R-review/01-independent-review.md) | HUMAN_APPROVED |

## Phase 3 — Operations (Ship)

| 스테이지 | 문서 | 상태 |
|---------|------|------|
| 3-1 Deployment ⚠️ | [01-deployment.md](03-operations/01-deployment.md) · [Build Spec](03-operations/deployment/build-spec-index.md) (IMPLEMENTED) | HUMAN_APPROVED |
| 3-2 Monitoring | 03-operations/02-monitoring.md | PENDING |

---

## AI 진입점

> AI는 위 테이블에서 `PENDING` 상태인 가장 앞 스테이지부터 작업을 시작하세요.
> 규칙: [`FRAMEWORK.md`](../../FRAMEWORK.md) 참조
