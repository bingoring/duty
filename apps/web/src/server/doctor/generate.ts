// 3-7d S-D3 의사 듀티 생성 — 솔버 /solve/doctor → 도메인 검사기 재검사 → 생성안 저장, 리롤·±1 대상·확정(= 공개)
import { DOCTOR_CONTRACT_VERSION, DoctorSolverResponse, type DoctorSolverRequest } from '@duty/contract'
import {
  checkDoctorMonth,
  expandFixedRules,
  extraNeeded,
  formatMD,
  monthDates,
  type DoctorCheckDoctor,
  type DoctorCheckResult,
  type DoctorExtras,
  type DoctorOption,
  type DoctorShiftRow,
  type IsoDate,
} from '@duty/domain'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  doctorCandidateShifts,
  doctorCandidates,
  doctorMonthPlans,
  doctorRequests,
  doctorShifts,
} from '../db/schema'
import { solverTimeLimit, solverUrl } from '../generate/solver-client'
import {
  currentDoctorRules,
  ensureDoctorPlan,
  findDoctorPlan,
  listDoctors,
  prefsOf,
  prevLastNight,
  targetsFor,
  type Ym,
} from './core'
import type { DoctorActor } from './requests'

type Fail = { ok: false; message: string }
const fail = (message: string): Fail => ({ ok: false, message })

// 검사·솔버 입력 공통: 의사별 목표·고정 조건(그 날만 예외 제외)·신청
export async function doctorMonthInput(db: Db, ym: Ym, extras: DoctorExtras) {
  const doctors = await listDoctors(db)
  const ids = doctors.map((d) => d.id)
  const { version, params } = await currentDoctorRules(db)
  const targets = targetsFor(ym, ids, params, extras)
  const prefs = await prefsOf(db, ids)
  const days = monthDates(ym.year, ym.month)
  const reqs = await db
    .select()
    .from(doctorRequests)
    .where(and(eq(doctorRequests.year, ym.year), eq(doctorRequests.month, ym.month)))
  const check: DoctorCheckDoctor[] = doctors.map((d) => {
    const p = prefs.get(d.id)!
    const mine = reqs.filter((r) => r.userId === d.id)
    const exceptions = new Set(mine.filter((r) => r.fixedException).map((r) => r.date))
    return {
      id: d.id,
      name: d.name,
      target: targets.get(d.id)!,
      allDayMin: p.allDayMin,
      allDayMax: p.allDayMax,
      fixed: expandFixedRules(p.fixedRules, days, exceptions),
      requests: mine
        .filter((r) => r.options.length > 0)
        .map((r) => ({ date: r.date, options: r.options as DoctorOption[] })),
    }
  })
  return { doctors, check, days, version, params, prevNight: await prevLastNight(db, ym) }
}

export function toDoctorSolverRequest(
  a: { check: DoctorCheckDoctor[]; days: IsoDate[]; prevNight: string | null },
  seed: number,
  timeLimitSec: number,
): DoctorSolverRequest {
  return {
    contractVersion: DOCTOR_CONTRACT_VERSION,
    seed,
    timeLimitSec,
    days: a.days,
    doctors: a.check.map((d) => ({
      id: d.id,
      dCount: d.target.D,
      nCount: d.target.N,
      allDayMin: d.allDayMin,
      allDayMax: d.allDayMax,
      fixed: d.fixed.map((f) => ({ date: f.date, shift: f.shift, type: f.type })),
      requests: (d.requests ?? []).map((r) => ({ date: r.date, options: [...r.options] })),
    })),
    prevLastNight: a.prevNight,
  }
}

export async function callDoctorSolver(req: DoctorSolverRequest, url = solverUrl()) {
  try {
    const r = await fetch(`${url}/solve/doctor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout((req.timeLimitSec * 3 + 15) * 1000),
    })
    if (!r.ok) return { kind: 'unreachable' as const, error: `HTTP ${r.status}` }
    const parsed = DoctorSolverResponse.safeParse(await r.json())
    if (!parsed.success) return { kind: 'unreachable' as const, error: '계약 불일치' }
    return { kind: 'ok' as const, res: parsed.data }
  } catch (e) {
    return { kind: 'unreachable' as const, error: e instanceof Error ? e.message : String(e) }
  }
}

export type GenerateResult = { ok: true; candidateId: string; generationNo: number } | Fail

export async function generateDoctorCandidate(
  db: Db,
  actor: DoctorActor,
  ym: Ym,
  opts: { seed?: number; timeLimitSec?: number } = {},
): Promise<GenerateResult> {
  if (actor.role !== 'admin') return fail('권한이 없습니다.')
  const plan = await ensureDoctorPlan(db, ym)
  if (plan.status === 'CONFIRMED') return fail('이미 확정된 달입니다.')
  const input = await doctorMonthInput(db, ym, plan.extras)
  if (input.doctors.length === 0) return fail('의사가 없습니다. 의사 관리에서 먼저 추가해 주세요.')
  const need = extraNeeded(ym.year, ym.month, input.doctors.length, input.params)
  if (Math.abs(need.D) !== plan.extras.D.length || Math.abs(need.N) !== plan.extras.N.length)
    return fail(
      Math.abs(need.D) > input.doctors.length || Math.abs(need.N) > input.doctors.length
        ? `의사 ${input.doctors.length}명으로는 ${input.days.length}일을 의사별 D ${input.params.dPerMonth}·N ${input.params.nPerMonth}로 채울 수 없습니다. 규칙 설정에서 개수를 바꿔 주세요.`
        : `±1 대상을 D ${Math.abs(need.D)}명·N ${Math.abs(need.N)}명 골라 주세요.`,
    )
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31)
  const out = await callDoctorSolver(
    toDoctorSolverRequest(input, seed, opts.timeLimitSec ?? Math.min(10, solverTimeLimit())),
  )
  if (out.kind === 'unreachable') return fail(`솔버에 연결할 수 없습니다 (${out.error}).`)
  const res = out.res
  if (res.status === 'UNKNOWN') return fail('시간 안에 근무표를 찾지 못했습니다. 다시 시도해 주세요.')
  if (res.status === 'INFEASIBLE') {
    const name = new Map(input.doctors.map((d) => [d.id, d.name]))
    const fixed = res.causes.filter((c) => c.kind === 'FIXED')
    return fail(
      fixed.length
        ? `고정 조건이 서로 부딪혀 근무표를 만들 수 없습니다: ${fixed
            .map((c) => `${name.get(c.userId ?? '') ?? '?'} ${c.date ? formatMD(c.date) : ''}`)
            .join(', ')}`
        : '개수·고정 조건을 모두 지키는 근무표가 없습니다. 고정 조건이나 ±1 대상을 확인해 주세요.',
    )
  }
  const shifts: DoctorShiftRow[] = res.shifts.map((s) => ({ date: s.date, day: s.day, night: s.night }))
  const check = checkDoctorMonth({
    year: ym.year,
    month: ym.month,
    doctors: input.check,
    shifts,
    mode: 'generate',
    prevLastNight: input.prevNight,
  })
  // 솔버의 하드 제약 = 검사기의 하드 규칙. 어긋나면 저장하지 않는다
  if (check.hard.length) return fail(`재검사에서 필수 규칙 위반이 나왔습니다: ${check.hard[0]!.message}`)
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select 1 from ${doctorMonthPlans} where ${doctorMonthPlans.id} = ${plan.id} for update`,
    )
    const [last] = await tx
      .select({ n: doctorCandidates.generationNo })
      .from(doctorCandidates)
      .where(eq(doctorCandidates.planId, plan.id))
      .orderBy(desc(doctorCandidates.generationNo))
      .limit(1)
    const generationNo = (last?.n ?? 0) + 1
    const [c] = await tx
      .insert(doctorCandidates)
      .values({
        planId: plan.id,
        generationNo,
        seed,
        ruleVersion: input.version,
        checkResult: check,
        solverMeta: { status: res.status, objective: res.objective, wallTimeSec: res.wallTimeSec },
        createdBy: actor.id,
      })
      .returning({ id: doctorCandidates.id })
    await tx
      .insert(doctorCandidateShifts)
      .values(shifts.map((s) => ({ candidateId: c!.id, date: s.date, dayUser: s.day!, nightUser: s.night! })))
    await tx
      .update(doctorMonthPlans)
      .set({ status: 'DRAFTING', ruleVersion: input.version })
      .where(and(eq(doctorMonthPlans.id, plan.id), sql`${doctorMonthPlans.status} <> 'CONFIRMED'`))
    return { ok: true as const, candidateId: c!.id, generationNo }
  })
}

export async function candidateShifts(db: Db, candidateId: string): Promise<DoctorShiftRow[]> {
  const rows = await db
    .select()
    .from(doctorCandidateShifts)
    .where(eq(doctorCandidateShifts.candidateId, candidateId))
    .orderBy(asc(doctorCandidateShifts.date))
  return rows.map((r) => ({ date: r.date, day: r.dayUser, night: r.nightUser }))
}

// 「이 안으로 확정」 = 공개(조정 마감 전이면 조기 배포). 안의 칸을 그대로 확정 근무표로 복사한다
export async function confirmDoctorCandidate(
  db: Db,
  actor: DoctorActor,
  candidateId: string,
): Promise<{ ok: true } | Fail> {
  if (actor.role !== 'admin') return fail('권한이 없습니다.')
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(doctorCandidates).where(eq(doctorCandidates.id, candidateId))
    if (!c) return fail('생성안을 찾을 수 없습니다.')
    const [plan] = await tx
      .select()
      .from(doctorMonthPlans)
      .where(eq(doctorMonthPlans.id, c.planId))
      .for('update')
    if (!plan || plan.status === 'CONFIRMED') return fail('이미 확정된 달입니다.')
    if ((c.checkResult as DoctorCheckResult).hard.length)
      return fail('필수 규칙 위반이 있는 안은 확정할 수 없습니다.')
    const rows = await tx
      .select()
      .from(doctorCandidateShifts)
      .where(eq(doctorCandidateShifts.candidateId, c.id))
    await tx.delete(doctorShifts).where(eq(doctorShifts.planId, plan.id))
    await tx.insert(doctorShifts).values(
      rows.map((r) => ({
        planId: plan.id,
        date: r.date,
        dayUser: r.dayUser,
        nightUser: r.nightUser,
        source: 'generated',
      })),
    )
    await tx
      .update(doctorMonthPlans)
      .set({
        status: 'CONFIRMED',
        confirmedCandidateId: c.id,
        confirmedBy: actor.id,
        confirmedAt: new Date(),
      })
      .where(eq(doctorMonthPlans.id, plan.id))
    return { ok: true as const }
  })
}

export async function setDoctorExtras(
  db: Db,
  actor: DoctorActor,
  ym: Ym,
  extras: DoctorExtras,
): Promise<{ ok: true } | Fail> {
  if (actor.role !== 'admin') return fail('권한이 없습니다.')
  const plan = await ensureDoctorPlan(db, ym)
  if (plan.status === 'CONFIRMED') return fail('이미 확정된 달입니다.')
  const ids = new Set((await listDoctors(db)).map((d) => d.id))
  const { params } = await currentDoctorRules(db)
  const need = extraNeeded(ym.year, ym.month, ids.size, params)
  const ok = (list: string[], n: number) =>
    list.length === Math.abs(n) && new Set(list).size === list.length && list.every((id) => ids.has(id))
  if (!ok(extras.D, need.D) || !ok(extras.N, need.N))
    return fail(`D ${Math.abs(need.D)}명·N ${Math.abs(need.N)}명을 서로 다르게 골라 주세요.`)
  await db.update(doctorMonthPlans).set({ extras }).where(eq(doctorMonthPlans.id, plan.id))
  return { ok: true }
}

export type DoctorGenerateView = Awaited<ReturnType<typeof loadDoctorGenerate>>

export async function loadDoctorGenerate(db: Db, ym: Ym, candidateId?: string | null) {
  const plan = await ensureDoctorPlan(db, ym)
  const input = await doctorMonthInput(db, ym, plan.extras)
  const cands = await db
    .select()
    .from(doctorCandidates)
    .where(eq(doctorCandidates.planId, plan.id))
    .orderBy(desc(doctorCandidates.generationNo))
  const picked =
    cands.find((c) => c.id === candidateId) ??
    (plan.confirmedCandidateId ? cands.find((c) => c.id === plan.confirmedCandidateId) : undefined) ??
    cands[0] ??
    null
  const shifts = picked ? await candidateShifts(db, picked.id) : []
  // 저장된 결과가 아니라 지금 조건으로 다시 검사한다(생성 뒤 조건이 바뀌었을 수 있다)
  const check = picked
    ? checkDoctorMonth({
        ...ym,
        doctors: input.check,
        shifts,
        mode: 'generate',
        prevLastNight: input.prevNight,
      })
    : null
  const need = extraNeeded(ym.year, ym.month, input.doctors.length, input.params)
  const requestCount = input.check.reduce((s, d) => s + (d.requests?.length ?? 0), 0)
  const fixedCount = input.check.reduce((s, d) => s + d.fixed.length, 0)
  return {
    plan: (await findDoctorPlan(db, ym))!,
    doctors: input.doctors,
    check: input.check,
    params: input.params,
    need,
    candidates: cands.map((c) => ({ id: c.id, generationNo: c.generationNo, createdAt: c.createdAt })),
    picked: picked ? { id: picked.id, generationNo: picked.generationNo, shifts, check: check! } : null,
    requestCount,
    fixedCount,
  }
}
