import { describe, expect, it } from 'vitest'
import { parseRosterCsv, ROSTER_HEADER } from './roster'

const HEADER = ROSTER_HEADER.join(',')
const row = 'employee_no,name,role,rotation,seniority_rank,seniority_tier,hire_date,k_tass,union_member'

describe('parseRosterCsv', () => {
  it('헤더 순서가 스펙과 같다', () => {
    expect(HEADER).toBe(row)
  })

  it('정상 행을 파싱하고 사번 앞자리 0을 보존한다', () => {
    const r = parseRosterCsv(`${HEADER}\n00101,한수정,admin,fixed_weekday,1,senior,2009-03-11,true,true\n`)
    expect(r).toEqual({
      ok: true,
      rows: [
        {
          employeeNo: '00101',
          name: '한수정',
          role: 'admin',
          rotation: 'fixed_weekday',
          seniorityRank: 1,
          seniorityTier: 'senior',
          hireDate: '2009-03-11',
          kTass: true,
          unionMember: true,
        },
      ],
    })
  })

  it('UTF-8 BOM·CRLF·빈 줄·빈 입사일을 허용한다', () => {
    const r = parseRosterCsv(`﻿${HEADER}\r\n00109,서예린,nurse,rotating,9,junior,,false,false\r\n\r\n`)
    expect(r.ok && r.rows[0]).toMatchObject({ employeeNo: '00109', hireDate: null, kTass: false })
  })

  it('헤더가 다르면 실패한다', () => {
    const r = parseRosterCsv('사번,이름\n00101,한수정')
    expect(r).toEqual({ ok: false, errors: [expect.stringContaining('헤더가 다릅니다')] })
  })

  it('잘못된 행을 모두 모아 행 번호와 함께 보고한다 (R-ROSTER-3)', () => {
    const csv = [
      HEADER,
      '00101,한수정,boss,fixed_weekday,1,senior,,true,true',
      '00102,박서연,nurse,rotating,0,senior,2020-13-01,yes,false',
      ',이름없음,nurse,rotating,3,mid,,false,false',
    ].join('\n')
    const r = parseRosterCsv(csv)
    expect(r.ok).toBe(false)
    const errors = r.ok ? [] : r.errors
    expect(errors.some((e) => e.startsWith('2행:') && e.includes('role'))).toBe(true)
    expect(errors.some((e) => e.startsWith('3행:') && e.includes('seniority_rank'))).toBe(true)
    expect(errors.some((e) => e.startsWith('3행:') && e.includes('hire_date'))).toBe(true)
    expect(errors.some((e) => e.startsWith('3행:') && e.includes('k_tass'))).toBe(true)
    expect(errors.some((e) => e.startsWith('4행:') && e.includes('employee_no'))).toBe(true)
  })

  it('같은 파일 안의 사번 중복을 두 행 번호로 보고한다', () => {
    const csv = [
      HEADER,
      '00101,가,nurse,rotating,1,senior,,false,false',
      '00101,나,nurse,rotating,2,senior,,false,false',
    ].join('\n')
    const r = parseRosterCsv(csv)
    expect(r.ok ? [] : r.errors).toEqual([expect.stringMatching(/사번 00101.*2행.*3행/)])
  })

  it('열 개수가 다르면 그 행을 실패로 보고한다', () => {
    const r = parseRosterCsv(`${HEADER}\n00101,한수정,admin`)
    expect(r.ok ? [] : r.errors).toEqual([expect.stringMatching(/^2행: 열 개수/)])
  })
})
