import { describe, expect, it } from 'vitest'
import { optionsSatisfied, resolveCellSource, specialSatisfied } from './cell-source'
import { req, row } from './test-utils'

const cell = (spec: string) => row('a', '2026-10-01', spec)[0]!
const D1 = '2026-10-01'

describe('optionsSatisfied (1-2 §5)', () => {
  it('배정 코드가 옵션에 있으면 만족', () => {
    expect(optionsSatisfied(cell('D'), ['OFF', 'D'])).toBe(true)
    expect(optionsSatisfied(cell('E'), ['OFF', 'D'])).toBe(false)
  })
  it('OFF 옵션은 모든 offKind를 만족한다', () => {
    expect(optionsSatisfied(cell('SO'), ['OFF'])).toBe(true)
    expect(optionsSatisfied(cell('EC'), ['OFF'])).toBe(true)
  })
  it('연차·휴가 칸은 OFF 옵션을 만족하지 않는다', () => {
    expect(optionsSatisfied(cell('A'), ['OFF'])).toBe(false)
  })
})

describe('specialSatisfied', () => {
  it('AL → 연차, EDU_CONT → 보수교육 OFF, EDU_UNION → 노조교육 OFF', () => {
    expect(specialSatisfied(cell('A'), 'AL')).toBe(true)
    expect(specialSatisfied(cell('EC'), 'EDU_CONT')).toBe(true)
    expect(specialSatisfied(cell('EU'), 'EDU_UNION')).toBe(true)
    expect(specialSatisfied(cell('O'), 'EDU_CONT')).toBe(false)
    expect(specialSatisfied(cell('EC'), 'EDU_UNION')).toBe(false)
  })
})

describe('resolveCellSource (R-SOURCE-1)', () => {
  it('관리자 편집이 가장 우선한다(신청과 같아도 admin)', () => {
    expect(resolveCellSource(cell('D'), req('a', D1, ['D']), true)).toBe('admin')
  })
  it('신청을 만족하면 requested', () => {
    expect(resolveCellSource(cell('O'), req('a', D1, ['OFF', 'D']), false)).toBe('requested')
    expect(resolveCellSource(cell('EU'), req('a', D1, [], 'EDU_UNION'), false)).toBe('requested')
  })
  it('신청을 만족하지 않거나 신청이 없으면 auto', () => {
    expect(resolveCellSource(cell('E'), req('a', D1, ['OFF', 'D']), false)).toBe('auto')
    expect(resolveCellSource(cell('O'), req('a', D1, [], 'EDU_CONT'), false)).toBe('auto')
    expect(resolveCellSource(cell('N'), undefined, false)).toBe('auto')
  })
  it('연차·휴가 칸은 신청이 없어도 승인 휴가로 보고 requested', () => {
    expect(resolveCellSource(cell('A'), undefined, false)).toBe('requested')
    expect(resolveCellSource(cell('L'), undefined, false)).toBe('requested')
  })
})
