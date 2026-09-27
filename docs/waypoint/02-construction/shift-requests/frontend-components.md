---
artifact: frontend-components
build-spec: shift-requests
status: DRAFT
updated: 2026-09-27
---

# Frontend Components — 2-5 근무 신청·휴가

> 수치는 프로토타입 2a·3b. 3b 헤더 범례(O · O/D 신청 · 휴 · 밑줄 코멘트)와 하단 안내 문구가 2a보다 우선한다.

## 1. 트리

```
requests/page.tsx (server) → RequestsScreen (client)
├── RequestsHeader   ‹ "{YYYY}년 {M}월 · 근무 신청" › · 상태 배지 · 범례
├── RequestCards     4열(2a)
├── LeaveApprovalPanel 관리자만(4a): 우측 260px ↔ 72px 레일, 대기 카드·인원 영향·처리 이력
├── CommentBar       관리자만: 칸 호버 시 "{M/D} {이름} · {라벨}" + 코멘트 전문
├── RequestGrid      grid 96px repeat(n,30px) 56px · 행 36px · 하단 OFF 신청 인원 행
├── RequestPopover   320~340px, 선택 칸 아래
│   ├── 근무 토글 OFF/D/E/N(복수)
│   ├── 보조 칩 휴가 / 교육(보수·노조)
│   ├── LeaveFields  종류 칩 → 사유 드롭다운(경조사·공가) → 시작일·종료일(자동/입력)
│   ├── 코멘트(수간호사에게만 보입니다) · 같은 날 신청 요약
│   └── 취소 / 삭제 / 저장
└── RequestsFooter   안내 · "제출하지 않은 신청 n건" · "신청 제출"
```

## 2. 상세

- 헤더 배지: 신청 중 `warn-bg`/`warn-ink` "신청 중 · 마감 {M/D} ({n}일 남음)", 마감 `line-soft`/`ink-2` "마감", 생성 후 "근무표 생성됨".
- 범례(3b): `O`(off 색, 빨간 인셋) · `O/D`(흰 배경, 빨간 인셋) "신청" · `휴`(#D8E6C3) "휴가 (연차·경조·병가·공가·특휴)" · 점선 밑줄 "코멘트".
- 격자 칸 칩: min-w 26 h26 radius 6 700, 글자 11px(복수 9.5px, 3개 이상 8px). 내 줄 빈 칸(편집 가능할 때): 26×26 점선 `ink-5` "+". 선택 칸 outline 2px `ink`.
- 팝오버: border `ink` radius 12 shadow-popover padding 14 gap 10 13px. 제목 "{M/D (요일)} · 신청" + 오른쪽 12px `ink-2` "근무는 복수 선택 · or". 토글 4열 h36 radius 8(선택 border 2px `ink`, 미선택 opacity .5).
  보조 칩 padding 6 12 radius 6 12px: 휴가(선택 bg #D8E6C3 + border 2px `ink`) · 교육(보수·노조). 휴가·교육 선택 시 근무 토글 opacity .5 비활성.
  교육 선택 시 라디오 보수교육 / 노조교육(노조원만). 휴가 종류 칩: 연차 · 경조사 · 병가 · 공가 · 특별휴가 · 검진. 사유 드롭다운 h38(경조사 "본인·배우자 부모 사망 · 7일", 일수 `primary` 700).
  시작일 · 종료일(자동이면 읽기 전용 bg `panel`). 하단 요약 11.5px `ink-2` "{M/D}–{D} · {n}일 · 유급" + 취소(보조) / 저장(bg `ink` 흰 글자).
- 하단 바 12px `ink-2`: "휴가는 관리자 승인 후 근무표에 반영됩니다. 증빙 서류는 병원 공문으로 별도 제출." · 오른쪽 "마감 후 {협의 기간} 협의 수정" · "제출하지 않은 신청 {n}건"(warn) · "신청 제출"(h34 primary, 임시 0건이면 비활성).
- 관리자 승인 패널(4a): 제목 15px/700 "휴가 승인" + 배지 `danger`, 「접기 ›」 h28 12px. 접힘: 72px 레일, 「‹ 펼치기」(같은 크기) + 세로 글자(`writing-mode: vertical-rl`) "휴가 승인" + 배지, 격자가 남는 폭을 채움. 카드 bg #fff border `line` radius 12 padding 12: 신청자 700 + 월 배지 · 종류 600 · 기간 · 코멘트 bg `panel` · 인원 영향 박스(없음 `primary-soft`/`primary-hover` "… 인원 영향 없음", 경고 `danger-bg`/`danger-ink`) · 반려(보조, 사유 입력) / 승인(primary). 처리 이력 12px.
- 관리자 격자: 이름 70px, 날짜 24px(패널 자리 확보).

## 3. 상태

- 서버 DTO가 SoT. 저장 뒤 `refresh()`. 팝오버 폼 상태만 클라이언트.
- `useHydrated` 표시(2-4)로 E2E가 하이드레이션 뒤 조작.
