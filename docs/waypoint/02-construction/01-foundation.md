---
phase: 02-construction
stage: 01-foundation
status: AI_PROPOSED
updated: 2026-09-26
---

# [Stage 2-1] Foundation

## 목적

모노레포·컨테이너·CI, 1-2 전 엔티티의 DB 스키마와 마이그레이션, 시드(가명 명단·공휴일·규칙 v1)와 실명 명단 로컬 가져오기,
사번+비밀번호 인증(S1 로그인·첫 로그인 비밀번호 변경), 공통 셸(사이드바·디자인 토큰)을 만들어 이후 모든 화면 스테이지의 바닥을 깐다.

## 입력 (Inputs)

- [`../01-inception/02-domain-model.md`](../01-inception/02-domain-model.md) §2 엔티티, §6 불변식, §8 권한
- [`../01-inception/03-architecture-decision.md`](../01-inception/03-architecture-decision.md) §1 구조, §2 스택, §5 인증, §6 데이터, §10 분해
- [`../inputs/design-handoff_v1/README.md`](../inputs/design-handoff_v1/README.md) Design Tokens, 공통 셸, S1
- [`../inputs/requirements_v3.md`](../inputs/requirements_v3.md) 응급실 근무자(가명)
- [`../DECISIONS.md`](../DECISIONS.md) 2026-09-26 개인정보(가명 시드, 실명은 로컬 파일)

## 체크리스트

- [ ] Build Spec 작성·질문 해소 → READY
- [ ] Build Spec §4 구현 체크리스트 전 항목 완료
- [ ] Build Spec §5 검증 통과 → IMPLEMENTED

## AI 제안 (AI Proposal)

> ⚠️ 이 섹션은 AI가 작성합니다. 사람이 직접 수정하지 마세요.

Build Spec(standard 티어 + 로직·화면 아티팩트 포함): [`foundation/build-spec-index.md`](foundation/build-spec-index.md)

요지:
- **구성:** pnpm workspace(`apps/web`, `packages/domain`) + Docker Compose(`db`, `web`). 솔버·계약 패키지는 2-6에서 추가한다.
- **DB:** 1-2의 엔티티 15개를 한 번에 스키마로 만든다(후속 스테이지가 마이그레이션을 쪼개지 않도록). enum성 값은 FRAMEWORK
  방침대로 DB CHECK가 아니라 `@duty/domain`의 allowed-set(zod)으로 검증하고, DB는 PK·FK·UNIQUE·NOT NULL만 강제한다.
- **데이터:** 저장소 시드는 가명 11명, 실제 명단은 `.local/roster.csv`(gitignore)를 `pnpm db:import-roster`로 넣는다.
  운영 최초 부팅은 `pnpm db:bootstrap`이 관리자 1명을 만들고 임시 비밀번호를 한 번만 출력한다.
- **인증:** argon2id, DB 세션(토큰의 SHA-256만 저장), 5회 실패 15분 잠금, 첫 로그인 비밀번호 변경 강제.
  Next.js 16의 `proxy.ts`는 쿠키 유무로 리다이렉트만 하고, 실제 인증·권한 판정은 서버 레이아웃·액션에서 DB로 한다.
- **화면:** S1 로그인(1d 픽셀 재현), 비밀번호 변경(핸드오프에 없음 → S1 스타일로 설계, 편차 기록), 공통 셸(사이드바·사용자 블록),
  이후 스테이지 화면은 셸 안의 자리표시 페이지.

## 검토 게이트 (Human Gate)

> 아래 항목을 확인 후 frontmatter의 status를 `HUMAN_APPROVED`로 변경하세요.

- [ ] Build Spec이 READY이고 범위(§0)·분해(§1)가 2-1에 맞는가? (승인 = 구현 착수)
- [ ] 구현 후: §5 검증 통과, 편차 로그(§7) 확인

## 다음 단계

READY 승인 → 구현 → IMPLEMENTED → `STATUS.md`의 2-1을 `HUMAN_APPROVED`로 업데이트 → `02-domain-core.md`로 이동
