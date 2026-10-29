import { swappable, type GridCell, type IsoDate } from '@duty/domain'
import type { AdjustView } from './view'

// 3-12 모바일 교환 요청: 고른 날짜에 나를 뺀 사람들을 근무별로 묶는다(순수 함수). 맞바꾸기·검사는 데스크톱 SwapPopup 그대로
export type SwapPerson = { id: string; name: string; code: string; selectable: boolean }
export type SwapGroup = { code: string; people: SwapPerson[] }

const ORDER = ['D', 'E', 'N', 'S', 'OFF', '휴가']
const groupOf = (code: string) => (ORDER.includes(code) ? code : '휴가')

export function swapGroups(
  view: AdjustView,
  date: IsoDate,
  viewerId: string,
): { mine: string | null; groups: SwapGroup[] } {
  const cells = new Map(
    (view.checkInput?.cells ?? []).filter((c) => c.date === date).map((c) => [c.userId, c as GridCell]),
  )
  const mine = cells.get(viewerId)?.code ?? null
  const selectable = new Set(view.swap?.selectable ?? [])
  const people: SwapPerson[] = view.grid.rows.flatMap((r) => {
    const c = cells.get(r.userId)
    if (r.userId === viewerId || !c) return []
    const head = view.names[r.userId]?.rotation === 'fixed_weekday'
    return [
      {
        id: r.userId,
        name: view.names[r.userId]?.name ?? r.userId,
        code: groupOf(c.code),
        selectable: selectable.has(r.userId) && swappable(c, head),
      },
    ]
  })
  if (!mine) return { mine: null, groups: [] }
  const groups = ORDER.map((code) => ({ code, people: people.filter((p) => p.code === code) })).filter(
    (g) => g.people.length > 0,
  )
  return { mine: groupOf(mine), groups }
}

// 데스크톱 교환도 그 달 아무 날짜나 고른다(기간·과거 판정은 서버가 한다)
export function swapDates(view: AdjustView): IsoDate[] {
  return view.grid.days.map((d) => d.date)
}
