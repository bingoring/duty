import { describe, expect, it } from 'vitest'
import { DEV_ROSTER } from './dev'

// INV4: 공개 저장소이므로 시드 이름·사번은 DECISIONS(2026-09-26 개인정보)의 가명 목록과 정확히 같아야 한다.
const PSEUDONYMS = [
  '한수정',
  '박서연',
  '정하늘',
  '오민지',
  '강도윤',
  '윤채원',
  '임소라',
  '배지현',
  '서예린',
  '홍다은',
  '문가을',
]

describe('개발 시드 명단', () => {
  it('이름이 가명 허용 목록과 순서까지 같다', () => {
    expect(DEV_ROSTER.map((u) => u.name)).toEqual(PSEUDONYMS)
  })
  it('사번은 가상 번호 00101~00111이다', () => {
    expect(DEV_ROSTER.map((u) => u.employeeNo)).toEqual(
      Array.from({ length: 11 }, (_, i) => `001${String(i + 1).padStart(2, '0')}`),
    )
  })
})
