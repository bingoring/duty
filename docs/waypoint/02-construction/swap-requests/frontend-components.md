# frontend-components — 2-8 S9 간호사 시점 (3a)

SoT: 핸드오프 v5 README S9 "간호사 시점 (3a)", 프로토타입 `id="3a"`(1280×820).

```
AdjustPage(간호사) → NurseAdjust (client)
  main: grid `1fr 262px`(패널 접으면 `1fr 72px`), gap 12, padding 18px 16px
  ├ 헤더: ‹ "2026년 11월 · 근무 조정" › · 배지(협의 기간: #FBE7B5/#6B4300 "협의 기간 10/16 – 10/20 · 3일 남음", 밖이면 회색)
  │        ml-auto "선택 N명 · 11/1"(12px) · [선택 해제](h32 보조) · [근무 조정](h32, bg ink, 흰 글자 700 — 선택 모드 토글, 협의 기간 밖 비활성)
  ├ 범례(12px): 14×14 #FFF9E8 "선택한 사람" · #FBE7B5 "선택한 날짜" · 빨간 인셋 "신청 반영"
  ├ 격자 `24px 62px repeat(n, minmax(23px,1fr))`: 체크(16×16 radius 4, 선택 bg ink ✓) · 성명(내 줄 좌 3px primary 바) · 날짜 칸(S3 칩)
  │   선택 행 #FFF9E8, 선택 열 #FBE7B5, 교차 칸 outline 2px ink. 수간호사 행 없음. 이월·누적 열 없음(3a)
  ├ 안내(12px ink-2): "협의 기간이 끝나면 요청을 보낼 수 없습니다. 모든 당사자가 수락하면 즉시 근무표에 반영되고, …"
  ├ SwapPopup (400px, border ink, radius 12, shadow, p 16, gap 12)
  │   "11/1 (일) · 3인 근무 재배정"(14px/700) ↔ "칩을 눌러 두 사람 근무를 맞바꾸기"(12px)
  │   표 `72px 1fr 20px 1fr`: 이름(나 = primary "박서연 (나)") | 현재 칩 34×30 | → | 변경 후 칩(바뀐 칩 inset 2px ink, 고른 칩 outline admin)
  │   검사 박스: 통과 #DDEFEB/#0B564D · 위반 #FDECEA/#8A1F12 · 겹침 경고 #FBE7B5/#6B4300
  │   textarea 2줄 "코멘트(당사자에게 보임)" · "오민지 · 강도윤에게 요청됩니다" · [취소] [요청 보내기](primary)
  └ SwapPanel (262px / 접힘 72px 레일 "조정 요청" + 받은 수 배지, 접힘 상태 localStorage)
      탭(배타): 「받은 요청 N」 · 「보낸 요청 N」 · 「접기 ›」
      받은 카드(border ink): "{보낸이} 님의 요청" · 시각 · 제목 · 변경 내용 · 코멘트(bg panel) · [거절] [수락]
      보낸 카드(border line): 제목 · 시각 · 변경 내용 · 당사자별 상태(대기 ink-3 / 수락 primary / 거절 danger) · 종합 상태 · 대기면 [철회]
```

E2E 앵커: 체크 `role=checkbox aria-label="{이름} 선택"`, 팝업 `role=dialog aria-label="{M/D} 근무 재배정"`, 변경 후 칩 `aria-label="{이름} 변경 후 {코드}"`,
패널 `role=complementary aria-label="조정 요청"`, 카드 `role=article aria-label="{제목}"`.
