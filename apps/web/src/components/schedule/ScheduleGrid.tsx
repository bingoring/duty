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
// 핸드오프 v3 오늘 열: 헤더 청록·흰 글자, 데이터 칸 연청록 + 좌우 1px 청록 선 → 세로 띠. 주말 음영보다 우선
const TODAY_CELL =
  'bg-primary-soft shadow-[inset_1px_0_0_var(--color-primary),inset_-1px_0_0_var(--color-primary)]'
const TODAY_HEAD = 'bg-primary text-white'

const headFixed =
  'row-span-2 flex flex-col items-center justify-center border-r border-b border-line bg-panel text-center leading-[1.2] text-ink-2'

// 2-7 근무 조정: 관리자 편집용 선택 props (근무표·생성안 미리보기에서는 쓰지 않음)
export type GridInteraction = {
  onCell?: (userId: string, date: string, el: HTMLElement) => void
  // 저장 전 편집 칸 (칸 보기를 덮어쓴다)
  pending?: ReadonlyMap<string, GridCellView>
  focusDate?: string | null
  // 편집 중인 칸 (3a 선택 색: 행 #FFF9E8 · 열 #FBE7B5 · 칸 2px 외곽선)
  selected?: { userId: string; date: string } | null
}
const SELECTED_ROW = 'bg-[#FFF9E8]'

function Cell({
  c,
  name,
  userId,
  ui,
}: {
  c: GridCellView
  name: string
  userId: string
  ui?: GridInteraction
}) {
  const pending = ui?.pending?.get(`${userId}|${c.date}`)
  const v = pending ?? c
  const selected = ui?.selected?.userId === userId && ui.selected.date === c.date
  const focus = ui?.focusDate === c.date || ui?.selected?.date === c.date
  const inRow = ui?.selected?.userId === userId
  const body = (
    <>
      {v.chip && (
        <span
          className={`relative flex h-5 w-5 items-center justify-center rounded-[5px] font-bold text-ink ${
            v.label === 'off' ? 'text-[8.5px]' : 'text-[10.5px]'
          } ${CHIP[v.chip]} ${pending ? 'shadow-[inset_0_0_0_2px_var(--color-admin)] outline-1 outline-offset-1 outline-admin outline-dashed' : v.outline ? OUTLINE[v.outline] : ''}`}
        >
          {v.label}
          {v.checkupHalf && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 h-1 w-1 rounded-full bg-ink-2" />
          )}
        </span>
      )}
      {v.warn && (
        <span aria-hidden className="absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-warn-dot" />
      )}
    </>
  )
  const cls = `relative flex h-8 items-center justify-center border-r border-b border-line-soft ${
    focus ? 'bg-warn-bg' : inRow ? SELECTED_ROW : c.today ? TODAY_CELL : c.weekend ? 'bg-weekend-cell' : ''
  } ${selected ? 'z-10 outline-2 -outline-offset-2 outline-ink' : ''}`
  if (ui?.onCell)
    return (
      <button
        type="button"
        title={v.title}
        data-date={c.date}
        data-pending={pending ? true : undefined}
        aria-label={`${name} ${c.date}`}
        aria-pressed={selected || undefined}
        className={`${cls} cursor-pointer hover:bg-line-soft`}
        onClick={(e) => ui.onCell!(userId, c.date, e.currentTarget)}
      >
        {body}
      </button>
    )
  return (
    <div
      title={v.title}
      data-date={c.date}
      data-today={c.today || undefined}
      data-warn={v.warn || undefined}
      className={cls}
    >
      {body}
    </div>
  )
}

function Row({ r, ui }: { r: GridRow; ui?: GridInteraction }) {
  const me = r.kind === 'me'
  const sel = ui?.selected?.userId === r.userId
  const num = `flex h-8 items-center justify-center border-r border-b border-line border-b-line-soft text-ink-2 ${me ? 'bg-primary-soft' : sel ? SELECTED_ROW : ''}`
  return (
    <div role="row" aria-label={r.name} data-kind={r.kind} className="contents">
      <div
        className={`flex h-8 items-center truncate border-r border-b border-line border-b-line-soft pl-2 ${
          me
            ? 'bg-primary-soft font-extrabold shadow-[inset_3px_0_0_var(--color-primary)]'
            : sel
              ? `${SELECTED_ROW} font-extrabold`
              : 'font-semibold'
        } ${r.kind === 'head' ? 'text-admin' : ''}`}
      >
        {r.name}
      </div>
      <div className={num}>{r.carryOff}</div>
      <div className={num}>{r.carryN}</div>
      {r.cells.map((c) => (
        <Cell key={c.date} c={c} name={r.name} userId={r.userId} {...(ui ? { ui } : {})} />
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

export function ScheduleGrid({ view, ui }: { view: ScheduleView; ui?: GridInteraction }) {
  const colOn = (date: string) => ui?.selected?.date === date || ui?.focusDate === date
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
            data-today-head={d.today || undefined}
            className={`flex h-[18px] items-center justify-center border-r border-b border-line-soft ${
              colOn(d.date)
                ? 'bg-warn-bg font-extrabold'
                : d.today
                  ? `${TODAY_HEAD} font-extrabold`
                  : d.red
                    ? 'bg-weekend-head font-bold'
                    : 'bg-panel'
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
            data-today-head={d.today || undefined}
            className={`flex h-[18px] items-center justify-center border-r border-b border-r-line-soft border-b-line text-[10px] ${
              colOn(d.date)
                ? `bg-warn-bg font-bold ${DAY_COLOR[d.color]}`
                : d.today
                  ? `${TODAY_HEAD} font-bold`
                  : `${d.red ? 'bg-weekend-head' : 'bg-panel'} ${DAY_COLOR[d.color]}`
            }`}
          >
            {d.weekday}
          </div>
        ))}
        {view.rows.map((r) => (
          <Row key={r.userId} r={r} ui={ui} />
        ))}
      </div>
    </div>
  )
}
