import Link from 'next/link'
import type { GridCellView, GridRow, ScheduleView } from '@/server/schedule/view'

// 1c 격자 (Build Spec 2-3 frontend-components §2). 수치는 프로토타입 스타일 JS의 hdStyleB·wdStyleB·c.wrap·c.style·nameStyle·numStyle
const CHIP: Record<NonNullable<GridCellView['chip']>, string> = {
  d: 'bg-shift-d',
  e: 'bg-shift-e',
  n: 'bg-shift-n',
  s: 'bg-shift-s',
  off: 'bg-shift-off',
  leave: 'bg-shift-leave',
}
const OUTLINE = {
  admin: 'shadow-[inset_0_0_0_2px_var(--color-admin)]',
  requested: 'shadow-[inset_0_0_0_1.5px_var(--color-danger)]',
}
const DAY_COLOR = { sun: 'text-danger', sat: 'text-admin', plain: 'text-ink-2' }

const headFixed =
  'row-span-2 flex flex-col items-center justify-center border-r border-b border-line bg-panel text-center leading-[1.2] text-ink-2'

function Cell({ c }: { c: GridCellView }) {
  return (
    <div
      title={c.title}
      data-date={c.date}
      className={`relative flex h-8 items-center justify-center border-r border-b border-line-soft ${c.weekend ? 'bg-weekend-cell' : ''}`}
    >
      {c.chip && (
        <span
          className={`relative flex h-5 w-5 items-center justify-center rounded-[5px] font-bold text-ink ${
            c.label === 'off' ? 'text-[8.5px]' : 'text-[10.5px]'
          } ${CHIP[c.chip]} ${c.outline ? OUTLINE[c.outline] : ''}`}
        >
          {c.label}
          {c.checkupHalf && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 h-1 w-1 rounded-full bg-ink-2" />
          )}
        </span>
      )}
    </div>
  )
}

function Row({ r }: { r: GridRow }) {
  const me = r.kind === 'me'
  const num = `flex h-8 items-center justify-center border-r border-b border-line border-b-line-soft text-ink-2 ${me ? 'bg-primary-soft' : ''}`
  return (
    <div role="row" aria-label={r.name} data-kind={r.kind} className="contents">
      <div
        className={`flex h-8 items-center truncate border-r border-b border-line border-b-line-soft pl-2 ${
          me ? 'bg-primary-soft font-extrabold shadow-[inset_3px_0_0_var(--color-primary)]' : 'font-semibold'
        } ${r.kind === 'head' ? 'text-admin' : ''}`}
      >
        {r.name}
      </div>
      <div className={num}>{r.carryOff}</div>
      <div className={num}>{r.carryN}</div>
      {r.cells.map((c) => (
        <Cell key={c.date} c={c} />
      ))}
      <div className={`${num} border-l font-bold text-ink`} data-col="acc">
        {r.accOff}
      </div>
      <div className={num}>{r.nLeft}</div>
      <div className={num}>{r.special}</div>
      <div className={num}>{r.checkup}</div>
      <div className={`${num} border-r-0`}>{r.bo}</div>
    </div>
  )
}

export function ScheduleGrid({ view }: { view: ScheduleView }) {
  if (view.empty)
    return (
      <div className="flex flex-col items-center gap-3 rounded-[10px] border border-line bg-surface p-8 text-sm text-ink-2">
        {view.empty.text}
        {view.empty.adminLink && (
          <Link
            href={view.empty.adminLink}
            className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink"
          >
            듀티 생성에서 생성안 보기
          </Link>
        )}
      </div>
    )
  return (
    <div className="schedule-grid overflow-hidden rounded-[10px] border border-line bg-surface">
      <div
        role="grid"
        aria-label={view.title}
        className="grid text-[11px]"
        style={{ gridTemplateColumns: view.gridTemplate }}
      >
        <div className={headFixed}>성명</div>
        <div className={headFixed}>
          이월
          <br />
          off
        </div>
        <div className={headFixed}>
          이월
          <br />N
        </div>
        {view.days.map((d) => (
          <div
            key={d.date}
            className={`flex h-[18px] items-center justify-center border-r border-b border-line-soft ${
              d.red ? 'bg-weekend-head font-bold' : 'bg-panel'
            }`}
          >
            {d.day}
          </div>
        ))}
        <div className={headFixed}>
          누적
          <br />
          off
        </div>
        <div className={headFixed}>ⓝN</div>
        <div className={headFixed}>
          특휴
          <br />
          개원
        </div>
        <div className={headFixed}>검진</div>
        <div className={`${headFixed} border-r-0`}>보</div>
        {view.days.map((d) => (
          <div
            key={d.date}
            className={`flex h-[18px] items-center justify-center border-r border-b border-r-line-soft border-b-line text-[10px] ${
              d.red ? 'bg-weekend-head' : 'bg-panel'
            } ${DAY_COLOR[d.color]}`}
          >
            {d.weekday}
          </div>
        ))}
        {view.rows.map((r) => (
          <Row key={r.userId} r={r} />
        ))}
      </div>
    </div>
  )
}
