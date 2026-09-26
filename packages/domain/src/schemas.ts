import { z } from 'zod'
import {
  CELL_SOURCES,
  LEAVE_KINDS,
  OFF_KINDS,
  REQUEST_OPTIONS,
  REQUEST_SPECIALS,
  SHIFT_CODES,
} from './allowed-sets'

// 사번은 문자열이다. 실제 사번은 5자리이고 앞자리 0이 있다(00101 형태, 가상 번호).
export const EmployeeNoSchema = z.string().trim().min(1).max(20)

export const CellSchema = z
  .object({
    code: z.enum(SHIFT_CODES),
    offKind: z.enum(OFF_KINDS).optional(),
    leaveKind: z.enum(LEAVE_KINDS).optional(),
    checkupHalf: z.boolean(),
    source: z.enum(CELL_SOURCES),
  })
  .superRefine((cell, ctx) => {
    if ((cell.code === 'OFF') !== (cell.offKind !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['offKind'],
        message: 'OFF 칸에만, 그리고 반드시 offKind가 있어야 합니다',
      })
    }
    if ((cell.code === 'LEAVE') !== (cell.leaveKind !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['leaveKind'],
        message: 'LEAVE 칸에만, 그리고 반드시 leaveKind가 있어야 합니다',
      })
    }
  })

export const ShiftRequestInputSchema = z
  .object({
    options: z.array(z.enum(REQUEST_OPTIONS)).max(REQUEST_OPTIONS.length),
    special: z.enum(REQUEST_SPECIALS).optional(),
    comment: z.string().max(500).optional(),
  })
  .superRefine((req, ctx) => {
    if (new Set(req.options).size !== req.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: '같은 옵션을 두 번 선택할 수 없습니다' })
    }
    if (req.options.length > 0 === (req.special !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: '근무 옵션과 특수 신청 중 하나만 선택해야 합니다',
      })
    }
  })

export type Cell = z.infer<typeof CellSchema>
export type ShiftRequestInput = z.infer<typeof ShiftRequestInputSchema>
