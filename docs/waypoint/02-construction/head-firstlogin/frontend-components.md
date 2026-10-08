---
artifact: frontend-components
build-spec: head-firstlogin
status: READY
updated: 2026-10-09
---

# Frontend Components — 2-11 수간호사 S·칸 출처 표시·최초 로그인

> 토큰은 2-1 `globals.css`. 카드·버튼은 로그인(S1)·설정 화면과 같은 스타일. 동의·초기 설정은 핸드오프 S2(1e) 모달형 카드 640px를 따른다.

## 1. 컴포넌트 트리

```
(auth)/consent/page.tsx      ConsentPage (server)   requireSession({allowNoConsent}) → 이미 동의했으면 다음 단계로
└── ConsentForm (client)     체크박스 2개 · 전문 펼치기 · "동의하지 않음" / "동의하고 계속"
(public)/privacy/page.tsx    PrivacyPage (server)   로그인 없이 동의서 전문(같은 원천 PRIVACY_NOTICE)
(auth)/onboarding/page.tsx   OnboardingPage (server) requireSession({allowNotOnboarded}) → loadOnboarding
└── OnboardingForm (client)  섹션 3개(인적 사항 · 잔여 · 신규 트레이닝) 또는 해마다 "올해 연차" 한 칸
components/schedule/
├── ScheduleGrid             OUTLINE에 swap(빨간 점선) 추가, title 대신 CellTip
├── CellTip (client)         툴팁 카드 1개를 격자 위에 띄운다(이벤트 위임: data-tip 칸)
└── Legend                   범례 3종
components/admin/StaffManager  "본인 입력 확인 필요" 배지 · 바뀐 항목 패널 · 확인 / 되돌리기
components/adjust/NurseAdjust  수간호사 행 표시·선택, 수간호사 칸 팝업은 S·D 두 개
components/adjust/AdjustScreen 상단 "받은 교환 요청" 패널(수간호사가 참여한 요청만)
components/requests/*          수간호사 행: 팝오버 토글 OFF·D, 복수 선택 없음
```

## 2. 상세

### ConsentPage
- 화면 가운데 카드 640px, radius 16, padding 36 40, bg surface.
- 상단 12px/700 `primary` "처음 오셨군요 · {이름} 님", 제목 24px/700 "개인정보 수집·이용 동의", 설명 14px `ink-2` "근무표를 쓰려면 아래 두 가지에 동의해야 합니다."
- 체크박스 행 2개(h48, 1px `line`, radius 10): "[필수] 개인정보 수집·이용 동의", "[필수] 민감정보(노조 가입 여부·병가 사유) 처리 동의". 오른쪽 "전문 보기 ▾" → 아래로 펼쳐 §7 문안(13px, 최대 높이 240 스크롤).
- 하단: "동의하지 않음"(보조) / "동의하고 계속"(주요, 둘 다 체크 전 disabled). 맨 아래 12px `ink-3` "동의서 버전 {버전}".

### OnboardingPage
- 같은 카드. 제목 "내 정보를 확인해 주세요", 설명 "관리자가 넣어 둔 값입니다. 다르면 고쳐 주세요. 바꾼 값은 관리자에게 확인 요청으로 갑니다."
- 섹션 1 인적 사항(2열): 입사일(date), 연차 구분(고·중·저 세그먼트), K-tass(예/아니오), 노조(예/아니오), 근무 방식(교대 / 야간 전담 → 시작·종료 날짜).
- 섹션 2 잔여(3열 큰 숫자 h52 22px/700, 핸드오프 S2): 올해 연차 "매년 1월 1일 초기화" / 잔여 나이트 "6개마다 슬리핑오프 1" / 이월 오프 "음수면 반납할 오프". 아래 읽기 전용 2열: 특별휴가(자동 계산)·검진 반차.
- 섹션 3 신규(교대 근무자만): "신규 간호사인가요?" 예/아니오 → 예: 구분(완전 신규 / 경력자), 프리셉터 선택(교대 근무자, 연차 순), 트레이닝 시작·종료, 3인 근무 종료(시작 + 규칙 주 수로 미리 채움).
- 바뀐 값은 입력칸 왼쪽 3px `warn` 바 + "처음 값: {값}" 11px.
- 버튼 하나 "저장하고 근무표 보기". 오류는 칸 아래 12px `danger`.
- 해마다 모드: 제목 "{올해}년 연차를 확인해 주세요", 연차 칸 하나 + 버튼.

### CellTip
- 칸에 `data-tip`(JSON 아님, 서버가 만든 줄 배열의 인덱스). 마우스 진입 150ms 뒤, 포커스 즉시, 터치 500ms 길게 누르기로 표시. 칸 위쪽 8px(공간이 없으면 아래), 최대 폭 260, bg `ink`(#1B1F1E) 글자 흰색 12px, radius 8, padding 8 10. 줄마다 하나의 사실(R-TIP-1~3).
- 스크린 리더: 칸 `aria-describedby`로 숨은 설명 텍스트(같은 줄).
- 인쇄에서는 숨김.

### Legend (S3 헤더 오른쪽)
- 칩 D/E/N/S/OFF 다음에 `□ 신청`(빨간 실선) `□ 교환`(빨간 점선) `□ 관리자 수정`(파란 실선), 12px `ink-2`.

### StaffManager
- 목록 행 이름 옆 pill "본인 입력 확인 필요"(#FBE7B5/#6B4300). 행을 펼치면 표: 항목 · 이전 → 이후 · 제출 시각. 버튼 "확인"·"되돌리기"(메모 입력 필수 모달).
- 간호사 추가 폼은 그대로(사번 필수). 동의 여부 열 "동의 {M/D}" / "미동의".
