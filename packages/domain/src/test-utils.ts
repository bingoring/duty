// 테스트 전용 도우미. index.ts에서 export하지 않는다.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { RequestOption, RequestSpecial, Rotation, SeniorityTier } from './allowed-sets'
import { addDays, type IsoDate } from './dates'
import { DEFAULT_RULES, type RuleSet } from './rules-defaults'
import type { GridCell, HolidayDay, NurseProfile, RequestEntry, ScheduleInput } from './types'

// 칸 토큰: D E N S, O=OFF regular, SO=sleeping, EC=보수교육, EU=노조교육, SP=특휴, FO=개원오프,
// A=연차, L=병가, LF=경조, LO=공가, '-'=칸 없음. 뒤에 '+'를 붙이면 검진 반차.
const TOKENS: Record<string, Omit<GridCell, 'userId' | 'date' | 'checkupHalf'>> = {
  D: { code: 'D' },
  E: { code: 'E' },
  N: { code: 'N' },
  S: { code: 'S' },
  O: { code: 'OFF', offKind: 'regular' },
  SO: { code: 'OFF', offKind: 'sleeping' },
  EC: { code: 'OFF', offKind: 'edu_cont' },
  EU: { code: 'OFF', offKind: 'edu_union' },
  SP: { code: 'OFF', offKind: 'special' },
  FO: { code: 'OFF', offKind: 'founding' },
  A: { code: 'AL' },
  L: { code: 'LEAVE', leaveKind: 'sick' },
  LF: { code: 'LEAVE', leaveKind: 'family' },
  LO: { code: 'LEAVE', leaveKind: 'official' },
}

export function row(userId: string, start: IsoDate, spec: string): GridCell[] {
  const out: GridCell[] = []
  spec
    .trim()
    .split(/\s+/)
    .forEach((raw, i) => {
      if (raw === '-') return
      const checkupHalf = raw.endsWith('+')
      const t = TOKENS[checkupHalf ? raw.slice(0, -1) : raw]
      if (!t) throw new Error(`알 수 없는 토큰: ${raw}`)
      out.push({ userId, date: addDays(start, i), checkupHalf, ...t })
    })
  return out
}

export function nurse(id: string, over: Partial<NurseProfile> = {}): NurseProfile {
  return {
    id,
    rotation: 'rotating',
    seniorityTier: 'senior',
    kTass: true,
    unionMember: false,
    employedFrom: null,
    employedUntil: null,
    nightDedicated: null,
    offCarryBefore: 0,
    nightBankBefore: 0,
    weekendPairMissedLastMonth: false,
    ...over,
  }
}

export function req(
  userId: string,
  date: IsoDate,
  options: RequestOption[],
  special?: RequestSpecial,
): RequestEntry {
  return special ? { userId, date, options: [], special } : { userId, date, options }
}

export function input(over: Partial<ScheduleInput> & { rules?: RuleSet } = {}): ScheduleInput {
  return {
    year: 2026,
    month: 10,
    rules: DEFAULT_RULES,
    nurses: [],
    trainings: [],
    holidays: [],
    cells: [],
    prevTail: [],
    requests: [],
    ...over,
  }
}

export function rules(
  params: Partial<RuleSet['params']> = {},
  toggles: Partial<RuleSet['toggles']> = {},
): RuleSet {
  return {
    ...DEFAULT_RULES,
    params: { ...DEFAULT_RULES.params, ...params },
    toggles: { ...DEFAULT_RULES.toggles, ...toggles },
  }
}

type PaperNurse = {
  employeeNo: string
  name: string
  rotation: Rotation
  seniorityTier: SeniorityTier
  kTass: boolean
  unionMember: boolean
  offCarryBefore: number
  nightBankBefore: number
  paperOffCarryAfter: number
  row: string
}

type PaperDoc = { year: number; month: number; holidays: HolidayDay[]; nurses: PaperNurse[] }

// 종이 근무표 2026-10(가명). 슬리핑오프는 종이에서 구분되지 않으므로 floor((이월N + 그달N)/6)개를 앞쪽 OFF부터 표시한다.
export function loadPaper() {
  const path = fileURLToPath(new URL('../../../fixtures/paper-2026-10.json', import.meta.url))
  const doc = JSON.parse(readFileSync(path, 'utf8')) as PaperDoc
  const start = `${doc.year}-${String(doc.month).padStart(2, '0')}-01`
  const cells: GridCell[] = []
  for (const p of doc.nurses) {
    const tokens = p.row.split(' ')
    const nights = tokens.filter((t) => t === 'N').length
    let sleeping = Math.floor((p.nightBankBefore + nights) / 6)
    const spec = tokens.map((t) => (t === 'O' && sleeping-- > 0 ? 'SO' : t)).join(' ')
    cells.push(...row(p.employeeNo, start, spec))
  }
  const nurses = doc.nurses.map((p) =>
    nurse(p.employeeNo, {
      rotation: p.rotation,
      seniorityTier: p.seniorityTier,
      kTass: p.kTass,
      unionMember: p.unionMember,
      offCarryBefore: p.offCarryBefore,
      nightBankBefore: p.nightBankBefore,
    }),
  )
  return {
    input: input({ year: doc.year, month: doc.month, holidays: doc.holidays, nurses, cells }),
    names: new Map(doc.nurses.map((p) => [p.employeeNo, p.name])),
    paperOffCarryAfter: new Map(doc.nurses.map((p) => [p.employeeNo, p.paperOffCarryAfter])),
    rows: doc.nurses,
  }
}
