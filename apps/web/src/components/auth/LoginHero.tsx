// 1d 좌측 다크 패널. 하단 수치는 현재 규칙에서 렌더링한다(핸드오프 S7·S11 "하드코딩 금지").
export function LoginHero({
  requestDeadlineDay,
  negotiationEndDay,
}: {
  requestDeadlineDay: number
  negotiationEndDay: number
}) {
  return (
    <div className="flex flex-col justify-between bg-ink p-14 text-white">
      <div className="text-sm text-ink-3">동부시립병원 · 간호부</div>
      <div className="flex flex-col gap-[18px]">
        <h1 className="text-[56px] leading-[1.1] font-extrabold tracking-[-0.03em]">
          벌써 근무표
          <br />짤 때가 됐어?
        </h1>
        <p className="m-0 max-w-[460px] text-base leading-[1.6] text-ink-5">
          오프 신청부터 듀티 생성, 누적 오프·잔여 나이트 정산까지. 규칙은 시스템이 지키고, 간호사는 근무만
          확인하시면 됩니다.
        </p>
      </div>
      <div className="flex gap-6 text-[13px] text-ink-3">
        <span>오프 신청 마감 매월 {requestDeadlineDay}일</span>
        <span>협의 수정 ~{negotiationEndDay}일</span>
      </div>
    </div>
  )
}
