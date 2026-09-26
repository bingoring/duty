import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import {
  checkSchedule,
  reverseEntries,
  settleMonth,
  type GridCell,
  type RequestEntry,
  type ScheduleInput,
} from './index'
import { input, loadPaper, nurse, req, row } from './test-utils'

// 고정 시드 PRNG (mulberry32)
function prng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TOKENS = [
  'D',
  'D',
  'E',
  'E',
  'N',
  'N',
  'O',
  'O',
  'O',
  'S',
  'SO',
  'EC',
  'EU',
  'SP',
  'FO',
  'A',
  'L',
  'D+',
]

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function randomInput(seed: number): ScheduleInput {
  const rnd = prng(seed)
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!
  const tiers = ['senior', 'mid', 'junior'] as const
  const nurses = Array.from({ length: 11 }, (_, i) =>
    nurse(`n${i}`, {
      rotation: i === 0 ? 'fixed_weekday' : 'rotating',
      seniorityTier: pick(tiers),
      kTass: rnd() < 0.6,
      unionMember: rnd() < 0.4,
      nightBankBefore: Math.floor(rnd() * 6),
      offCarryBefore: Math.floor(rnd() * 7) - 3,
      weekendPairMissedLastMonth: rnd() < 0.3,
    }),
  )
  const spec = (n: number) => Array.from({ length: n }, () => (rnd() < 0.05 ? '-' : pick(TOKENS))).join(' ')
  const cells: GridCell[] = []
  const prevTail: GridCell[] = []
  const requests: RequestEntry[] = []
  for (const n of nurses) {
    cells.push(...row(n.id, '2026-10-01', spec(31)))
    prevTail.push(...row(n.id, '2026-09-16', spec(15)))
    for (let k = 0; k < 3; k++) {
      const date = addDays('2026-10-01', Math.floor(rnd() * 31))
      if (requests.some((r) => r.userId === n.id && r.date === date)) continue
      requests.push(
        rnd() < 0.3
          ? req(n.id, date, [], pick(['AL', 'EDU_CONT', 'EDU_UNION'] as const))
          : req(n.id, date, ['OFF', 'D']),
      )
    }
  }
  const trainings = [
    {
      traineeId: 'n10',
      preceptorId: 'n3',
      kind: 'new_grad' as const,
      startDate: '2026-09-20',
      endDate: '2026-12-19',
      tripleStaffUntil: '2026-10-10',
      tripleNightsBefore: 0,
    },
  ]
  return input({
    nurses,
    cells,
    prevTail,
    requests,
    trainings,
    holidays: [{ date: '2026-10-09', kind: 'public' }],
  })
}

describe('무작위 격자 속성 (고정 시드 200개)', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i + 1)

  it('예외 없이 검사하고, 입력 순서를 섞어도 결과가 같다 (INV1·INV5)', () => {
    for (const seed of seeds) {
      const inp = randomInput(seed)
      const rnd = prng(seed * 7)
      const shuffled = {
        ...inp,
        nurses: shuffle(inp.nurses, rnd),
        cells: shuffle(inp.cells, rnd),
        prevTail: shuffle(inp.prevTail, rnd),
        requests: shuffle(inp.requests, rnd),
      }
      expect(checkSchedule(shuffled), `seed ${seed}`).toEqual(checkSchedule(inp))
    }
  })

  it('정산 증감과 역분개의 계정별 합은 0이다 (INV4)', () => {
    for (const seed of seeds.slice(0, 50)) {
      const inp = randomInput(seed)
      for (const n of inp.nurses) {
        const cells = inp.cells.filter((c) => c.userId === n.id)
        const s = settleMonth({
          nurse: n,
          year: 2026,
          month: 10,
          cells,
          holidays: inp.holidays,
          sleepingOffPerN: 6,
        })
        const sums = new Map<string, number>()
        for (const e of [...s.entries, ...reverseEntries(s.entries)])
          sums.set(e.account, (sums.get(e.account) ?? 0) + e.delta)
        expect([...sums.values()].every((v) => v === 0)).toBe(true)
      }
    }
  })
})

describe('NFR', () => {
  it('11×31 격자 검사 100회 평균 < 5ms (브라우저 목표 50ms의 여유)', () => {
    const { input: paper } = loadPaper()
    checkSchedule(paper) // 워밍업
    const t0 = performance.now()
    for (let i = 0; i < 100; i++) checkSchedule(paper)
    expect((performance.now() - t0) / 100).toBeLessThan(5)
  })

  it('브라우저 번들용 소스는 node:* 모듈을 import하지 않는다', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('test-utils.ts'),
    )
    expect(files.length).toBeGreaterThan(10)
    for (const f of files) expect(readFileSync(dir + f, 'utf8'), f).not.toMatch(/from ['"]node:/)
  })
})
