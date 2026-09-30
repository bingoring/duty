---
phase: 02-construction
stage: 07-adjust-close
status: AI_PROPOSED
updated: 2026-09-30
---

# [Stage 2-7] 근무 조정·월 마감 (S9 관리자)

## 목적

확정된 달의 근무표를 관리자가 칸 단위로 고치고(즉시 규칙 검사·맞바꾸기·대체 지정) 「저장 · 재배포」하며, 달이 끝나면 월 마감으로 정산을 원장에 기록한다.
확정된 달 휴가의 대체 지정·승인 취소와, 바뀐 근무를 당사자에게 알리는 근무표 안내 띠를 포함한다.

## 입력 (Inputs)

- [`../inputs/design-handoff_v4/README.md`](../inputs/design-handoff_v4/README.md) S9 관리자 시점(1j), S4-A "승인 · 대체 지정" / 프로토타입 `id="1j"`
- [`../01-inception/02-domain-model.md`](../01-inception/02-domain-model.md) §3·§4, 불변식 4
- 2-2 정산·검사기, 2-3 이월, 2-5 휴가 승인, 2-6 월초 잔여 채움
- [`../DECISIONS.md`](../DECISIONS.md) 2026-09-30 「2-7 근무 조정·월 마감 (Q1~Q4)」

## 체크리스트

- [x] Build Spec 작성·질문 해소 → READY (2026-09-30 승인)
- [x] Build Spec §4 구현 체크리스트 전 항목 완료
- [x] Build Spec §5 검증 통과 → IMPLEMENTED (2026-09-30)

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(comprehensive, 4 아티팩트): [`adjust-close/build-spec-index.md`](adjust-close/build-spec-index.md)

요지:
- **칸 편집(1j):** 5칩 팝오버, 브라우저에서 즉시 규칙 검사(새로 생기는 위반만), 필수 위반은 차단하되 사유를 적으면 예외 적용(Q2), 맞바꾸기, 대체 후보.
  편집은 모았다가 「저장 · 재배포」 한 번에(동시 수정 충돌 차단), 바뀐 칸은 파란 외곽선 + 수정 이력.
- **월 마감(Q1):** 헤더 버튼 → 인당 정산 미리보기 → 스냅샷 + 원장 기록. 마감 취소 = 반대 항목. 앞 달부터 차례로.
- **확정된 달 휴가:** 4a 「승인 · 대체 지정」 → S9 대체 지정 팝오버. 승인 취소는 이전 칸으로 복원(Q4).
- **안내(Q3):** 근무표 상단 띠 "내 근무가 바뀌었습니다 · 10/13 E → OFF" + 확인. 위치 검토 결과는 Build Spec §3.

### 구현 결과 (2026-09-30)

- 메인 저장소 `packages/domain/src/adjust.ts`, `apps/web/src/server/{adjust,notices}/`, `components/adjust/AdjustScreen.tsx`, `components/schedule/NoticeBar.tsx`,
  마이그레이션 `0003_adjust_note_changes_seen`. 편차 7건은 Build Spec §7(주요: 범례를 헤더 아래 줄로, 생성 때 고정된 휴가 칸은 취소해도 칸을 바꾸지 않음).
- 검증: 단위 353 · pytest 12 · 통합 129 · E2E 32 · 빌드 · CI.
- 확인: `pnpm dev` → 사번 `00101` → 근무 조정 → 10월 칸을 눌러 편집 → 저장 · 재배포 → 해당 간호사로 로그인하면 근무표 위에 "내 근무가 바뀌었습니다".

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 예외 허용·마감 순서·안내 위치가 운영과 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-7을 `HUMAN_APPROVED`로 업데이트 → `08-swap-requests.md`로 이동
