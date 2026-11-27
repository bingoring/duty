# duty (벌써 근무표짤 때가 됐어?) — waypoint 현황

[요구사항](inputs/requirements_v3.md) · [최신 디자인 핸드오프](inputs/design_handoff_nurse_duty_scheduler/README.md) · [결정 로그](DECISIONS.md) · [지난 기록](HISTORY.md) · [운영 문서](../operations.md)

## 스테이지

| ID | 스테이지 | 상태 | 줄기 | 지금 | 기다림 | 링크 |
|---|---|---|---|---|---|---|
| 1-1 | Context Synthesis | MERGED | | | | [문서](01-inception/01-context-synthesis.md) |
| 1-2 | Domain Model | MERGED | | | | [문서](01-inception/02-domain-model.md) |
| 1-3 | Architecture Decision ⚠️ | MERGED | | | | [문서](01-inception/03-architecture-decision.md) |
| 2-1 | Foundation | MERGED | | | | [문서](02-construction/01-foundation.md) |
| 2-2 | Domain Core | MERGED | | | | [문서](02-construction/02-domain-core.md) |
| 2-3 | 근무표 조회 | MERGED | | | | [문서](02-construction/03-schedule-view.md) |
| 2-4 | 관리자 설정 | MERGED | | | | [문서](02-construction/04-admin-settings.md) |
| 2-5 | 근무 신청·휴가 | MERGED | | | | [문서](02-construction/05-shift-requests.md) |
| 2-6 | 솔버·듀티 생성 | MERGED | | | | [문서](02-construction/06-solver-generation.md) |
| 2-7 | 근무 조정·월 마감 | MERGED | | | | [문서](02-construction/07-adjust-close.md) |
| 2-8 | 근무 교환 요청 | MERGED | | | | [문서](02-construction/08-swap-requests.md) |
| 2-9 | 통합·E2E | MERGED | | | | [문서](02-construction/09-integration-e2e.md) |
| 2-10 | 동료 현황·규칙 안내 | MERGED | | | | [문서](02-construction/10-peers-rules.md) |
| 2-11 | 수간호사 S·칸 출처 표시·최초 로그인 | MERGED | | | | [문서](02-construction/11-head-firstlogin.md) |
| R-1 | Independent Code Review 🔍 | MERGED | | | | [문서](0R-review/01-independent-review.md) |
| 3-1 | Deployment ⚠️ | MERGED | | | | [문서](03-operations/01-deployment.md) |
| 3-2 | Monitoring | MERGED | | | | [문서](03-operations/02-monitoring.md) |
| 3-3 | 자동 배포 | MERGED | | | | [문서](03-operations/03-continuous-deployment.md) |
| 3-4 | 운영 피드백 1 | MERGED | | | | [문서](03-operations/04-feedback-1.md) |
| 3-5 | 운영 피드백 2 | MERGED | | | | [문서](03-operations/05-feedback-2.md) |
| 3-6 | 운영 피드백 3 | MERGED | | | | [문서](03-operations/06-feedback-3.md) |
| 3-7 | 의사 근무표 | MERGED | | | | [문서](03-operations/07-doctor-schedule.md) |
| 3-8 | 운영 피드백 4 | MERGED | | | | [문서](03-operations/08-feedback-4.md) |
| 3-9 | 운영 피드백 5 | MERGED | | | | [문서](03-operations/09-feedback-5.md) |
| 3-10 | 운영 피드백 6 | AI_PROPOSED | | 결과 검토: 운영 반영(3c10661). 누적 OFF에서 휴가를 어떻게 셀지(6번 확인 과제) 결정 | | [문서](03-operations/10-feedback-6.md) |
| 3-11 | 운영 피드백 7 | MERGED | | | | [문서](03-operations/11-feedback-7.md) |
| 3-12 | 모바일 대응 | AI_PROPOSED | | 결과 검토: 운영 반영(25eb31e). 실기기에서 홈 화면 추가·로그인 유지·시트 확인 뒤 승인 | | [문서](03-operations/12-mobile.md) |
| 3-13 | 서버 비용 절감 | IN_PROGRESS | | 구현: 첫 전체 배포 성공(2684d1a). 배포 계정의 VM 역할과 저장소 변수 DEPLOY_TARGET·GCP_ZONE 삭제 | 오너 할 일 | [문서](03-operations/13-serverless.md) |

## 오너 할 일

- [ ] offplz.com에서 신청 저장·근무표 생성(의사 포함) 확인 (막음: 3-13)
- [ ] 개인정보 안내에 「Firebase Hosting(접속 전달)」을 더할지 결정 (막음: 3-13)
