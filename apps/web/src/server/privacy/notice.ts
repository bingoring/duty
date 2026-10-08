// Build Spec 2-11 business-rules §5·§7 — 개인정보 수집·이용 동의서 문안의 원천(동의 화면·/privacy 공용).
// 초안이다. 운영 전에 병원 개인정보 담당이 검토한다. 문구를 바꾸면 버전을 올린다 → 모든 사용자가 다음 로그인 때 다시 동의한다(R-CONSENT-4)
export const PRIVACY_NOTICE_VERSION = '2026-10-v1'

export type NoticeSection = { title: string; rows: { label: string; text: string }[] }

export const PRIVACY_REQUIRED: NoticeSection = {
  title: '개인정보 수집·이용 동의 (필수)',
  rows: [
    {
      label: '목적',
      text: '응급실 근무표 작성·조정, 오프·나이트·휴가 잔여 관리, 근무 교환·신청 처리, 본인 확인(로그인)',
    },
    {
      label: '항목',
      text: '사번, 이름, 입사일, 연차 구분, K-tass 자격, 근무 방식(교대·야간 전담 기간), 근무 기록, 근무·휴가 신청과 사유, 오프·나이트·연차 잔여, 트레이닝(프리셉터·기간), 접속 기록(로그인 시각·IP)',
    },
    {
      label: '보유·이용 기간',
      text: '재직 기간 동안 보유하고, 퇴직 후 3년(근로기준법 제42조 근로자 명부·계약 서류 보존 기간)이 지나면 파기합니다. 백업 사본은 최대 90일 뒤 삭제됩니다.',
    },
    { label: '처리 위탁', text: 'Google Cloud(서울 리전) — 서버 운영과 암호화 백업 보관' },
    {
      label: '거부 권리',
      text: '동의를 거부할 수 있습니다. 다만 이 서비스는 근무표 작성에 위 정보가 필요하므로, 거부하면 서비스를 사용할 수 없고 종이 근무표로 처리합니다.',
    },
  ],
}

export const PRIVACY_SENSITIVE: NoticeSection = {
  title: '민감정보 처리 동의 (필수, 별도)',
  rows: [
    { label: '항목', text: '노동조합 가입 여부(노조교육 OFF 배정), 병가 사유(건강 정보)' },
    { label: '목적·기간', text: '위 수집·이용 동의와 같습니다. 병가 사유는 본인과 관리자만 열람합니다.' },
    { label: '거부 권리', text: '위와 같습니다.' },
  ],
}

export const PRIVACY_CONTACT = '문의: 응급실 수간호사(관리자) · 병원 개인정보 보호책임자'
