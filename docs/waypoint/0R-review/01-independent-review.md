---
phase: 0R-review
stage: 01-independent-review
status: IN_PROGRESS
updated: 2026-10-08
---

# [Stage R-1] Independent Code Review 🔍

## 목적

작성자(구현 주체)와 **컨텍스트가 분리된** 독립·적대적 리뷰어가 Construction 산출물(코드+테스트)을 검토하여
설계 게이트가 놓치는 코드 레벨 결함을 선제적으로 잡고, 진짜 결함을 수정한 뒤 Operations 진입을 게이트한다.

## 입력 (Inputs)

- Construction 전 스테이지(2-1~2-10) 산출물: 메인 저장소 `apps/web/src`, `packages/domain/src`, `packages/contract/src`, `services/solver/solver`, 마이그레이션, `compose*.yaml`, CI
- 요구사항: `../inputs/requirements_v3.md`, 결정 로그: `../DECISIONS.md`
- 리뷰어 지시: `../../../_templates/reviewer-brief-template.md` (관점별로 채워 사용)

## 체크리스트

- [ ] 독립 리뷰어(작성자와 분리된 별도 에이전트/세션/모델 또는 사람)로 적대적 리뷰 실행
- [ ] findings 를 severity 별로 정리하고 **각 항목 검증**(맹목 수용 금지)
- [ ] 진짜 결함 수정 + 회귀 테스트 추가
- [ ] 반박 항목은 근거 기록
- [ ] 수정 후 test/build/coverage 재확인

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

### 방식

- 적응형 깊이: **복잡/고위험**(인증·잔여치 원장·동시 편집·솔버). 관점 4개로 나눈 독립 서브에이전트 4명(각자 새 컨텍스트, 작성 대화 비공유), refute 모드.
  ① 보안·인증·권한 ② 동시성·데이터 정합성(트랜잭션·원장·상태 전이) ③ 도메인 정확성(검사기·정산·솔버 계약) ④ 웹 계산·운영(조회·연초 처리·마이그레이션·배포 설정·에러 처리).
- 받은 findings 를 그대로 구현하지 않고 각각 코드·테스트로 검증 후 채택/반박. 핵심 결함은 재현 테스트로 확인.

(진행 중)
