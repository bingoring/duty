// Build Spec 2-1 domain-entities §2. allowed-set 컬럼은 text로 두고 값 검증은 @duty/domain이 한다.
import type {
  DoctorCheckResult,
  DoctorFixedRule,
  DoctorRuleParams,
  RuleParams,
  RuleSeverity,
  RuleToggles,
} from '@duty/domain'
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
  // 로그인 ID. 간호사 = 사번. 3-7a: 의사는 처음에 생년월일 6자리, 관리자가 「사번으로 변경」(ID만 교체)
  employeeNo: text('employee_no').notNull().unique(),
  // 3-7a: LOGIN_ID_KINDS — 생년월일이면 의사 관리에 「생년월일」 태그
  loginIdKind: text('login_id_kind').notNull().default('employee_no'),
  // 3-7a: 직군 ROLE_GROUPS. 메뉴·규칙·관리자가 직군마다 따로다
  roleGroup: text('role_group').notNull().default('nurse'),
  name: text('name').notNull(),
  role: text('role').notNull().default('nurse'),
  rotation: text('rotation').notNull().default('rotating'),
  seniorityRank: integer('seniority_rank').notNull(),
  seniorityTier: text('seniority_tier').notNull(),
  hireDate: day('hire_date'),
  kTass: boolean('k_tass').notNull().default(false),
  // 3-5: KTAS 수료일. 유효기간 = 수료일 + 3년 − 1일
  ktasCertifiedOn: day('ktas_certified_on'),
  // 3-6: 최근 갱신일. 유효기간은 취득일·갱신일 중 늦은 날 + 3년
  ktasRenewedOn: day('ktas_renewed_on'),
  // 3-8: 갱신 안내 팝업(만료 6개월 전부터, 같은 만료일에 3회까지). 만료일이 바뀌면 다시 센다
  ktasReminderCount: integer('ktas_reminder_count').notNull().default(0),
  ktasRemindedUntil: day('ktas_reminded_until'),
  unionMember: boolean('union_member').notNull().default(false),
  // 3-6: 본인이 규칙 안내에서 끄면 주말 통 OFF를 요구하지 않는다(처음엔 자동 신청)
  weekendPairWanted: boolean('weekend_pair_wanted').notNull().default(true),
  nightDedicatedFrom: day('night_dedicated_from'),
  nightDedicatedTo: day('night_dedicated_to'),
  active: boolean('active').notNull().default(true),
  deactivatedAt: tstz('deactivated_at'),
  onboardedYear: integer('onboarded_year'),
  // 2-7 Q3: 근무표 "바뀐 근무" 안내를 마지막으로 확인한 시각
  changesSeenAt: tstz('changes_seen_at'),
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
  // TRAINEE_KINDS: 완전 신규 3주 / 경력자 2주 3인 배정 (2-2)
  kind: text('kind').notNull().default('new_grad'),
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
    // 3-10 11: 금지 권고 패턴(늘 권고)
    softPatterns: jsonb('soft_patterns')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // 3-5: 규칙별 필수/권고. 예전 버전은 빈 객체 → 기본값
    severity: jsonb('severity')
      .$type<Partial<RuleSeverity>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
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
  // 2-7 Q2: 필수 규칙을 어기고 적용한 사유
  note: text('note'),
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
    // 2-5 Q2: null = 임시 저장(본인만), 시각 = 제출
    submittedAt: tstz('submitted_at'),
    // 3-6: 관리자가 다른 간호사 대신 넣은 신청(신청 화면·근무표에 파란 외곽선)
    byAdmin: boolean('by_admin').notNull().default(false),
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
  comment: text('comment'),
  // 3-9 14: 관리자가 대신 넣은 휴가(신청 화면·근무표 파란 표시)
  byAdmin: boolean('by_admin').notNull().default(false),
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
  (t) => [
    index('balance_entries_user_account_idx').on(t.userId, t.account),
    // R-1: 연초 처리 여부(요청마다)·마감 항목 조회
    index('balance_entries_reason_year_idx').on(t.reason, t.refYear),
    index('balance_entries_ref_reason_idx').on(t.refId, t.reason),
  ],
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

// 3-5: 관리자가 간호사의 OFF(다음 달 OFF 신청 또는 확정된 근무표의 OFF 칸)를 휴가로 바꾸자는 요청.
// 간호사가 수락하면 승인된 휴가(leave_requests)가 되고, 거절하면 그대로 둔다
export const leaveProposals = pgTable(
  'leave_proposals',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    proposedBy: uuid('proposed_by')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    reasonCode: text('reason_code'),
    startDate: day('start_date').notNull(),
    endDate: day('end_date').notNull(),
    days: numeric('days', { precision: 4, scale: 1 }).notNull(),
    comment: text('comment'),
    // LEAVE_PROPOSAL_STATUSES
    status: text('status').notNull(),
    closedReason: text('closed_reason'),
    leaveRequestId: uuid('leave_request_id').references(() => leaveRequests.id),
    createdAt: createdAt(),
    closedAt: tstz('closed_at'),
  },
  (t) => [index('leave_proposals_user_status_idx').on(t.userId, t.status)],
)

// Build Spec 2-8 domain-entities §1 — 간호사 교환 요청 (한 요청 = 한 날짜)
export const swapRequests = pgTable(
  'swap_requests',
  {
    id: id(),
    monthPlanId: uuid('month_plan_id')
      .notNull()
      .references(() => monthPlans.id),
    date: day('date').notNull(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id),
    comment: text('comment'),
    // SWAP_STATUSES
    status: text('status').notNull(),
    closedReason: text('closed_reason'),
    createdAt: createdAt(),
    closedAt: tstz('closed_at'),
  },
  (t) => [index('swap_requests_plan_idx').on(t.monthPlanId, t.status)],
)

export const swapRequestItems = pgTable(
  'swap_request_items',
  {
    requestId: uuid('request_id')
      .notNull()
      .references(() => swapRequests.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    before: jsonb('before').$type<{ code: string }>().notNull(),
    after: jsonb('after').$type<{ code: string }>().notNull(),
    // SWAP_RESPONSES
    response: text('response').notNull(),
    respondedAt: tstz('responded_at'),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.userId] }), index('swap_items_user_idx').on(t.userId)],
)

// Build Spec 2-11 §2.1 — 개인정보 수집·이용 동의(R-CONSENT-4). 지우지 않고 쌓는다
export const privacyConsents = pgTable(
  'privacy_consents',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    version: text('version').notNull(),
    requiredAt: tstz('required_at').notNull(),
    // 민감정보(노조 가입 여부·병가 사유) 별도 동의 (개인정보 보호법 제23조)
    sensitiveAt: tstz('sensitive_at').notNull(),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('privacy_consents_user_idx').on(t.userId, t.version)],
)

// Build Spec 2-11 §2.1 — 최초 로그인 초기 설정 제출(R-ONB-6·7). 바뀐 항목이 있을 때만
export const onboardingSubmissions = pgTable(
  'onboarding_submissions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    year: integer('year').notNull(),
    // ONBOARDING_KINDS: initial(첫 설정) · annual(해마다 연차)
    kind: text('kind').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>().notNull(),
    after: jsonb('after').$type<Record<string, unknown>>().notNull(),
    submittedAt: tstz('submitted_at').notNull().defaultNow(),
    reviewedAt: tstz('reviewed_at'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    // ONBOARDING_REVIEWS: confirmed · reverted
    review: text('review'),
    reviewNote: text('review_note'),
  },
  (t) => [index('onboarding_submissions_user_idx').on(t.userId, t.reviewedAt)],
)

// ── 3-7 의사 근무표 ─────────────────────────────────────────────────
// 간호사 계획·칸·신청 테이블과 섞지 않는다(간호사 쿼리가 의사 행을 보지 않게)

// 3-7c: 의사 개인 조건 (매달 자동 적용). 올데이 범위 = 권고, 고정 조건 = 필수
export const doctorPrefs = pgTable('doctor_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  allDayMin: integer('all_day_min'),
  allDayMax: integer('all_day_max'),
  fixedRules: jsonb('fixed_rules')
    .$type<DoctorFixedRule[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
})

// 3-7a: 의사 규칙 버전 (간호사 rule_versions와 따로)
export const doctorRuleVersions = pgTable('doctor_rule_versions', {
  id: id(),
  version: integer('version').notNull().unique(),
  params: jsonb('params').$type<DoctorRuleParams>().notNull(),
  diff: jsonb('diff')
    .$type<{ key: string; before: unknown; after: unknown }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  changedBy: uuid('changed_by').references(() => users.id),
  changedAt: tstz('changed_at').notNull().defaultNow(),
})

// 3-7b: 의사 월 계획. REQUESTING → DRAFTING(생성안) → CONFIRMED(확정 = 공개)
export const doctorMonthPlans = pgTable(
  'doctor_month_plans',
  {
    id: id(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    status: text('status').notNull(),
    requestDeadline: day('request_deadline').notNull(),
    negotiationEnd: day('negotiation_end').notNull(),
    // 날짜 수와 기준 개수의 차이를 채우는 ±1 대상 (31일 달: D 한 명·N 한 명)
    extras: jsonb('extras')
      .$type<{ D: string[]; N: string[] }>()
      .notNull()
      .default(sql`'{"D":[],"N":[]}'::jsonb`),
    ruleVersion: integer('rule_version'),
    confirmedCandidateId: uuid('confirmed_candidate_id'),
    confirmedBy: uuid('confirmed_by').references(() => users.id),
    confirmedAt: tstz('confirmed_at'),
    createdAt: createdAt(),
  },
  (t) => [unique('doctor_month_plans_ym_uq').on(t.year, t.month)],
)

// 3-7b: 확정 근무표. 하루 한 행 — 올데이 = day_user = night_user
export const doctorShifts = pgTable(
  'doctor_shifts',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => doctorMonthPlans.id),
    date: day('date').notNull(),
    dayUser: uuid('day_user')
      .notNull()
      .references(() => users.id),
    nightUser: uuid('night_user')
      .notNull()
      .references(() => users.id),
    // DOCTOR_SHIFT_SOURCES: generated · imported · admin · swap
    source: text('source').notNull(),
    editedBy: uuid('edited_by').references(() => users.id),
    editedAt: tstz('edited_at'),
  },
  (t) => [primaryKey({ columns: [t.planId, t.date] })],
)

// 3-7c: 의사 신청 (D/N/O/올데이 복수 = or). fixed_exception = 그 날만 고정 조건 예외
export const doctorRequests = pgTable(
  'doctor_requests',
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
    comment: text('comment'),
    fixedException: boolean('fixed_exception').notNull().default(false),
    byAdmin: boolean('by_admin').notNull().default(false),
    submittedAt: tstz('submitted_at'),
    createdAt: createdAt(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('doctor_requests_user_date_uq').on(t.userId, t.date),
    index('doctor_requests_ym_idx').on(t.year, t.month),
  ],
)

// 3-7d: 생성안
export const doctorCandidates = pgTable(
  'doctor_candidates',
  {
    id: id(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => doctorMonthPlans.id),
    generationNo: integer('generation_no').notNull(),
    seed: integer('seed').notNull(),
    ruleVersion: integer('rule_version').notNull(),
    checkResult: jsonb('check_result').$type<DoctorCheckResult>().notNull(),
    solverMeta: jsonb('solver_meta').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [unique('doctor_candidates_plan_gen_uq').on(t.planId, t.generationNo)],
)

export const doctorCandidateShifts = pgTable(
  'doctor_candidate_shifts',
  {
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => doctorCandidates.id, { onDelete: 'cascade' }),
    date: day('date').notNull(),
    dayUser: uuid('day_user')
      .notNull()
      .references(() => users.id),
    nightUser: uuid('night_user')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.candidateId, t.date] })],
)

// 3-7e: 확정 근무표 변경 기록 (관리자 칸 편집·교환 수락)
export const doctorShiftLogs = pgTable('doctor_shift_logs', {
  id: id(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => doctorMonthPlans.id),
  date: day('date').notNull(),
  before: jsonb('before').$type<{ day: string; night: string }>().notNull(),
  after: jsonb('after').$type<{ day: string; night: string }>().notNull(),
  editedBy: uuid('edited_by')
    .notNull()
    .references(() => users.id),
  editedAt: tstz('edited_at').notNull().defaultNow(),
  // admin · swap
  reason: text('reason').notNull(),
  note: text('note'),
})

// 3-7e: 의사 간 교환 요청 — 두 칩(날짜·D|N)의 주인을 맞바꾼다. 받는 사람이 수락하면 재검사 뒤 반영
export const doctorSwapRequests = pgTable(
  'doctor_swap_requests',
  {
    id: id(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => doctorMonthPlans.id),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id),
    targetId: uuid('target_id')
      .notNull()
      .references(() => users.id),
    // { date, slot } × 2: a = 요청자 칩, b = 받는 사람 칩
    chipA: jsonb('chip_a').$type<{ date: string; slot: 'D' | 'N' }>().notNull(),
    chipB: jsonb('chip_b').$type<{ date: string; slot: 'D' | 'N' }>().notNull(),
    comment: text('comment'),
    // SWAP_STATUSES (간호사와 같은 값)
    status: text('status').notNull(),
    closedReason: text('closed_reason'),
    createdAt: createdAt(),
    closedAt: tstz('closed_at'),
  },
  (t) => [
    index('doctor_swaps_plan_idx').on(t.planId, t.status),
    index('doctor_swaps_target_idx').on(t.targetId, t.status),
  ],
)
