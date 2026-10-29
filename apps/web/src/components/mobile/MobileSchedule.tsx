'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { IsoDate } from '@duty/domain'
import type { DayRosters, MobileChip, MyDay, MyMonth, RosterGroup, TodayCard } from '@/server/schedule/mobile'

// 3-12 모바일 근무표 (시안 design-mobile 1-home B · 2-team B). 오늘 카드 → 「내 근무」 달력 / 「전체」 날짜별 명단

export const CHIP_BG: Record<MobileChip, string> = {
  d: 'bg-shift-d',
  e: 'bg-shift-e',
  n: 'bg-shift-n',
  s: 'bg-shift-s',
  off: 'bg-shift-off text-ink-2 font-semibold',
  leave: 'bg-shift-leave',
  allday: 'bg-primary-soft text-primary',
}
const GROUP_CHIP: Record<RosterGroup['key'], MobileChip> = {
  D: 'd',
  E: 'e',
  N: 'n',
  S: 's',
  ALLDAY: 'allday',
  OFF: 'off',
  LEAVE: 'leave',
}
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

export type RosterSet = { key: 'nurse' | 'doctor'; label: '간호사' | '의사'; rosters: DayRosters }

export function MobileSchedule(props: {
  title: string
  prevHref: string
  nextHref: string
  card: TodayCard
  mine: MyMonth
  groups: RosterSet[]
  tab: 'mine' | 'all'
  date: IsoDate
  mineHref: string
  allHref: string
  footer?: React.ReactNode
}) {
  const [date, setDate] = useState(props.date)
  return (
    <div className="flex flex-col gap-3 px-4 pt-3.5">
      <div className="flex items-center justify-between">
        <h1 className="text-[19px] font-bold tracking-[-0.02em]">{props.title}</h1>
        <div className="flex items-center gap-1">
          <Link href={props.prevHref} aria-label="이전 달" className={navBtn}>
            ‹
          </Link>
          <Link href={props.nextHref} aria-label="다음 달" className={navBtn}>
            ›
          </Link>
        </div>
      </div>
      <TodayCardView card={props.card} />
      <div role="tablist" aria-label="보기" className="flex rounded-[10px] bg-shift-off p-[3px] text-[13px]">
        {(
          [
            ['mine', '내 근무', props.mineHref],
            ['all', '전체', props.allHref],
          ] as const
        ).map(([k, label, href]) => (
          <Link
            key={k}
            href={href}
            role="tab"
            aria-selected={props.tab === k}
            className={`flex-1 rounded-lg py-1.5 text-center ${
              props.tab === k ? 'bg-surface font-bold text-ink' : 'text-ink-2'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      {props.tab === 'mine' ? (
        <MineCalendar mine={props.mine} rosters={props.groups[0]?.rosters ?? {}} date={date} onPick={setDate} />
      ) : (
        <AllDay mine={props.mine} groups={props.groups} date={date} onPick={setDate} />
      )}
      {props.footer}
    </div>
  )
}

const navBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-base active:bg-panel'

function TodayCardView({ card }: { card: TodayCard }) {
  return (
    <section aria-label="오늘 내 근무" className="rounded-2xl bg-ink px-4 py-3.5 text-white">
      <div className="text-xs opacity-70">{card.dateLabel}</div>
      {card.empty ? (
        <div className="mt-1 text-[15px] font-bold">근무표가 아직 없습니다</div>
      ) : (
        <>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[30px] leading-tight font-extrabold">{card.code}</span>
            {card.time && <span className="text-[13px] opacity-85">{card.time}</span>}
          </div>
          {(card.tomorrow || card.summary) && (
            <div className="mt-2 text-xs opacity-75">{[card.tomorrow, card.summary].filter(Boolean).join(' · ')}</div>
          )}
        </>
      )}
    </section>
  )
}

function Chip({ chip, label, size = 'sm' }: { chip: MobileChip; label: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-1 font-bold ${CHIP_BG[chip]} ${
        size === 'sm' ? 'h-[18px] min-w-[26px] text-[10px]' : 'h-[22px] min-w-[30px] text-[11px]'
      }`}
    >
      {label}
    </span>
  )
}

function MineCalendar(props: {
  mine: MyMonth
  rosters: DayRosters
  date: IsoDate
  onPick: (d: IsoDate) => void
}) {
  const picked = props.mine.weeks.flat().find((d) => d?.date === props.date) ?? null
  return (
    <div className="flex flex-col gap-2">
      <div role="grid" aria-label="내 근무 달력" className="grid grid-cols-7 gap-[3px] text-center text-[11px]">
        {WEEK.map((w, i) => (
          <div key={w} className={`py-0.5 ${i === 0 ? 'text-danger' : 'text-ink-3'}`}>
            {w}
          </div>
        ))}
        {props.mine.weeks.flat().map((d, i) =>
          d ? (
            <button
              key={d.date}
              type="button"
              aria-label={`${d.day}일 ${d.label || '근무 없음'}`}
              aria-pressed={d.date === props.date}
              onClick={() => props.onPick(d.date)}
              className={`flex h-[46px] flex-col items-center gap-0.5 rounded-md bg-surface pt-1 ${
                d.today ? 'outline-2 outline-primary' : d.date === props.date ? 'outline-2 outline-ink' : ''
              }`}
            >
              <span className={d.red ? 'text-danger' : 'text-ink-2'}>{d.day}</span>
              {d.chip && <Chip chip={d.chip} label={d.label} />}
            </button>
          ) : (
            <div key={`b${i}`} />
          ),
        )}
      </div>
      {picked && <Together day={picked} groups={props.rosters[picked.date] ?? []} />}
    </div>
  )
}

function Together({ day, groups }: { day: MyDay; groups: RosterGroup[] }) {
  const mineGroup = groups.find((g) => g.people.some((p) => p.me))
  const others = mineGroup?.people.filter((p) => !p.me).map((p) => p.name) ?? []
  const text = !day.chip
    ? '근무 없음'
    : day.chip === 'off' || day.chip === 'leave'
      ? '쉬는 날'
      : `같이 서는 사람: ${others.length ? others.join(' · ') : '없음'}`
  return (
    <p aria-live="polite" className="text-xs text-ink-2">
      {day.day}일 {day.chip && day.chip !== 'off' ? `${day.label} · ` : ''}
      {text}
    </p>
  )
}

function AllDay(props: { mine: MyMonth; groups: RosterSet[]; date: IsoDate; onPick: (d: IsoDate) => void }) {
  const [group, setGroup] = useState(0)
  const strip = useRef<HTMLDivElement>(null)
  const days = props.mine.weeks.flat().filter((d): d is MyDay => d !== null)
  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [props.date])
  const set = props.groups[group] ?? props.groups[0]
  const groups = set?.rosters[props.date] ?? []
  return (
    <div className="flex flex-col gap-2">
      <div ref={strip} aria-label="날짜" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {days.map((d) => {
          const on = d.date === props.date
          return (
            <button
              key={d.date}
              type="button"
              aria-pressed={on}
              aria-label={`${d.day}일`}
              onClick={() => props.onPick(d.date)}
              className={`flex min-w-[40px] flex-col items-center rounded-[10px] py-1.5 text-[11px] ${
                on ? 'bg-ink text-white' : 'bg-surface text-ink-2'
              } ${d.today && !on ? 'outline-2 outline-primary' : ''}`}
            >
              {WEEK[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}
              <b className={`text-[15px] ${on ? 'text-white' : d.red ? 'text-danger' : 'text-ink'}`}>{d.day}</b>
            </button>
          )
        })}
      </div>
      {props.groups.length > 1 && (
        <div className="flex gap-1.5 text-xs">
          {props.groups.map((g, i) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={i === group}
              onClick={() => setGroup(i)}
              className={`rounded-full border px-3 py-1 ${
                i === group ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
      {groups.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-3">이 날 근무표가 없습니다.</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.label} className="rounded-xl bg-surface px-3 py-2.5">
            <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <Chip chip={GROUP_CHIP[g.key]} label={g.key === 'OFF' ? 'off' : g.label} size="md" />
              {g.time || (g.key === 'OFF' ? '쉬는 사람' : '')}
              <small className="font-normal text-ink-3">{g.people.length}명</small>
            </h2>
            <p className="text-[13px] leading-[1.7]">
              {g.people.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ' · '}
                  <span className={p.me ? 'font-extrabold text-primary' : ''}>
                    {p.name}
                    {p.me ? '(나)' : ''}
                    {p.note ? `(${p.note})` : ''}
                  </span>
                </span>
              ))}
            </p>
          </section>
        ))
      )}
    </div>
  )
}
