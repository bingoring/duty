import { SEVERITY_KEYS as CONTRACT_KEYS } from '@duty/contract'
import { DEFAULT_RULES, SEVERITY_KEYS } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import { effectivePriorities } from './input'

const OFF = {
  requests: true,
  offAfterNight: false,
  weekendPair: false,
  avoidJuniorOnly: false,
  minimizeRepeatPairs: false,
}

describe('3-5 규칙별 필수/권고', () => {
  it('솔버 계약의 규칙 키가 도메인과 같다', () => {
    expect([...CONTRACT_KEYS]).toEqual([...SEVERITY_KEYS])
  })

  it('필수 규칙은 생성 화면에서 꺼도 켜진 채로 솔버에 간다 (토글이 꺼진 규칙은 그대로)', () => {
    const rules = {
      ...DEFAULT_RULES,
      toggles: { ...DEFAULT_RULES.toggles, minimizeRepeatPairs: false },
      severity: {
        ...DEFAULT_RULES.severity,
        OFF_AFTER_N: 'hard',
        WEEKEND_PAIR: 'hard',
        REPEAT_PAIR: 'hard',
      },
    } as const
    expect(effectivePriorities(OFF, rules)).toEqual({
      ...OFF,
      offAfterNight: true,
      weekendPair: true,
      minimizeRepeatPairs: false,
    })
    expect(effectivePriorities(OFF, DEFAULT_RULES)).toEqual(OFF)
  })
})

describe('3-10 13: 풀면 생성되는 필수 규칙 안내', () => {
  it('규칙 이름으로 알린다', async () => {
    const { relaxText } = await import('./service')
    expect(relaxText(['SHIFT_BALANCE'])).toBe(
      '「D·E·N 고르게」을(를) 규칙 설정에서 권고로 바꾸면 근무표를 만들 수 있습니다.',
    )
    expect(relaxText(['SHIFT_BALANCE', 'STAFF_MAX'])).toContain(
      '「D·E·N 고르게」 또는 「듀티당 최대 인원」 중 하나를',
    )
  })
})
