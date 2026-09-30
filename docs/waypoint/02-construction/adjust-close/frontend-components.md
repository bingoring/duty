# frontend-components — 2-7 S9 근무 조정 (관리자 1j) + 근무표 안내 띠

SoT: 핸드오프 v4 README S9 "관리자 시점 (1j)", 프로토타입 `id="1j"`(1280×760). 치수·색은 프로토타입 인라인 값 그대로.

## §1. 트리

```
app/(app)/adjust/page.tsx   서버: ?ym=(기본 이번 달) &focus= &shift=
└ AdjustScreen (client, data-hydrated)
  main: flex column gap 12, padding 18px 16px
  ├ Header (flex, items-center, gap 12)
  │  ‹ "2026년 10월 · 근무 조정" › (20px/700)
  │  NegotiationEditor — 흰 박스(border line, radius 8, pl 10 pr 4 py 3, 12px): "협의 수정 기간" ink-2 · input M/D(46×24, radius 6, 가운데)
  │     · "–" · input(바뀌면 border admin) · [변경](h24, px 8, bg ink, 흰 글자, 11px/600)
  │  "신청 마감 매월 15일 · 설정"(설정 = /admin/rules 링크)
  │  ml-auto 범례: 14×14 빨간 인셋 1.5px "신청 (OFF·D·E·N 모두)" · 파란 인셋 2px "관리자 수정"
  │  "변경 N건 미저장"(13px ink-2) · [되돌리기](h32, 보조) · [저장 · 재배포](h32, primary, 700)
  │  [월 마감](h32, 보조) 또는 [마감 취소] — Q1. 비활성이면 title에 이유
  ├ 상태 띠(필요할 때): 마감한 달 · 생성안 확인 중 · 미생성(링크 "듀티 생성으로")
  ├ Grid — 2-3 ScheduleGrid와 같은 사양(68px 36px 36px repeat(n,24px) 34px×5), 관리자: 셀 클릭 가능(button), 미저장 편집 칸은 파란 점선 인셋,
  │        focus 날짜 열은 #FBE7B5 배경(3a 선택 열 색)
  ├ CellPopover (300px, border ink, radius 12, shadow 0 16px 40px rgba(0,0,0,.18), p 14, gap 10, 13px) — 칸 옆에 뜸
  │   "정하늘 · 10/13 (화)" 700 ↔ "현재 E"
  │   5칩 grid repeat(5,1fr) gap 6, h36 radius 8 700: D #FBE7B5 · E #CFE8E3 · N #D9D6F2 · OFF #EEECE6 · S #F7D9E3, 현재 값 border 2px admin, 고른 값 border 2px ink
  │   (OFF 선택 시) 체크 "슬리핑오프로" — 한도 안에서만
  │   신청 줄(12px ink-2): "신청: OFF or D · 코멘트 "…""
  │   필수 위반 박스(#FDECEA/#8A1F12, radius 8, p 8px 10px, 12px lh 1.5): "<b>D로 변경 불가</b> · 전일 10/12 E → E-D 금지 패턴, 휴식 8시간 (16시간 미만)"
  │   인원 경고 박스(#FAF9F6, ink-2): "OFF로 변경 시 10/13 E 인원 2 → 1명. <b>최소 인원 미달</b>, 대체자 필요: 강도윤 (OFF, K-tass)"
  │   권고 경고(12px warn-ink): "권고 · N-OFF-E 1회"
  │   예외(Q2): 필수 위반이 있으면 textarea "사유 (필수 규칙을 어기고 적용하는 이유)" + [그래도 적용]
  │   버튼 행(justify-end gap 6): [강도윤과 맞바꾸기](h32 보조) · [적용](h32, bg ink, 흰 글자, 600)
  │   휴가 칸: 종류·기간 + [휴가 취소](danger 보조) 만
  ├ ReplacementPopover (focus로 열림, 300px 같은 틀): "10/14 (수) E 인원 1명 · 최소 2명" · 후보 행(이름 · "OFF, K-tass" · [지정]) · 흐린 후보는 이유
  └ CloseDialog (모달 560px): "10월 마감" · 표(성명 | 실제 OFF/기준 | 누적 OFF 전→후 | N | 슬리핑 | 잔여 N 전→후) · 안내 "마감하면 원장에 기록되고 칸을 고칠 수 없습니다" · [취소] [마감]
간호사: 같은 격자(내 줄 강조, 클릭 없음) + 우측 안내 "교환 요청 기능은 준비 중입니다" — 2-8에서 3a로 교체

app/(app)/page.tsx (근무표) 상단: NoticeBar
  bg #FFF9E8(3a 선택 행 색), border line, radius 10, px 12 py 10, 13px: "내 근무가 바뀌었습니다" 700 · 줄마다 "10/13 (화) E → OFF · 한수정 10/12 14:05" · [확인](h28 보조)
```

## §2. 상호작용

| 동작 | 결과 |
|---|---|
| 셀 클릭(관리자, CONFIRMED) | CellPopover. 바깥 클릭·Esc = 닫기(편집 안 함) |
| 적용 / 그래도 적용 / 맞바꾸기 / 지정 | 편집안에 추가, 팝오버 닫힘, "변경 N건 미저장" |
| 저장 · 재배포 | 성공: 편집안 비움 + "N건 저장했습니다" / 충돌·미허용 위반: 오류 목록, 편집안 유지 |
| 편집안이 있을 때 월 이동·새로고침 | `beforeunload` 경고, ‹ › 는 확인 창 |
| 월 마감 | CloseDialog → 마감 → 상태 띠 "마감한 달" |

## §3. 접근성·E2E 앵커

- 칸 버튼 이름 `${이름} ${M/D}`(2-5와 같은 규칙), 팝오버 `role="dialog" aria-label="${이름} ${M/D} 근무 편집"`.
- 버튼: "적용", "그래도 적용", "저장 · 재배포", "되돌리기", "월 마감", "마감 취소", "휴가 취소", "지정", "확인". textarea `aria-label="예외 사유"`.
- 안내 띠 `role="status" aria-label="바뀐 근무"`.
