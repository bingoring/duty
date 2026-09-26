// Build Spec 2-1 domain-entities §2. allowed-set 컬럼은 text로 두고 값 검증은 @duty/domain이 한다.
import type { RuleParams, RuleToggles } from '@duty/domain'
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

const id = () => uuid('id').primaryKey().defaultRandom()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const day = (name: string) => date(name, { mode: 'string' })
const tstz = (name: string) => timestamp(name, { withTimezone: true })

export const wards = pgTable('wards', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
})

export const users = pgTable('users', {
  id: id(),
  wardId: uuid('ward_id')
    .notNull()
    .references(() => wards.id),
  employeeNo: text('employee_no').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull().default('nurse'),
  rotation: text('rotation').notNull().default('rotating'),
  seniorityRank: integer('seniority_rank').notNull(),
  seniorityTier: text('seniority_tier').notNull(),
  hireDate: day('hire_date'),
  kTass: boolean('k_tass').notNull().default(false),
  unionMember: boolean('union_member').notNull().default(false),
  nightDedicatedFrom: day('night_dedicated_from'),
  nightDedicatedTo: day('night_dedicated_to'),
  active: boolean('active').notNull().default(true),
  deactivatedAt: tstz('deactivated_at'),
  onboardedYear: integer('onboarded_year'),
  createdAt: createdAt(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})

export const credentials = pgTable('credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  failedCount: integer('failed_count').notNull().default(0),
  lockedUntil: tstz('locked_until'),
  passwordChangedAt: tstz('password_changed_at'),
})

export const sessions = pgTable(
  'sessions',
  {
    // 토큰의 SHA-256 hex. 원본 토큰은 저장하지 않는다.
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    persistent: boolean('persistent').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
    lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const trainings = pgTable('trainings', {
  id: id(),
  traineeId: uuid('trainee_id')
    .notNull()
    .references(() => users.id),
  preceptorId: uuid('preceptor_id')
    .notNull()
    .references(() => users.id),
  startDate: day('start_date').notNull(),
  endDate: day('end_date').notNull(),
  tripleStaffUntil: day('triple_staff_until').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
})

export const holidays = pgTable('holidays', {
  id: id(),
  date: day('date').notNull().unique(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  source: text('source').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
})

export const ruleVersions = pgTable(
  'rule_versions',
  {
    id: id(),
    wardId: uuid('ward_id')
      .notNull()
      .references(() => wards.id),
    version: integer('version').notNull(),
    params: jsonb('params').$type<RuleParams>().notNull(),
    toggles: jsonb('toggles').$type<RuleToggles>().notNull(),
    forbiddenPatterns: jsonb('forbidden_patterns').$type<string[]>().notNull(),
    diff: jsonb('diff')
      .$type<{ key: string; before: unknown; after: unknown }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    changedBy: uuid('changed_by').references(() => users.id),
    changedAt: tstz('changed_at').notNull().defaultNow(),
  },
  (t) => [unique('rule_versions_ward_version_uq').on(t.wardId, t.version)],
)

export const monthPlans = pgTable(
  'month_plans',
  {
    id: id(),
    wardId: uuid('ward_id')
      .notNull()
      .references(() => wards.id),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    status: text('status').notNull(),
    requestDeadline: day('request_deadline').notNull(),
    negotiationStart: day('negotiation_start').notNull(),
    negotiationEnd: day('negotiation_end').notNull(),
    ruleVersion: integer('rule_version'),
    confirmedCandidateId: uuid('confirmed_candidate_id'),
    confirmedBy: uuid('confirmed_by').references(() => users.id),
    confirmedAt: tstz('confirmed_at'),
    closedBy: uuid('closed_by').references(() => users.id),
    closedAt: tstz('closed_at'),
  },
  (t) => [unique('month_plans_ward_ym_uq').on(t.wardId, t.year, t.month)],
)

export const scheduleCandidates = pgTable(
  'schedule_candidates',
  {
    id: id(),
    monthPlanId: uuid('month_plan_id')
      .notNull()
      .references(() => monthPlans.id),
    generationNo: integer('generation_no').notNull(),
    seed: integer('seed').notNull(),
    ruleVersion: integer('rule_version').notNull(),
    checkResult: jsonb('check_result')
      .$type<{ hardViolations: unknown[]; softWarnings: unknown[] }>()
      .notNull(),
    solverMeta: jsonb('solver_meta').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [unique('schedule_candidates_plan_gen_uq').on(t.monthPlanId, t.generationNo)],
)

// 칸 공통 컬럼 (생성안·확정본이 같은 모양)
const cellColumns = () => ({
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  date: day('date').notNull(),
  code: text('code').notNull(),
  offKind: text('off_kind'),
  leaveKind: text('leave_kind'),
  checkupHalf: boolean('checkup_half').notNull().default(false),
  source: text('source').notNull(),
})

export const candidateCells = pgTable(
  'candidate_cells',
  {
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => scheduleCandidates.id, { onDelete: 'cascade' }),
    ...cellColumns(),
  },
  (t) => [primaryKey({ columns: [t.candidateId, t.userId, t.date] })],
)

export const scheduleCells = pgTable(
  'schedule_cells',
  {
    monthPlanId: uuid('month_plan_id')
      .notNull()
      .references(() => monthPlans.id),
    ...cellColumns(),
    editedBy: uuid('edited_by').references(() => users.id),
    editedAt: tstz('edited_at'),
  },
  (t) => [primaryKey({ columns: [t.monthPlanId, t.userId, t.date] })],
)

export const cellEditLogs = pgTable('cell_edit_logs', {
  id: id(),
  monthPlanId: uuid('month_plan_id')
    .notNull()
    .references(() => monthPlans.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  date: day('date').notNull(),
  before: jsonb('before').notNull(),
  after: jsonb('after').notNull(),
  editedBy: uuid('edited_by')
    .notNull()
    .references(() => users.id),
  editedAt: tstz('edited_at').notNull().defaultNow(),
  reason: text('reason').notNull(),
})

export const shiftRequests = pgTable(
  'shift_requests',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    date: day('date').notNull(),
    options: text('options')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    special: text('special'),
    comment: text('comment'),
    createdAt: createdAt(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('shift_requests_user_date_uq').on(t.userId, t.date),
    index('shift_requests_ym_idx').on(t.year, t.month),
  ],
)

export const leaveRequests = pgTable('leave_requests', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type').notNull(),
  reasonCode: text('reason_code'),
  startDate: day('start_date').notNull(),
  endDate: day('end_date').notNull(),
  days: numeric('days', { precision: 4, scale: 1 }).notNull(),
  attachmentId: uuid('attachment_id'),
  status: text('status').notNull(),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: tstz('decided_at'),
  rejectReason: text('reject_reason'),
  createdAt: createdAt(),
})

export const balanceEntries = pgTable(
  'balance_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    account: text('account').notNull(),
    delta: numeric('delta', { precision: 6, scale: 1 }).notNull(),
    reason: text('reason').notNull(),
    refYear: integer('ref_year'),
    refMonth: integer('ref_month'),
    refId: uuid('ref_id'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
    note: text('note'),
  },
  (t) => [index('balance_entries_user_account_idx').on(t.userId, t.account)],
)

export const monthSettlements = pgTable(
  'month_settlements',
  {
    monthPlanId: uuid('month_plan_id')
      .notNull()
      .references(() => monthPlans.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    baselineOff: integer('baseline_off').notNull(),
    actualOff: integer('actual_off').notNull(),
    sleepingOff: integer('sleeping_off').notNull(),
    nightCount: integer('night_count').notNull(),
    offCarryBefore: numeric('off_carry_before', { precision: 6, scale: 1 }).notNull(),
    offCarryAfter: numeric('off_carry_after', { precision: 6, scale: 1 }).notNull(),
    nightBankBefore: integer('night_bank_before').notNull(),
    nightBankAfter: integer('night_bank_after').notNull(),
    weekendPairAchieved: boolean('weekend_pair_achieved').notNull(),
    specialUsed: numeric('special_used', { precision: 4, scale: 1 }).notNull(),
    foundingUsed: numeric('founding_used', { precision: 4, scale: 1 }).notNull(),
    checkupUsed: numeric('checkup_used', { precision: 4, scale: 1 }).notNull(),
    eduCont: integer('edu_cont').notNull(),
  },
  (t) => [primaryKey({ columns: [t.monthPlanId, t.userId] })],
)
