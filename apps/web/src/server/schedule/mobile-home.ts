import { addDays, type IsoDate } from '@duty/domain'
import type { Db } from '../db/client'
import { loadMonthView } from './load'
import { parseYm, shiftYm } from './month'
import { todayCard, type TodayCard } from './mobile'
import { buildScheduleView, type ScheduleView } from './view'

// 3-12 오늘 카드는 보고 있는 달(?ym=)과 무관하게 오늘 기준. 보고 있는 달이 오늘 달이면 다시 읽지 않고,
// 오늘이 말일일 때만 다음 달을 읽는다(내일 근무)
export async function loadTodayCard(
  db: Db,
  a: { viewerId: string; today: IsoDate; shown?: { year: number; month: number; view: ScheduleView } },
): Promise<TodayCard> {
  const ym = parseYm(undefined, a.today)
  const read = async (y: { year: number; month: number }) =>
    buildScheduleView(await loadMonthView(db, { ...y, viewerId: a.viewerId, today: a.today }))
  const cur =
    a.shown && a.shown.year === ym.year && a.shown.month === ym.month ? a.shown.view : await read(ym)
  const monthEnd = addDays(a.today, 1).slice(0, 7) !== a.today.slice(0, 7)
  const next = monthEnd ? await read(shiftYm(ym, 1)) : null
  return todayCard({ cur, next, today: a.today })
}
