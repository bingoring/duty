// Build Spec 3-1 「이력 가져오기」 — 종이 근무표(엑셀)에서 만든 묶음(JSON)을 빈 운영 DB에 넣는다.
// 묶음은 deploy/history/excel_to_bundle.py가 만든다(실명이 들어 있어 .local/에만 둔다).
// - 사람·자격 증명(초기 비밀번호, 첫 로그인 때 변경 강제)
// - 마지막 달 = 확정(CONFIRMED), 그 앞 달 = 마감(CLOSED): 마감 스냅샷과 원장은 **엑셀 값이 기준**(DECISIONS 2026-10-09)
// - 원장 = 첫 달 초기 입력 + 달마다 마감 항목 → 합계가 마지막 달 월초(이월) 값이 된다
import {
  addDays,
  monthDates,
  defaultPlanDates,
  DEFAULT_RULES,
  settleMonth,
  type GridCell,
  type HolidayDay,
  type NurseProfile,
} from '@duty/domain'
import { hashPassword } from '../auth/password'
import type { Db } from '../db/client'
import {
  balanceEntries,
  credentials,
  holidays,
  monthPlans,
  monthSettlements,
  scheduleCells,
  users,
} from '../db/schema'
import { ensureBase } from './core'

export type HistoryCell = {
  date: string
  code: 'D' | 'E' | 'N' | 'S' | 'OFF' | 'LEAVE' | 'AL'
  offKind?: string
  leaveKind?: string
  checkupHalf?: boolean
  source: 'auto' | 'requested'
}
export type HistoryRow = {
  employeeNo: string
  offCarryBefore: number
  nightBankBefore: number
  offCarryAfter: number
  // 진행 중인 달은 종이에 ⓡN이 없다(null) → 슬리핑오프는 종이 관례 floor((이월N + 그달 N) ÷ 기준)
  nightBankAfter: number | null
  specialAfter: number | null
  foundingAfter: number | null
  checkupAfter: number | null
  eduContAfter: number | null
  cells: HistoryCell[]
}
export type HistoryPerson = {
  employeeNo: string
  name: string
  role: 'admin' | 'nurse'
  rotation: 'rotating' | 'fixed_weekday'
  seniorityRank: number
  seniorityTier: 'senior' | 'mid' | 'junior'
  hireDate: string | null
  kTass: boolean
  unionMember: boolean
  deactivatedOn: string | null
  initialPassword: string
}
export type HistoryBundle = {
  year: number
  people: HistoryPerson[]
  months: { month: number; rows: HistoryRow[] }[]
}

export type HistoryReport = {
  users: number
  active: number
  plans: { closed: number; confirmed: number }
  cells: number
  // 달 사이 이월 수기 조정을 맞춘 원장 항목 수
  adjustments: number
  // 앱 규칙으로 다시 계산한 값과 엑셀 값이 다른 곳(사번 단위, 엑셀 값을 기록함)
  diffs: string[]
  warnings: string[]
}

const kst = (date: string) => new Date(`${date}T00:00:00+09:00`)
const round1 = (n: number) => Math.round(n * 10) / 10

class DryRun extends Error {}

export async function importHistory(db: Db, bundle: HistoryBundle, opts: { dryRun?: boolean } = {}) {
  let report: HistoryReport | undefined
  try {
    await db.transaction(async (tx) => {
      report = await run(tx as unknown as Db, bundle)
      if (opts.dryRun) throw new DryRun()
    })
  } catch (e) {
    if (!(e instanceof DryRun)) throw e
  }
  return report!
}

async function run(db: Db, b: HistoryBundle): Promise<HistoryReport> {
  if ((await db.$count(users)) > 0)
    throw new Error('사용자가 이미 있는 DB에는 가져오지 않습니다(빈 운영 DB 전용).')
  const per = DEFAULT_RULES.params.sleepingOffPerN
  const wardId = await ensureBase(db)
  const hol: HolidayDay[] = (
    await db.select({ date: holidays.date, kind: holidays.kind }).from(holidays)
  ).map((h) => ({ date: h.date, kind: h.kind as HolidayDay['kind'] }))
  const report: HistoryReport = {
    users: 0,
    active: 0,
    plans: { closed: 0, confirmed: 0 },
    cells: 0,
    adjustments: 0,
    diffs: [],
    warnings: [],
  }

  // 1) 사람
  const idOf = new Map<string, string>()
  const person = new Map(b.people.map((p) => [p.employeeNo, p]))
  for (const p of b.people) {
    const [u] = await db
      .insert(users)
      .values({
        wardId,
        employeeNo: p.employeeNo,
        name: p.name,
        role: p.role,
        rotation: p.rotation,
        seniorityRank: p.seniorityRank,
        seniorityTier: p.seniorityTier,
        hireDate: p.hireDate,
        kTass: p.kTass,
        unionMember: p.unionMember,
        active: p.deactivatedOn === null,
        deactivatedAt: p.deactivatedOn ? kst(p.deactivatedOn) : null,
      })
      .returning({ id: users.id })
    idOf.set(p.employeeNo, u!.id)
    await db.insert(credentials).values({
      userId: u!.id,
      passwordHash: await hashPassword(p.initialPassword),
      mustChangePassword: true,
    })
    report.users++
    if (p.deactivatedOn === null) report.active++
  }
  const adminId = b.people.find((p) => p.role === 'admin' && p.deactivatedOn === null)?.employeeNo
  const admin = adminId ? idOf.get(adminId)! : null

  // 2) 달
  const months = [...b.months].sort((a, c) => a.month - c.month)
  const last = months.at(-1)!.month
  const prev = new Map<
    string,
    { special: number | null; founding: number | null; checkup: number | null; edu: number | null }
  >()
  const started = new Set<string>()
  const carried = new Map<string, { off: number; n: number }>()
  for (const [mi, m] of months.entries()) {
    const days = monthDates(b.year, m.month)
    const start = days[0]!
    const closed = m.month !== last
    const closedAt = new Date(kst(addDays(days.at(-1)!, 1)).getTime() - 1000) // 다음 달 1일 직전
    const [plan] = await db
      .insert(monthPlans)
      .values({
        wardId,
        year: b.year,
        month: m.month,
        status: closed ? 'CLOSED' : 'CONFIRMED',
        ...defaultPlanDates(b.year, m.month, DEFAULT_RULES.params),
        ruleVersion: 1,
        confirmedBy: admin,
        confirmedAt: kst(start),
        closedBy: closed ? admin : null,
        closedAt: closed ? closedAt : null,
      })
      .returning({ id: monthPlans.id })
    if (closed) report.plans.closed++
    else report.plans.confirmed++
    const nextRows = new Map((months[mi + 1]?.rows ?? []).map((r) => [r.employeeNo, r]))

    for (const r of m.rows) {
      const userId = idOf.get(r.employeeNo)
      const p = person.get(r.employeeNo)
      if (!userId || !p) {
        report.warnings.push(`${m.month}월 ${r.employeeNo}: 명단에 없는 사번이라 건너뜀`)
        continue
      }
      // 슬리핑오프: 종이에는 표시가 없어 (이월N + 그달 N − ⓡN) ÷ 기준을 N 뒤의 OFF부터 표시한다
      const cells = r.cells.map((c) => ({ ...c }))
      const nights = cells.filter((c) => c.code === 'N').length
      const sleeping =
        r.nightBankAfter === null
          ? Math.floor((r.nightBankBefore + nights) / per)
          : (r.nightBankBefore + nights - r.nightBankAfter) / per
      if (p.rotation === 'rotating') {
        if (!Number.isInteger(sleeping) || sleeping < 0)
          report.warnings.push(`${m.month}월 ${r.employeeNo}: 슬리핑오프 수가 정수가 아님(${sleeping})`)
        else markSleeping(cells, sleeping)
      }

      // 종이에서 전달 말 값과 이번 달 이월이 다르면(수기 조정) 달 시작 시점 조정 항목으로 맞춘다
      const was = carried.get(r.employeeNo)
      if (was) {
        const adj: [string, number][] = (
          [
            ['off_carry', round1(r.offCarryBefore - was.off)],
            ['night_bank', r.nightBankBefore - was.n],
          ] as [string, number][]
        ).filter(([, d]) => d !== 0)
        if (adj.length) {
          await db.insert(balanceEntries).values(
            adj.map(([account, delta]) => ({
              userId,
              account,
              delta: String(delta),
              reason: 'admin_adjust',
              note: '종이 근무표 이월 조정(이력 가져오기)',
              refYear: b.year,
              createdBy: admin,
              createdAt: kst(start),
            })),
          )
          report.adjustments += adj.length
        }
      }
      carried.set(r.employeeNo, { off: r.offCarryAfter, n: r.nightBankAfter ?? r.nightBankBefore })

      // 첫 달: 초기 입력(그달 월초 잔여 = 그달 말 엑셀 값 + 그달 사용분)
      const used = usage(cells)
      if (!started.has(r.employeeNo)) {
        started.add(r.employeeNo)
        const at = kst(start < `${b.year}-01-01` ? `${b.year}-01-01` : start)
        const init: [string, number | null][] = [
          ['off_carry', r.offCarryBefore],
          ['night_bank', r.nightBankBefore],
          ['special_leave', r.specialAfter === null ? null : r.specialAfter + used.special],
          ['founding_off', r.foundingAfter === null ? null : r.foundingAfter + used.founding],
          ['checkup', r.checkupAfter === null ? null : round1(r.checkupAfter + used.checkup)],
          ['edu_cont', r.eduContAfter === null ? null : r.eduContAfter - used.edu],
          ['sick_leave', 60],
        ]
        const rows = init.filter(([, v]) => v !== null && v !== 0)
        if (rows.length)
          await db.insert(balanceEntries).values(
            rows.map(([account, delta]) => ({
              userId,
              account,
              delta: String(delta),
              reason: 'initial_input',
              refYear: b.year,
              createdBy: admin,
              createdAt: at,
            })),
          )
        prev.set(r.employeeNo, {
          special: r.specialAfter === null ? null : r.specialAfter + used.special,
          founding: r.foundingAfter === null ? null : r.foundingAfter + used.founding,
          checkup: r.checkupAfter === null ? null : round1(r.checkupAfter + used.checkup),
          edu: r.eduContAfter === null ? null : r.eduContAfter - used.edu,
        })
      }

      if (cells.length)
        await db.insert(scheduleCells).values(
          cells.map((c) => ({
            monthPlanId: plan!.id,
            userId,
            date: c.date,
            code: c.code,
            offKind: c.offKind ?? null,
            leaveKind: c.leaveKind ?? null,
            checkupHalf: c.checkupHalf ?? false,
            source: c.source,
          })),
        )
      report.cells += cells.length

      // 앱 규칙으로 다시 계산해 엑셀과 비교(보고용), 마감 스냅샷의 개수·주말 통 OFF에 쓴다
      const nextFirst = nextRows.get(r.employeeNo)?.cells.find((c) => c.date === addDays(days.at(-1)!, 1))
      const s = settleMonth({
        nurse: profileOf(userId, p, r),
        year: b.year,
        month: m.month,
        cells: cells.map((c) => grid(userId, c)),
        holidays: hol,
        sleepingOffPerN: per,
        ...(nextFirst ? { nextHead: grid(userId, nextFirst) } : {}),
      })
      if (
        s.offCarryAfter !== r.offCarryAfter ||
        (r.nightBankAfter !== null && s.nightBankAfter !== r.nightBankAfter)
      )
        report.diffs.push(
          `${m.month}월 ${r.employeeNo}: 누적off 엑셀 ${r.offCarryAfter} / 계산 ${s.offCarryAfter}, 잔여N 엑셀 ${r.nightBankAfter} / 계산 ${s.nightBankAfter}`,
        )
      if (!closed) continue

      await db.insert(monthSettlements).values({
        monthPlanId: plan!.id,
        userId,
        baselineOff: s.baselineOff,
        actualOff: s.actualOff,
        sleepingOff: s.sleepingOff,
        nightCount: s.nightCount,
        offCarryBefore: String(r.offCarryBefore),
        offCarryAfter: String(r.offCarryAfter),
        nightBankBefore: r.nightBankBefore,
        nightBankAfter: r.nightBankAfter ?? s.nightBankAfter,
        weekendPairAchieved: s.weekendPairAchieved,
        specialUsed: String(used.special),
        foundingUsed: String(used.founding),
        checkupUsed: String(used.checkup),
        eduCont: used.edu,
      })
      // 마감 원장: 이월·잔여는 엑셀 증감, 엑셀에 없는 계정(연차·병가·노조교육)은 칸으로 계산
      const before = prev.get(r.employeeNo)!
      const delta = (after: number | null, was: number | null) =>
        after === null || was === null ? null : round1(after - was)
      const entries: [string, number | null][] = [
        ['off_carry', round1(r.offCarryAfter - r.offCarryBefore)],
        ['night_bank', (r.nightBankAfter ?? s.nightBankAfter) - r.nightBankBefore],
        ['special_leave', delta(r.specialAfter, before.special)],
        ['founding_off', delta(r.foundingAfter, before.founding)],
        ['checkup', delta(r.checkupAfter, before.checkup)],
        ['edu_cont', delta(r.eduContAfter, before.edu)],
        ...s.entries
          .filter((e) => ['annual_leave', 'sick_leave', 'edu_union'].includes(e.account))
          .map((e): [string, number] => [e.account, e.delta]),
      ]
      const rows = entries.filter(([, v]) => v !== null && v !== 0)
      if (rows.length)
        await db.insert(balanceEntries).values(
          rows.map(([account, d]) => ({
            userId,
            account,
            delta: String(d),
            reason: 'month_settlement',
            refYear: b.year,
            refMonth: m.month,
            refId: plan!.id,
            createdBy: admin,
            createdAt: closedAt,
          })),
        )
      prev.set(r.employeeNo, {
        special: r.specialAfter ?? before.special,
        founding: r.foundingAfter ?? before.founding,
        checkup: r.checkupAfter ?? before.checkup,
        edu: r.eduContAfter ?? before.edu,
      })
    }
  }
  return report
}

function usage(cells: HistoryCell[]) {
  const off = (k: string) => cells.filter((c) => c.code === 'OFF' && c.offKind === k).length
  return {
    special: off('special'),
    founding: off('founding'),
    checkup: round1(0.5 * cells.filter((c) => c.checkupHalf).length),
    edu: off('edu_cont'),
  }
}

// N 바로 뒤의 일반 OFF부터, 모자라면 앞쪽 일반 OFF(신청 반영 칸은 마지막에)
function markSleeping(cells: HistoryCell[], count: number) {
  const regular = cells
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.code === 'OFF' && c.offKind === 'regular')
  const score = ({ c, i }: { c: HistoryCell; i: number }) =>
    (cells[i - 1]?.code === 'N' ? 0 : 1) * 2 + (c.source === 'requested' ? 1 : 0)
  for (const { c } of [...regular].sort((a, z) => score(a) - score(z) || a.i - z.i).slice(0, count))
    c.offKind = 'sleeping'
}

function grid(userId: string, c: HistoryCell): GridCell {
  return {
    userId,
    date: c.date,
    code: c.code,
    checkupHalf: c.checkupHalf ?? false,
    ...(c.offKind ? { offKind: c.offKind as GridCell['offKind'] } : {}),
    ...(c.leaveKind ? { leaveKind: c.leaveKind as GridCell['leaveKind'] } : {}),
  }
}

function profileOf(id: string, p: HistoryPerson, r: HistoryRow): NurseProfile {
  return {
    id,
    rotation: p.rotation,
    seniorityTier: p.seniorityTier,
    kTass: p.kTass,
    unionMember: p.unionMember,
    employedFrom: p.hireDate,
    employedUntil: p.deactivatedOn ? addDays(p.deactivatedOn, -1) : null,
    nightDedicated: null,
    offCarryBefore: r.offCarryBefore,
    nightBankBefore: r.nightBankBefore,
    weekendPairMissedStreak: 0,
    weekendPairCarryIn: false,
    shiftCountsBefore: { D: 0, E: 0, N: 0 },
    eduUsedThisYear: { cont: 0, union: 0 },
    balancesBefore: null,
  }
}
