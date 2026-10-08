import { DEFAULT_RULES } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import { buildRequestsView, type RequestsRaw } from './dto'

const U = (id: string, rank: number, name = id) => ({ id, name, seniorityRank: rank })
const sub = new Date('2026-10-03T00:00:00Z')

function raw(over: Partial<RequestsRaw> = {}): RequestsRaw {
  return {
    year: 2026,
    month: 11,
    today: '2026-10-05',
    plan: {
      status: 'REQUESTING',
      requestDeadline: '2026-10-15',
      negotiationStart: '2026-10-16',
      negotiationEnd: '2026-10-20',
    },
    users: [U('a', 2, '박서연'), U('me', 3, '정하늘'), U('c', 4, '오민지')],
    requests: [
      {
        userId: 'a',
        date: '2026-11-13',
        options: ['OFF', 'D'],
        special: null,
        comment: '오후 병원',
        submittedAt: sub,
      },
      { userId: 'a', date: '2026-11-14', options: ['E'], special: null, comment: null, submittedAt: null }, // 남의 임시
      {
        userId: 'me',
        date: '2026-11-13',
        options: ['OFF'],
        special: null,
        comment: '내 코멘트',
        submittedAt: null,
      }, // 내 임시
      { userId: 'c', date: '2026-11-13', options: ['OFF'], special: null, comment: null, submittedAt: sub },
      { userId: 'c', date: '2026-11-20', options: [], special: 'EDU_CONT', comment: null, submittedAt: sub },
    ],
    leaves: [
      {
        id: 'l1',
        userId: 'a',
        type: 'family',
        reasonCode: 'parent_death',
        startDate: '2026-11-19',
        endDate: '2026-11-25',
        days: 7,
        status: 'SUBMITTED',
        comment: '부고',
        rejectReason: null,
        decidedAt: null,
      },
      {
        id: 'l2',
        userId: 'me',
        type: 'annual',
        reasonCode: null,
        startDate: '2026-11-02',
        endDate: '2026-11-02',
        days: 1,
        status: 'REJECTED',
        comment: null,
        rejectReason: '인원 부족',
        decidedAt: sub,
      },
      {
        id: 'l3',
        userId: 'c',
        type: 'annual',
        reasonCode: null,
        startDate: '2026-11-03',
        endDate: '2026-11-03',
        days: 1,
        status: 'REJECTED',
        comment: null,
        rejectReason: '비공개',
        decidedAt: sub,
      },
    ],
    scheduled: [],
    rules: DEFAULT_RULES,
    viewerCard: { baseline: 9, offCarry: 4, nightBank: 7, weekendMissedLastMonth: true },
    pending: [],
    history: [],
    ...over,
  }
}

const cellOf = (v: ReturnType<typeof buildRequestsView>, userId: string, date: string) =>
  v.rows.find((r) => r.userId === userId)!.cells.find((c) => c.date === date)!

describe('buildRequestsView — 권한 (1-2 §8, R-REQ-VIEW)', () => {
  it('간호사: 남의 코멘트 본문은 없고 밑줄 표시만, 내 코멘트는 보인다', () => {
    const v = buildRequestsView(raw(), { id: 'me', role: 'nurse' })
    expect(cellOf(v, 'a', '2026-11-13')).toMatchObject({ label: 'O/D', hasComment: true })
    expect(cellOf(v, 'a', '2026-11-13').comment).toBeUndefined()
    expect(cellOf(v, 'me', '2026-11-13')).toMatchObject({ label: 'O', comment: '내 코멘트', draft: true })
    expect(JSON.stringify(v)).not.toContain('오후 병원')
    expect(JSON.stringify(v)).not.toContain('부고')
  })

  it('동료 휴가는 종류만, 경조·공가 사유는 본인과 관리자만 (R-1)', () => {
    const peer = cellOf(buildRequestsView(raw(), { id: 'me', role: 'nurse' }), 'a', '2026-11-19')
    expect(peer.leave).toMatchObject({ type: 'family', kindLabel: '경조사', reasonCode: null })
    expect(JSON.stringify(buildRequestsView(raw(), { id: 'me', role: 'nurse' }))).not.toContain(
      'parent_death',
    )
    for (const viewer of [
      { id: 'a', role: 'nurse' as const },
      { id: 'head', role: 'admin' as const },
    ])
      expect(cellOf(buildRequestsView(raw(), viewer), 'a', '2026-11-19').leave).toMatchObject({
        kindLabel: '경조사 · 본인·배우자 부모 사망',
        reasonCode: 'parent_death',
      })
  })

  it('관리자: 코멘트 전문이 보인다', () => {
    const v = buildRequestsView(raw(), { id: 'head', role: 'admin' })
    expect(cellOf(v, 'a', '2026-11-13').comment).toBe('오후 병원')
  })

  it('남의 임시 신청은 누구에게도 보이지 않는다', () => {
    for (const viewer of [
      { id: 'me', role: 'nurse' as const },
      { id: 'head', role: 'admin' as const },
    ]) {
      expect(cellOf(buildRequestsView(raw(), viewer), 'a', '2026-11-14').kind).toBeNull()
    }
  })

  it('반려된 휴가는 본인에게만 사유와 함께', () => {
    const v = buildRequestsView(raw(), { id: 'me', role: 'nurse' })
    expect(cellOf(v, 'me', '2026-11-02')).toMatchObject({
      kind: 'leave',
      leave: { status: 'REJECTED', rejectReason: '인원 부족' },
    })
    expect(cellOf(v, 'c', '2026-11-03').kind).toBeNull()
    expect(JSON.stringify(v)).not.toContain('비공개')
  })
})

describe('buildRequestsView — 표시', () => {
  it('나 먼저, 휴가 칸은 기간 전체, 교육은 교', () => {
    const v = buildRequestsView(raw(), { id: 'me', role: 'nurse' })
    expect(v.rows.map((r) => [r.userId, r.me])).toEqual([
      ['me', true],
      ['a', false],
      ['c', false],
    ])
    expect(cellOf(v, 'a', '2026-11-22')).toMatchObject({
      kind: 'leave',
      label: '휴',
      leave: { status: 'SUBMITTED' },
    })
    expect(cellOf(v, 'c', '2026-11-20').label).toBe('교')
  })

  it('OFF 신청 인원은 제출된 OFF 단일만, 신청 건수는 제출분(휴가는 1건)', () => {
    const v = buildRequestsView(raw(), { id: 'me', role: 'nurse' })
    expect(v.offCounts['2026-11-13']).toBe(1) // c만(내 것은 임시, a는 O/D)
    expect(v.rows.find((r) => r.userId === 'a')!.count).toBe(2) // O/D + 휴가
    expect(v.unsubmitted).toBe(1)
  })

  it('카드: OFF 목표(기준 − 누적 + 슬리핑오프)와 주말 통 OFF 우선 대상', () => {
    const v = buildRequestsView(raw(), { id: 'me', role: 'nurse' })
    expect(v.cards).toMatchObject({
      offTargetText: '11월 기준 OFF 9 · 누적 +4 · 슬리핑오프 1 → 목표 6',
      weekendText: '주말 연휴 통 OFF: 우선 대상 (10월 미배정)',
    })
  })

  it('편집 가능: 간호사는 신청 기간 안 자기 줄, 마감 뒤 불가, 관리자는 생성 전 언제나', () => {
    expect(buildRequestsView(raw(), { id: 'me', role: 'nurse' }).editable).toBe('all')
    expect(buildRequestsView(raw({ today: '2026-10-16' }), { id: 'me', role: 'nurse' }).editable).toBe('none')
    expect(
      buildRequestsView(raw({ today: '2026-10-16', plan: { ...raw().plan!, status: 'REQUEST_CLOSED' } }), {
        id: 'h',
        role: 'admin',
      }).editable,
    ).toBe('all')
    const confirmed = raw({ plan: { ...raw().plan!, status: 'CONFIRMED' } })
    expect(buildRequestsView(confirmed, { id: 'me', role: 'nurse' }).editable).toBe('leave')
  })
})

describe('buildRequestsView — 날짜 머리', () => {
  it('요일·빨간 날(토·일·공휴일, 개원기념일 제외)', () => {
    const v = buildRequestsView(
      raw({
        holidays: [
          { date: '2026-11-20', kind: 'founding_day' },
          { date: '2026-11-03', kind: 'hospital' },
        ],
      }),
      { id: 'me', role: 'nurse' },
    )
    expect(v.days).toHaveLength(30)
    expect(v.days[0]).toEqual({ date: '2026-11-01', day: 1, weekday: '일', red: true, color: 'sun' })
    expect(v.days[2]).toMatchObject({ date: '2026-11-03', red: true, color: 'sun' })
    expect(v.days[6]).toMatchObject({ weekday: '토', red: true, color: 'sat' })
    expect(v.days[19]).toMatchObject({ date: '2026-11-20', red: false })
  })
})
