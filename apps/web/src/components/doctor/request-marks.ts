// 3-11 4: 의사 신청 칩 표시 규칙 (서버·클라이언트 공용 순수 함수)

// 신청 칩 앞 점 — 본인이 넣은 것(관리자가 자기 것을 넣은 것 포함) = self(빨강),
// 관리자가 다른 의사 대신 넣은 것(byAdmin) = admin(파랑)
export type RequestDot = 'self' | 'admin'
export const requestDot = (r: { byAdmin: boolean }): RequestDot => (r.byAdmin ? 'admin' : 'self')

// 아직 저장 전인 칸의 점: 관리자가 다른 의사 화면에서 넣으면 파랑
export const draftDot = (actorId: string, userId: string): RequestDot =>
  actorId === userId ? 'self' : 'admin'

// 관리자가 넣어 준 신청은 그 의사가 바꾸거나 철회할 수 없다 (관리자에게 요청)
export const lockedForActor = (r: { byAdmin: boolean } | undefined, actor: { role: 'admin' | 'member' }) =>
  !!r?.byAdmin && actor.role !== 'admin'

export const DOT_CLS: Record<RequestDot, string> = { self: 'bg-danger', admin: 'bg-admin' }
export const DOT_LABEL: Record<RequestDot, string> = { self: '본인 신청', admin: '관리자 입력' }
