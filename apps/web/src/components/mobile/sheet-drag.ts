// 3-12 바텀 시트 손잡이 끌기 판정(순수 함수). 놓을 때 충분히 끌었거나 빠르게 튕겼으면 닫는다
const CLOSE_DISTANCE = 120
const CLOSE_RATIO = 0.25
const CLOSE_VELOCITY = 0.6 // px/ms

export function dragOutcome(a: { dy: number; velocity: number; height: number }): 'close' | 'stay' {
  if (a.velocity > CLOSE_VELOCITY) return 'close'
  return a.dy > Math.min(CLOSE_DISTANCE, a.height * CLOSE_RATIO) ? 'close' : 'stay'
}

// 아래로는 손가락을 그대로 따라가고, 위로는 움직이지 않는다
export function dragOffset(dy: number): number {
  return Math.max(0, dy)
}
