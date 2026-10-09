// 1d 좌측 다크 패널. 2026-10-10 사용자 요청: 병원·간호부와 제목만 둔다(소개 문단·마감 안내 삭제)
export function LoginHero() {
  return (
    <div className="flex flex-col bg-ink p-14 text-white">
      <div className="text-sm text-ink-3">동부시립병원 · 간호부</div>
      <h1 className="my-auto text-[56px] leading-[1.1] font-extrabold tracking-[-0.03em]">
        벌써 근무표
        <br />짤 때가 됐어?
      </h1>
    </div>
  )
}
