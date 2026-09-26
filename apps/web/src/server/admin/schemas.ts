import {
  EmployeeNoSchema,
  HOLIDAY_KINDS,
  ROLES,
  ROTATIONS,
  SENIORITY_TIERS,
  TRAINEE_KINDS,
  isIsoDate,
} from '@duty/domain'
import { z } from 'zod'

// Build Spec 2-4 domain-entities §3. 서버 액션의 입력 검증
const half = (min: number, max: number) =>
  z.coerce
    .number()
    .min(min)
    .max(max)
    .refine((v) => Number.isInteger(v * 2), '0.5 단위로 입력해 주세요.')
const isoOrNull = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || isIsoDate(v), '날짜 형식이 올바르지 않습니다.')
  .nullable()

export const TrainingInputSchema = z.object({
  kind: z.enum(TRAINEE_KINDS),
  preceptorId: z.string().uuid('프리셉터를 선택해 주세요.'),
  tripleWeeks: z.coerce.number().int().min(0).max(12),
})

const staffCommon = {
  name: z.string().trim().min(1, '성명을 입력해 주세요.').max(20),
  hireDate: isoOrNull,
  kTass: z.boolean(),
  seniorityTier: z.enum(SENIORITY_TIERS),
  unionMember: z.boolean(),
  rotation: z.enum(ROTATIONS),
  role: z.enum(ROLES),
  training: TrainingInputSchema.optional(),
}

export const StaffCreateSchema = z.object({
  employeeNo: EmployeeNoSchema.pipe(z.string().min(1, '사번을 입력해 주세요.')),
  ...staffCommon,
  annualLeave: half(0, 40),
  nightBank: z.coerce.number().int().min(0).max(50),
  offCarry: half(-31, 31),
})

export const StaffUpdateSchema = z.object({
  ...staffCommon,
  seniorityRank: z.coerce.number().int().min(1).max(99),
})

export const ADJUSTABLE_ACCOUNTS = [
  'annual_leave',
  'special_leave',
  'founding_off',
  'checkup',
  'sick_leave',
  'off_carry',
  'night_bank',
] as const
export type AdjustableAccount = (typeof ADJUSTABLE_ACCOUNTS)[number]

export const BalanceAdjustSchema = z.object({
  userId: z.string().uuid(),
  values: z.partialRecord(z.enum(ADJUSTABLE_ACCOUNTS), half(-99, 99)),
  note: z.string().trim().min(1, '메모를 입력해 주세요.').max(200),
})

export const HolidayInputSchema = z.object({
  date: z.string().refine(isIsoDate, '날짜 형식이 올바르지 않습니다.'),
  name: z.string().trim().min(1, '이름을 입력해 주세요.').max(30),
  kind: z.enum(HOLIDAY_KINDS),
})

export type StaffCreateInput = z.output<typeof StaffCreateSchema>
export type StaffUpdateInput = z.output<typeof StaffUpdateSchema>
export type BalanceAdjustInput = z.output<typeof BalanceAdjustSchema>
export type HolidayInput = z.output<typeof HolidayInputSchema>
export type FieldErrors = Partial<Record<string, string>>
