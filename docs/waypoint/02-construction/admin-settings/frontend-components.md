---
artifact: frontend-components
build-spec: admin-settings
status: IMPLEMENTED
updated: 2026-09-27
---

# Frontend Components — 2-4 관리자 설정

> 수치는 프로토타입 1k·2b 인라인 스타일. 토큰은 2-1 `globals.css`.

## 1. 트리

```
admin/staff/page.tsx (server)          StaffScreen
├── YearStartNotice (미뤄졌을 때만)
├── StaffHeader     제목 "간호사 관리 · 응급실 {n}명" · 검색(client) · "+ 간호사 추가"
├── StaffTable      grid 1.2fr 1.2fr .8fr .8fr 1fr 1.4fr .6fr · 행 ··· 메뉴(수정 / 비밀번호 재발급 / 제거)
├── StaffAddPanel   (client) 우측 380px, border ink, radius 14
├── StaffEditDialog (client) 기본 정보 · 트레이닝 · 잔여치 조정
├── ConfirmDialog   제거 확인
└── TempPasswordDialog  임시 비밀번호 1회 표시 + 복사

admin/rules/page.tsx (server)          RulesScreen
├── RulesForm (client)  좌: 그룹별 수치 행 / 우 340px: 토글·금지 패턴·변경 이력·되돌리기/저장
└── HolidaySection (client) 연도 선택 · 목록 · 추가 폼 · 공공데이터 가져오기
```

## 2. 상세

### S10
- main padding 24 28, grid `1fr 380px` gap 20.
- 헤더: 22px/700 · 검색 input h36 w220 border `line` radius 8(이름·사번 부분 일치, 클라이언트 필터) · 버튼 h36 bg `primary` 흰 글자 700 "+ 간호사 추가"(패널로 포커스 이동).
- 표: 흰 카드 radius 12 border `line`, 헤더 행 bg `panel` 12px `ink-2` padding 10 16, 데이터 행 padding 11 16 border-bottom `line-soft`. 성명 600, 사번 `ink-2`, K-tass "K-tass" `primary` 600 / "—" `ink-4`, 역할: 수간호사·관리자 `admin` 600 / 신규 `danger` 600 / 그 외 기본, 트레이닝 `ink-2`, "···" 버튼(메뉴 팝오버).
- 추가 패널: padding 22 gap 14, 제목 16px/700 "간호사 추가".
  - 사번 *필수(`danger`) input h42 border `ink`. 성명 h42. 2열: 입사일(date) · K-tass(select 있음/없음). 2열: 연차 구분(고/중/저) · 근무 방식(교대/평일 고정). 체크: 노조, 관리자 권한.
  - 잔여치 3열: 연차 · 잔여 N · 이월 오프(기본 0, 12px 안내 "특휴·검진·병가는 자동 부여").
  - 구분선 아래 체크 "신규 간호사 · 트레이닝 {trainingMonths}개월" → 라디오 완전 신규/경력자 · 2열 프리셉터(select, 활성 교대 근무자) · 3인 배정 기간(주, 종류 바꾸면 기본값) · 안내 12px(1k 문구, 수치는 규칙 값).
  - 버튼 "취소" / "추가 · 초기 비밀번호 발급"(primary). 오류는 필드 아래 12px `danger`.
- `TempPasswordDialog`: "{이름}({사번}) 계정을 만들었습니다" · 비밀번호 24px/800 모노 · "복사" · 안내 "이 창을 닫으면 다시 볼 수 없습니다. 첫 로그인 때 비밀번호를 바꾸게 됩니다." · 확인.
- `StaffEditDialog`(560px): 탭 없이 섹션 3개. 잔여치 조정은 계정별 행 "현재 {값}" + 새 값 input + 공통 메모 + "조정 저장".

### S11
- main grid `1fr 340px` gap 20, padding 24 28.
- 헤더: "규칙 설정 · 응급실" 22px/700 · 변경 있으면 배지 "변경 {n}건 저장 전"(`admin-soft`/`admin`) · 오른쪽 12px `ink-2` "다음 듀티 생성({M}월)부터 적용".
- 수치 카드(흰 카드 radius 12): 그룹 제목 행(12px `ink-3` 600, padding 10 16, bg `panel`) + 항목 행 grid `1fr auto` padding 12 16 border-bottom `line-soft`.
  - 왼쪽: 라벨 600 + 종류 태그(10.5px/700 radius 999: 필수 `primary-soft`/`primary`, 권고 `warn-bg`/`warn-ink`, 운영 `line-soft`/`ink-2`) + 변경 표시 11px `admin` 600 "{before} → {after} 변경, 저장 전" · 설명 12px `ink-2`.
  - 오른쪽: `−` 30×34 · input 64×34 15px/700 가운데 · `+` · 단위 44px 12px `ink-2`. 변경된 행 bg `admin-row`, input border `admin` bg `admin-soft`. 협의 기간은 input 두 개("16" – "20").
- 오른쪽 카드: 켜고 끄는 규칙(체크 accent `primary`, 굵은 제목 + 12px 설명) · 금지 근무 패턴(칩 `danger-bg`/`danger-ink` "E-D ×", "+ 패턴 추가" 점선 칩 → 인라인 input) · 변경 이력(bg `panel` 점선 보더 12px lh 1.6) · 버튼 "되돌리기"(h44) / "저장 · 규칙 안내 반영"(h44 primary 700).
- `HolidaySection`(수치 카드 아래 전체 폭): 제목 "공휴일·병원 지정일" · 연도 select · "공공데이터에서 가져오기" 보조 버튼(키 없으면 비활성 + 안내) · 목록(날짜 요일 · 이름 · 분류 태그 · 출처 12px · 삭제) · 추가 폼(날짜 · 이름 · 분류 select: 병원 지정일/노사 협의일/개원기념일/공휴일).

## 3. 화면 상태

| 화면 | 상태 | UI |
|---|---|---|
| S10 | 추가 성공 | TempPasswordDialog |
| S10 | 검증 실패 | 필드 오류 |
| S10 | 연초 처리 미뤄짐 | 상단 노란 안내(`warn-bg`) |
| S11 | 변경 없음 | 저장 버튼 비활성 |
| S11 | 저장 충돌 | 오류 박스 |
| S11 | API 키 없음 | 가져오기 버튼 비활성 + 안내 |
