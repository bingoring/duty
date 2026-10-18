// 3-7b S-D1 의사 근무표 달력 (핸드오프 6a). 훅이 없어 서버 화면·조정 화면(클라이언트)이 같이 쓴다
import type { DoctorSlot } from '@duty/domain'
import type { CalDay, CalPerson, CalWeek, DoctorCalendar as Cal } from '@/server/doctor/view'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const dowColor = (dow: number, red = false) =>
  red || dow === 0 ? 'text-danger' : dow === 6 ? 'text-admin' : ''

export type ChipMark = 'admin' | 'swap' | 'pending'

export type ChipHooks = {
  // 칩을 누르면 (조정 화면). 없으면 보기 전용
  onChip?: (date: string, slot: DoctorSlot, person: CalPerson) => void
  selected?: readonly { date: string; slot: DoctorSlot }[]
  marks?: Readonly<Record<string, ChipMark>>
  // 바뀔 칩 미리보기: `${date}:${slot}` → 바뀐 사람
  preview?: Readonly<Record<string, CalPerson>>
}

export function NameChip({
  person,
  slot,
  me,
  dim,
  strong,
}: {
  person: CalPerson
  slot: DoctorSlot
  me?: boolean
  dim?: boolean
  strong?: boolean
}) {
  return (
    <span
      className={`inline-flex h-[26px] min-w-[60px] items-center justify-center rounded-[6px] px-2 text-[13px] text-ink ${
        slot === 'D' ? 'bg-shift-d' : 'bg-shift-n'
      } ${me ? 'font-extrabold shadow-[inset_0_0_0_2px_var(--color-ink)]' : 'font-semibold'} ${
        strong ? 'outline-2 outline-offset-1 outline-ink' : ''
      } ${dim ? 'opacity-40' : ''}`}
    >
      {person.name}
    </span>
  )
}

const MARK_CLS: Record<ChipMark, string> = {
  admin: 'shadow-[0_0_0_2px_var(--color-admin)]',
  swap: 'outline-[1.5px] outline-dashed outline-danger',
  pending: 'outline-[1.5px] outline-dotted outline-warn-dot',
}

function SlotCell({
  c,
  slot,
  viewerId,
  highlight,
  hooks,
}: {
  c: CalDay | null
  slot: DoctorSlot
  viewerId: string | null
  highlight: string | null
  hooks: ChipHooks
}) {
  if (!c) return <div className="border-t border-line-soft" />
  const key = `${c.date}:${slot}`
  const base = slot === 'D' ? c.day : c.night
  const person = hooks.preview?.[key] ?? base
  const weekend = c.dow === 0 || c.dow === 6
  const sel = hooks.selected?.some((s) => s.date === c.date && s.slot === slot)
  const mark = hooks.marks?.[key]
  const chip = person && (
    <NameChip
      person={person}
      slot={slot}
      me={person.id === viewerId}
      dim={!!highlight && highlight !== person.id}
      strong={(!!highlight && highlight === person.id) || sel}
    />
  )
  return (
    <div
      role="gridcell"
      aria-label={`${c.dom}일 ${slot === 'D' ? 'Day' : 'Night'} ${person?.name ?? '비어 있음'}`}
      className={`flex h-[38px] items-center justify-center border-t border-line-soft ${
        c.today ? 'bg-[#E9F4F1]' : weekend ? 'bg-[#FCFBF8]' : ''
      }`}
    >
      {person && hooks.onChip ? (
        <button
          type="button"
          aria-pressed={sel}
          onClick={() => hooks.onChip!(c.date, slot, person)}
          className={`cursor-pointer rounded-[6px] ${mark ? MARK_CLS[mark] : ''} ${hooks.preview?.[key] ? 'ring-2 ring-ink' : ''}`}
        >
          {chip}
        </button>
      ) : (
        <span className={`rounded-[6px] ${mark ? MARK_CLS[mark] : ''}`}>{chip}</span>
      )}
    </div>
  )
}

function DateCell({ c }: { c: CalDay | null }) {
  if (!c) return <div className="h-[26px] border-t border-line" />
  return (
    <div
      className={`flex h-[26px] items-center gap-1.5 border-t border-line px-2 text-[13px] font-bold ${
        c.today ? 'bg-primary text-white' : dowColor(c.dow, c.red)
      }`}
      title={c.holiday ?? undefined}
    >
      {c.dom}
      {c.holiday && <span className="truncate text-[10px] font-semibold">{c.holiday}</span>}
      {c.allDay && (
        <span className="ml-auto rounded-full border border-line bg-surface px-1.5 text-[10px] leading-4 font-bold text-ink">
          올데이
        </span>
      )}
    </div>
  )
}

export function DoctorCalendarGrid({
  month,
  weeks,
  viewerId,
  highlight = null,
  hooks = {},
}: {
  month: number
  weeks: CalWeek[]
  viewerId: string | null
  highlight?: string | null
  hooks?: ChipHooks
}) {
  return (
    <div
      role="grid"
      aria-label="의사 근무표"
      className="grid overflow-hidden rounded-card border border-line bg-surface"
      style={{ gridTemplateColumns: '128px repeat(7, minmax(0, 1fr))' }}
    >
      <div className="flex h-[30px] items-center bg-panel px-3 text-sm font-extrabold">{month}월</div>
      {WEEK.map((w, i) => (
        <div
          key={w}
          role="columnheader"
          className={`flex h-[30px] items-center justify-center bg-panel text-xs font-bold ${dowColor(i)}`}
        >
          {w}
        </div>
      ))}
      {weeks.map((wk, i) => (
        <WeekRows key={i} week={wk} viewerId={viewerId} highlight={highlight} hooks={hooks} />
      ))}
    </div>
  )
}

function WeekRows({
  week,
  viewerId,
  highlight,
  hooks,
}: {
  week: CalWeek
  viewerId: string | null
  highlight: string | null
  hooks: ChipHooks
}) {
  const label = (name: string, time: string) => (
    <div className="flex h-[38px] flex-col justify-center border-t border-line-soft bg-panel px-3">
      <span className="text-xs font-bold">{name}</span>
      <span className="text-[10.5px] text-ink-2">{time}</span>
    </div>
  )
  return (
    <>
      <div className="h-[26px] border-t border-line bg-panel" />
      {week.map((c, i) => (
        <DateCell key={`d${i}`} c={c} />
      ))}
      {label('Day', '10:00 – 20:00')}
      {week.map((c, i) => (
        <SlotCell key={`D${i}`} c={c} slot="D" viewerId={viewerId} highlight={highlight} hooks={hooks} />
      ))}
      {label('Night', '20:00 – 익일 10:00')}
      {week.map((c, i) => (
        <SlotCell key={`N${i}`} c={c} slot="N" viewerId={viewerId} highlight={highlight} hooks={hooks} />
      ))}
    </>
  )
}

const ALLDAY_BG = 'linear-gradient(90deg,#FBE7B5 50%,#D9D6F2 50%)'

export function KindChip({ kind }: { kind: 'D' | 'N' | 'ALLDAY' }) {
  return (
    <span
      className={`inline-flex h-6 min-w-[52px] items-center justify-center rounded-[6px] px-1.5 text-xs font-bold text-ink ${
        kind === 'D' ? 'bg-shift-d' : kind === 'N' ? 'bg-shift-n' : ''
      }`}
      style={kind === 'ALLDAY' ? { background: ALLDAY_BG } : undefined}
    >
      {kind === 'D' ? 'Day' : kind === 'N' ? 'Night' : '올데이'}
    </span>
  )
}

// 우측 패널(250px): 다음 근무 · 의사별 집계 · 안내
export function DoctorSidePanel({ cal, showNext }: { cal: Cal; showNext: boolean }) {
  return (
    <aside className="flex w-[250px] shrink-0 flex-col gap-3" data-print="hide">
      {showNext && (
        <div className="flex flex-col gap-2 rounded-card bg-ink p-3.5 text-white">
          <div className="text-[13px] font-bold">다음 근무</div>
          {cal.next.length === 0 && <div className="text-xs text-ink-4">이 달 남은 근무가 없습니다</div>}
          {cal.next.map((n) => (
            <div key={n.date} className="flex items-center gap-2 text-xs">
              <KindChip kind={n.kind} />
              <span className="font-semibold">{n.label}</span>
              <span className="ml-auto text-[11px] text-ink-4">{n.time}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-card border border-line bg-surface p-3">
        <div className="mb-2 text-[13px] font-bold">의사별 집계</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-2">
              <th className="py-1 text-left font-semibold">성명</th>
              <th className="font-semibold">D</th>
              <th className="font-semibold">N</th>
              <th className="font-semibold">올데이</th>
              <th className="font-semibold">계</th>
            </tr>
          </thead>
          <tbody>
            {cal.tally.map((t) => (
              <tr key={t.id} className={t.me ? 'bg-primary-soft' : ''}>
                <td className="py-1 pl-1 font-semibold">
                  {t.name}
                  {t.extra.map((e) => (
                    <span key={e} className="ml-1 text-[10.5px] font-bold text-admin">
                      {e}
                    </span>
                  ))}
                </td>
                <td className="text-center">{t.D}</td>
                <td className="text-center">{t.N}</td>
                <td className="text-center">{t.allDay}</td>
                <td className="text-center font-bold">{t.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-ink-2">확정된 근무표만 간호사·의사가 서로 볼 수 있습니다.</p>
    </aside>
  )
}
