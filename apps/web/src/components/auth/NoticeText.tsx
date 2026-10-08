import type { NoticeSection } from '@/server/privacy/notice'

// 동의서 항목 표 (동의 화면 펼치기·/privacy 공용)
export function NoticeText({ section }: { section: NoticeSection }) {
  return (
    <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[13px] leading-[1.55]">
      {section.rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="font-semibold text-ink-2">{r.label}</dt>
          <dd>{r.text}</dd>
        </div>
      ))}
    </dl>
  )
}
