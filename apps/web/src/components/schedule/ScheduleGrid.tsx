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

// 칸 크기는 --chip(globals.css .schedule-grid)에서 나온다: 칩 20px → 행 32px·헤더 18px·글자 10.5px
const ROW_H = 'h-[calc(var(--chip)+12px)]'
const HEAD_H = 'h-[calc(var(--chip)*0.9)]'

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
  // 마우스가 올라간 칸: 행·열을 연하게 칠한다(선택 표시가 우선)
  hover?: { userId: string; date: string } | null
  onHover?: (cell: { userId: string; date: string } | null) => void
}
const SELECTED_ROW = 'bg-[#FFF9E8]'
const HOVER = 'bg-admin-soft'

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
  const hovered = ui?.hover?.userId === userId && ui.hover.date === c.date
  const hoverLine = ui?.hover?.userId === userId || ui?.hover?.date === c.date
  const body = (
    <>
      {v.chip && (
        <span
          className={`relative flex size-(--chip) items-center justify-center rounded-[5px] font-bold text-ink ${
            v.label === 'off' ? 'text-[calc(var(--chip)*0.425)]' : 'text-[calc(var(--chip)*0.525)]'
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
  const cls = `relative flex ${ROW_H} items-center justify-center border-r border-b border-line-soft ${
    focus
      ? 'bg-warn-bg'
      : inRow
        ? SELECTED_ROW
        : hoverLine
          ? HOVER
          : c.today
            ? TODAY_CELL
            : c.weekend
              ? 'bg-weekend-cell'
              : ''
  } ${selected ? 'z-10 outline-2 -outline-offset-2 outline-ink' : hovered ? 'z-10 outline-1 -outline-offset-1 outline-admin' : ''}`
  if (ui?.onCell)
    return (
      <button
        type="button"
        title={v.title}
        data-date={c.date}
        data-selected={selected || undefined}
        data-pending={pending ? true : undefined}
        aria-label={`${name} ${c.date}`}
        aria-pressed={selected || undefined}
        className={`${cls} cursor-pointer`}
        onMouseEnter={() => ui.onHover?.({ userId, date: c.date })}
        onFocus={() => ui.onHover?.({ userId, date: c.date })}
        onClick={(e) => ui.onCell!(userId, c.date, e.currentTarget)}
      >
        {body}
      </button>
    )
  return (
    <div
      title={v.title}
      data-date={c.date}
      data-selected={selected || undefined}
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
  const hov = !sel && ui?.hover?.userId === r.userId
  const num = `flex ${ROW_H} items-center justify-center border-r border-b border-line border-b-line-soft text-ink-2 ${me ? 'bg-primary-soft' : sel ? SELECTED_ROW : hov ? HOVER : ''}`
  return (
    <div role="row" aria-label={r.name} data-kind={r.kind} className="contents">
      <div
        className={`flex ${ROW_H} items-center truncate border-r border-b border-line border-b-line-soft pl-2 ${
          me
            ? 'bg-primary-soft font-extrabold shadow-[inset_3px_0_0_var(--color-primary)]'
            : sel
              ? `${SELECTED_ROW} font-extrabold`
              : 'font-semibold'
        } ${r.kind === 'head' ? 'text-admin' : ''}`}
      >
        {r.name}
      </div>
      <div className={num} data-col="carry-off">
        {r.carryOff}
      </div>
      <div className={num} data-col="carry-n">
        {r.carryN}
      </div>
      {r.cells.map((c) => (
        <Cell key={c.date} c={c} name={r.name} userId={r.userId} {...(ui ? { ui } : {})} />
      ))}
      <div className={`${num} border-l font-bold text-ink`} data-col="acc">
        {r.accOff}
      </div>
      <div className={num} data-col="n-left">
        {r.nLeft}
      </div>
      <div className={num}>{r.special}</div>
      <div className={num}>{r.checkup}</div>
      <div className={`${num} border-r-0`}>{r.bo}</div>
    </div>
  )
}

export function ScheduleGrid({ view, ui }: { view: ScheduleView; ui?: GridInteraction }) {
  const colOn = (date: string) => ui?.selected?.date === date || ui?.focusDate === date
  const colHover = (date: string) => !colOn(date) && ui?.hover?.date === date
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
        // 서버 컴포넌트(근무표)에서는 함수를 넘길 수 없으므로 호버를 쓰는 화면에서만 붙인다
        {...(ui?.onHover ? { onMouseLeave: () => ui.onHover!(null) } : {})}
        aria-label={view.title}
        className="grid"
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
            data-day={d.date}
            data-today-head={d.today || undefined}
            className={`flex ${HEAD_H} items-center justify-center border-r border-b border-line-soft ${
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
            data-day={d.date}
            data-today-head={d.today || undefined}
            className={`flex ${HEAD_H} items-center justify-center border-r border-b border-r-line-soft border-b-line text-[calc(var(--chip)*0.5)] ${
              colOn(d.date)
                ? `bg-warn-bg font-bold ${DAY_COLOR[d.color]}`
                : colHover(d.date)
                  ? `${HOVER} font-bold ${DAY_COLOR[d.color]}`
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
