'use client'

// 3-7d S-D3 우측 「{월} 듀티 생성」 카드 · 검사 결과 · 조기 배포 + 좌측 생성안 달력
import { formatMD, type DoctorCheckResult, type DoctorExtras, type DoctorRuleParams } from '@duty/domain'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { btnPrimary, btnSecondary } from '@/components/admin/ui'
import { confirmDoctorAction, generateDoctorAction, setDoctorExtrasAction } from '@/server/doctor/actions'
import type { DoctorCalendar } from '@/server/doctor/view'
import { DoctorCalendarGrid, DoctorSidePanel } from './DoctorCalendar'

type Props = {
  ym: { year: number; month: number }
  today: string
  plan: {
    status: string
    negotiationEnd: string
    extras: DoctorExtras
    confirmedCandidateId: string | null
    confirmedAt: string | null
  }
  doctors: { id: string; name: string }[]
  params: DoctorRuleParams
  need: { D: number; N: number }
  candidates: { id: string; generationNo: number }[]
  picked: { id: string; generationNo: number; check: DoctorCheckResult } | null
  calendar: DoctorCalendar | null
  requestCount: number
  fixedCount: number
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-primary' : warn ? 'bg-warn-dot' : 'bg-danger'}`}
    />
  )
}

export function DoctorGenerateScreen(p: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const ymQ = `${p.ym.year}-${String(p.ym.month).padStart(2, '0')}`
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [extras, setExtras] = useState<DoctorExtras>(p.plan.extras)
  const confirmed = p.plan.status === 'CONFIRMED'
  const sign = (n: number) => (n > 0 ? '+1' : '−1')

  const run = (f: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    start(async () => {
      const r = await f()
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.message ?? '실패했습니다.' })
    })

  const changeExtra = (slot: 'D' | 'N', i: number, id: string) => {
    const next = { ...extras, [slot]: extras[slot].map((x, j) => (j === i ? id : x)) }
    setExtras(next)
    run(() => setDoctorExtrasAction({ ...p.ym, extras: next }), '±1 대상을 바꿨습니다. 다시 생성해 주세요.')
  }

  const c = p.picked?.check
  const has = (rule: string, list: 'hard' | 'soft' = 'hard') =>
    c ? c[list].filter((v) => v.rule === rule) : []
  const early = !confirmed && p.today < p.plan.negotiationEnd

  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {p.candidates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-ink-2">생성안</span>
            {p.candidates.map((x) => (
              <Link
                key={x.id}
                href={`?ym=${ymQ}&c=${x.id}`}
                aria-current={p.picked?.id === x.id ? 'true' : undefined}
                className={`rounded-full border px-2.5 py-[3px] font-semibold ${
                  p.picked?.id === x.id ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2'
                }`}
              >
                안 {x.generationNo}
                {p.plan.confirmedCandidateId === x.id ? ' · 확정' : ''}
              </Link>
            ))}
          </div>
        )}
        {p.calendar ? (
          <DoctorCalendarGrid month={p.ym.month} weeks={p.calendar.weeks} viewerId={null} />
        ) : (
          <div className="rounded-card border border-line bg-surface px-6 py-16 text-center text-sm text-ink-2">
            아직 생성안이 없습니다. 오른쪽 「생성」을 눌러 주세요.
          </div>
        )}
      </div>

      <aside className="flex w-[360px] shrink-0 flex-col gap-3 text-[13px]">
        <section className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4">
          <h2 className="text-[15px] font-bold">{p.ym.month}월 듀티 생성</h2>
          <ul className="flex flex-col gap-1.5 text-ink-2">
            <li>
              의사별 D/N{' '}
              <b className="text-ink">
                {p.params.dPerMonth}/{p.params.nPerMonth}
              </b>
            </li>
            {(['D', 'N'] as const).map((slot) =>
              extras[slot].length === 0 ? null : (
                <li key={slot} className="flex flex-wrap items-center gap-1.5">
                  {slot} {sign(p.need[slot])} 대상(순환)
                  {extras[slot].map((id, i) => (
                    <select
                      key={i}
                      aria-label={`${slot} ${sign(p.need[slot])} 대상 ${i + 1}`}
                      value={id}
                      disabled={confirmed || pending}
                      onChange={(e) => changeExtra(slot, i, e.target.value)}
                      className="h-7 rounded-md border border-line bg-surface px-1.5 text-[12.5px] font-semibold text-ink"
                    >
                      {p.doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ))}
                </li>
              ),
            )}
            <li>연속 휴무 제한 없음 · 연차 없음</li>
            <li>N-O-D · 올데이-O-D 허용</li>
            <li>개인 올데이 범위·고정 조건 반영 · 신청 {p.requestCount}건</li>
          </ul>
          {!confirmed && (
            <div className="flex gap-2">
              <button
                type="button"
                className={btnSecondary}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await generateDoctorAction(p.ym)
                    if (!r.ok) return setMsg({ ok: false, text: r.message })
                    setMsg({ ok: true, text: `안 ${r.generationNo}을 만들었습니다.` })
                    router.replace(`?ym=${ymQ}&c=${r.candidateId}`)
                  })
                }
              >
                {pending ? '생성 중…' : p.candidates.length ? '↻ 리롤' : '생성'}
              </button>
              <button
                type="button"
                className={`${btnPrimary} flex-1`}
                disabled={pending || !p.picked || (c?.hard.length ?? 0) > 0}
                onClick={() =>
                  p.picked &&
                  run(() => confirmDoctorAction(p.picked!.id), '확정했습니다. 의사·간호사에게 공개됩니다.')
                }
              >
                이 안으로 확정
              </button>
            </div>
          )}
          {confirmed && (
            <p className="rounded-lg bg-primary-soft px-3 py-2 font-semibold text-primary">
              확정 · 공개됨{p.plan.confirmedAt ? ` (${formatMD(p.plan.confirmedAt.slice(0, 10))})` : ''} —
              바꿀 일은 근무 조정에서
            </p>
          )}
          {msg && (
            <p role="status" className={msg.ok ? 'text-primary' : 'text-danger'}>
              {msg.text}
            </p>
          )}
        </section>

        {c && (
          <section
            aria-label="검사 결과"
            className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
          >
            <h2 className="text-sm font-bold">검사 결과 · 안 {p.picked!.generationNo}</h2>
            <Row ok={has('DAILY').length === 0} text="매일 D1·N1" />
            <Row
              ok={has('COUNT').length === 0}
              text={`전원 D·N 목표 개수 (${p.params.dPerMonth}/${p.params.nPerMonth}, ±1 대상 포함)`}
            />
            <Row
              ok={has('FIXED').length === 0}
              text={
                has('FIXED').length
                  ? `고정 조건 위반 ${has('FIXED').length}건`
                  : `고정 조건 반영 ${p.fixedCount}회`
              }
            />
            <Row
              ok={has('ALLDAY_RANGE', 'soft').length === 0}
              warn
              text={
                has('ALLDAY_RANGE', 'soft').length
                  ? `올데이 선호 미충족 ${has('ALLDAY_RANGE', 'soft').length}명`
                  : '올데이 선호 범위 충족'
              }
            />
            <Row
              ok={has('REQUEST', 'soft').length === 0}
              warn
              text={
                has('REQUEST', 'soft').length
                  ? `신청 미반영 ${has('REQUEST', 'soft').length}건 / ${p.requestCount}건`
                  : `신청 ${p.requestCount}건 모두 반영`
              }
            />
            <Row
              ok={has('NIGHT_TO_DAY', 'soft').length === 0}
              warn
              text={
                has('NIGHT_TO_DAY', 'soft').length
                  ? `Night 다음 날 Day ${has('NIGHT_TO_DAY', 'soft').length}회`
                  : 'Night 다음 날 Day 없음'
              }
            />
            {[...c.hard, ...c.soft].length > 0 && (
              <ul className="mt-1 flex flex-col gap-1 border-t border-line-soft pt-2 text-xs text-ink-2">
                {[...c.hard, ...c.soft].map((v, i) => (
                  <li key={i}>{v.message}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {p.calendar && <DoctorSidePanel cal={p.calendar} showNext={false} className="" />}

        {early && p.picked && (
          <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <h2 className="text-sm font-bold">조기 배포</h2>
            <p className="text-xs text-ink-2">
              조정 기간(~{formatMD(p.plan.negotiationEnd)}) 전에 확정하면 바로 의사·간호사에게 공개됩니다.
            </p>
            <button
              type="button"
              className={btnPrimary}
              disabled={pending || (c?.hard.length ?? 0) > 0}
              onClick={() => run(() => confirmDoctorAction(p.picked!.id), '조기 배포했습니다.')}
            >
              지금 배포
            </button>
          </section>
        )}
      </aside>
    </div>
  )
}

function Row({ ok, warn, text }: { ok: boolean; warn?: boolean; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Dot ok={ok} warn={warn} />
      <span>{text}</span>
    </div>
  )
}
