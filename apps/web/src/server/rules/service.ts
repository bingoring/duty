import {
  RULE_PARAM_LIMITS,
  RULE_TOGGLE_DEFS,
  RuleSetSchema,
  diffRuleSets,
  normalizePattern,
  validateRuleSet,
  type RuleDiff,
  type RuleSet,
} from '@duty/domain'
import { desc, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { monthPlans, ruleVersions, users } from '../db/schema'
import { ensureWard } from '../seed/core'
import { todaySeoul } from '../schedule/month'
import type { FieldErrors } from '../admin/schemas'

// Build Spec 2-4 business-rules §1.2 — S11 규칙 설정
export type RuleHistoryItem = { version: number; date: string; who: string; lines: string[] }
export type RuleEditor = {
  rules: RuleSet
  version: number
  applyFromMonth: number
  history: RuleHistoryItem[]
}

const LABEL: Record<string, string> = {
  ...Object.fromEntries(RULE_PARAM_LIMITS.map((l) => [l.key, l.label])),
  negotiationStartDay: '협의 수정 기간 시작',
  negotiationEndDay: '협의 수정 기간 끝',
  ...Object.fromEntries(RULE_TOGGLE_DEFS.map((t) => [t.key, t.label])),
  forbiddenPatterns: '금지 패턴',
}
const show = (v: unknown) => (v === true ? '켜짐' : v === false ? '꺼짐' : String(v))
const line = (d: RuleDiff) => `${LABEL[d.key] ?? d.key} ${show(d.before)} → ${show(d.after)}`

const parse = (r: typeof ruleVersions.$inferSelect): RuleSet =>
  RuleSetSchema.parse({ params: r.params, toggles: r.toggles, forbiddenPatterns: r.forbiddenPatterns })

export async function loadRuleEditor(db: Db, today: string): Promise<RuleEditor> {
  const rows = await db.select().from(ruleVersions).orderBy(desc(ruleVersions.version))
  const names = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  )
  const latest = rows[0]
  const plans = await db
    .select({ year: monthPlans.year, month: monthPlans.month })
    .from(monthPlans)
    .where(inArray(monthPlans.status, ['DRAFTING', 'CONFIRMED', 'CLOSED']))
  // R-RULE-APPLY-1: 생성 중·확정·마감 계획이 있는 가장 늦은 달 + 1, 없으면 오늘의 다음 달
  const last = plans.reduce(
    (m, p) => Math.max(m, p.year * 12 + p.month - 1),
    Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1,
  )
  const applyFromMonth = ((last + 1) % 12) + 1
  return {
    rules: latest ? parse(latest) : RuleSetSchema.parse({}),
    version: latest?.version ?? 0,
    applyFromMonth,
    history: rows.map((r) => ({
      version: r.version,
      date: todaySeoul(r.changedAt).slice(5).replace('-', '/'),
      who: r.changedBy ? (names.get(r.changedBy) ?? '') : '',
      lines: r.diff.length ? r.diff.map(line) : ['초기 설정'],
    })),
  }
}

export type SaveResult = { ok: true; version: number } | { ok: false; errors?: FieldErrors; message?: string }

export async function saveRules(
  db: Db,
  input: { rules: RuleSet; baseVersion: number },
  adminId: string,
): Promise<SaveResult> {
  const patterns = [...new Set(input.rules.forbiddenPatterns.map(normalizePattern))]
  const rules: RuleSet = { ...input.rules, forbiddenPatterns: patterns }
  const errors = validateRuleSet(rules)
  if (errors.length) return { ok: false, errors: Object.fromEntries(errors.map((e) => [e.key, e.message])) }
  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select()
      .from(ruleVersions)
      .orderBy(desc(ruleVersions.version))
      .limit(1)
      .for('update')
    if ((latest?.version ?? 0) !== input.baseVersion)
      return {
        ok: false as const,
        message: '다른 관리자가 먼저 저장했습니다. 새로고침 후 다시 저장해 주세요.',
      }
    const diff = latest ? diffRuleSets(parse(latest), rules) : []
    if (latest && diff.length === 0) return { ok: false as const, message: '바뀐 항목이 없습니다.' }
    const version = (latest?.version ?? 0) + 1
    await tx.insert(ruleVersions).values({
      wardId: latest?.wardId ?? (await ensureWard(tx)),
      version,
      params: rules.params,
      toggles: rules.toggles,
      forbiddenPatterns: rules.forbiddenPatterns,
      diff,
      changedBy: adminId,
    })
    return { ok: true as const, version }
  })
}
