ALTER TABLE "rule_versions" ADD COLUMN "soft_patterns" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- 3-10 11: 병동마다 최신 규칙 버전에 OFF-D-OFF·OFF-E-OFF·OFF-N-OFF가 금지 패턴으로 있으면
-- 금지 권고 패턴으로 옮긴 새 버전(최신 + 1)을 만든다. 수치·토글·필수/권고는 그대로 복사한다.
WITH latest AS (
  SELECT DISTINCT ON ("ward_id") *
  FROM "rule_versions"
  ORDER BY "ward_id", "version" DESC
), split AS (
  SELECT
    l.*,
    COALESCE(
      (SELECT jsonb_agg(e.value ORDER BY e.ord) FROM jsonb_array_elements_text(l."forbidden_patterns") WITH ORDINALITY AS e(value, ord)
        WHERE e.value NOT IN ('OFF-D-OFF', 'OFF-E-OFF', 'OFF-N-OFF')),
      '[]'::jsonb
    ) AS kept,
    COALESCE(
      (SELECT jsonb_agg(e.value ORDER BY e.ord) FROM jsonb_array_elements_text(l."forbidden_patterns") WITH ORDINALITY AS e(value, ord)
        WHERE e.value IN ('OFF-D-OFF', 'OFF-E-OFF', 'OFF-N-OFF')),
      '[]'::jsonb
    ) AS moved
  FROM latest l
)
INSERT INTO "rule_versions" ("ward_id", "version", "params", "toggles", "forbidden_patterns", "soft_patterns", "severity", "diff", "changed_by")
SELECT
  s."ward_id",
  s."version" + 1,
  s."params",
  s."toggles",
  s.kept,
  s.moved,
  s."severity",
  jsonb_build_array(
    jsonb_build_object(
      'key', 'softPatterns',
      'before', '',
      'after', (SELECT string_agg(v, ', ' ORDER BY o) FROM jsonb_array_elements_text(s.moved) WITH ORDINALITY AS t(v, o))
    ),
    jsonb_build_object(
      'key', 'forbiddenPatterns',
      'before', COALESCE((SELECT string_agg(v, ', ' ORDER BY o) FROM jsonb_array_elements_text(s."forbidden_patterns") WITH ORDINALITY AS t(v, o)), ''),
      'after', COALESCE((SELECT string_agg(v, ', ' ORDER BY o) FROM jsonb_array_elements_text(s.kept) WITH ORDINALITY AS t(v, o)), '')
    )
  ),
  NULL
FROM split s
WHERE jsonb_array_length(s.moved) > 0;
