import type { TraineeKind } from './allowed-sets'
import { addDays, daysInMonth, isEmployed, isoOf, type IsoDate } from './dates'
import type { Grid } from './grid'
import type { RuleParams } from './rules-defaults'
import type { DutyCode, NurseProfile, ScheduleInput, TrainingSpan } from './types'

export type StaffCount = {
  // 교대 근무자 중 3인 근무 신규를 뺀 인원 (R-STAFF-1)
  count: number
  // 그중 K-tass 보유자, 트레이닝 중 신규 제외 (R-STAFF-2)
  kTass: number
  // 수간호사 보충 (R-STAFF-4)
  fallback: number
  fallbackKTass: number
  allJunior: boolean
  members: string[]
}

export type Staffing = {
  count(date: IsoDate, duty: DutyCode): StaffCount
  inTraining(nurseId: string, date: IsoDate): TrainingSpan | undefined
}

// R-STAFF-6: 시작일 포함 7 × 주 수 일
export function defaultTripleStaffUntil(start: IsoDate, kind: TraineeKind, params: RuleParams): IsoDate {
  const weeks = kind === 'new_grad' ? params.newbieTripleWeeks : params.experiencedTripleWeeks
  return addDays(start, 7 * weeks - 1)
}

// 응급실 지침 §6: 트레이닝 기본 종료일 = 시작일 + trainingMonths개월 − 1일 (없는 날짜는 말일로)
export function defaultTrainingEnd(start: IsoDate, params: RuleParams): IsoDate {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number]
  const total = m - 1 + params.trainingMonths
  const year = y + Math.floor(total / 12)
  const month = (total % 12) + 1
  return addDays(isoOf(year, month, Math.min(d, daysInMonth(year, month))), -1)
}

export function createStaffing(input: ScheduleInput, grid: Grid): Staffing {
  const { tripleNightCount } = input.rules.params
  const byTrainee = new Map<string, TrainingSpan[]>()
  for (const t of input.trainings) byTrainee.set(t.traineeId, [...(byTrainee.get(t.traineeId) ?? []), t])

  // R-STAFF-5: 기간 뒤 트레이닝 안에서 신규가 서는 N을 날짜순으로 세어 남은 개수만큼
  const tripleNights = new Set<string>()
  for (const t of input.trainings) {
    let left = Math.max(0, tripleNightCount - t.tripleNightsBefore)
    for (const d of grid.monthDates) {
      if (left === 0) break
      if (d > t.tripleStaffUntil && d <= t.endDate && grid.cellAt(t.traineeId, d)?.code === 'N') {
        tripleNights.add(`${t.traineeId}|${d}`)
        left--
      }
    }
  }

  const inTraining = (id: string, d: IsoDate) =>
    byTrainee.get(id)?.find((t) => t.startDate <= d && d <= t.endDate)
  const isTriple = (id: string, d: IsoDate, duty: DutyCode) => {
    const t = inTraining(id, d)
    if (!t) return false
    return d <= t.tripleStaffUntil || (duty === 'N' && tripleNights.has(`${id}|${d}`))
  }
  const on = (n: NurseProfile, d: IsoDate, duty: DutyCode) =>
    isEmployed(n, d) && grid.cellAt(n.id, d)?.code === duty

  return {
    inTraining,
    count(date, duty) {
      const members = input.nurses.filter(
        (n) => n.rotation === 'rotating' && on(n, date, duty) && !isTriple(n.id, date, duty),
      )
      const heads = input.nurses.filter((n) => n.rotation === 'fixed_weekday' && on(n, date, duty))
      const all = [...members, ...heads]
      return {
        count: members.length,
        kTass: members.filter((n) => n.kTass && !inTraining(n.id, date)).length,
        fallback: heads.length,
        fallbackKTass: heads.filter((n) => n.kTass).length,
        allJunior: all.length > 0 && all.every((n) => n.seniorityTier === 'junior'),
        members: members.map((n) => n.id),
      }
    },
  }
}
