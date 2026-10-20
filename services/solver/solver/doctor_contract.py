"""의사 솔버(`POST /solve/doctor`) 입출력 계약. SoT는 packages/contract/src/doctor.ts — 손으로 맞춘다."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, RootModel

IsoDate = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
RuleShift = Literal["D", "N", "ANY"]
RequestOption = Literal["D", "N", "O", "ALLDAY"]
TermKey = Literal[
    "requestMiss", "requestMissMax", "allDayOut", "pattern", "fixedMiss", "countDev", "tieBreak"
]
Severity = Literal["hard", "soft"]
PatternToken = Literal["D", "N", "AD", "O"]
NonNegInt = Annotated[int, Field(ge=0)]


class DoctorFixed(BaseModel):
    date: IsoDate
    shift: RuleShift
    type: Literal["require", "forbid"]


class DoctorRequest(BaseModel):
    date: IsoDate
    options: Annotated[list[RequestOption], Field(min_length=1)]


class DoctorSolverDoctor(BaseModel):
    id: str
    dCount: NonNegInt
    nCount: NonNegInt
    allDayMin: NonNegInt | None
    allDayMax: NonNegInt | None
    fixed: list[DoctorFixed]
    requests: list[DoctorRequest]
    # 3-11 8: 재직 기간. 밖의 날에는 배정하지 않는다
    employedFrom: IsoDate | None = None
    employedTo: IsoDate | None = None


class DoctorSeverity(BaseModel):
    # 3-11 6/7: 기본값 = 3-11 이전 동작
    COUNT: Severity = "hard"
    FIXED: Severity = "hard"
    ALLDAY_RANGE: Severity = "soft"
    REQUEST: Severity = "soft"


class DoctorPattern(BaseModel):
    pattern: Annotated[list[PatternToken], Field(min_length=2, max_length=4)]
    severity: Severity


class DoctorPrevShift(BaseModel):
    date: IsoDate
    day: str | None
    night: str | None


class DoctorSolverRequest(BaseModel):
    contractVersion: Literal[1]
    seed: NonNegInt
    timeLimitSec: Annotated[float, Field(gt=0, le=60)]
    days: Annotated[list[IsoDate], Field(min_length=28, max_length=31)]
    doctors: Annotated[list[DoctorSolverDoctor], Field(min_length=1)]
    severity: DoctorSeverity = DoctorSeverity()
    patterns: list[DoctorPattern] = []
    prevShifts: Annotated[list[DoctorPrevShift], Field(max_length=3)] = []


class DoctorSolverShift(BaseModel):
    date: IsoDate
    day: str
    night: str


class DoctorObjective(BaseModel):
    total: int
    terms: dict[TermKey, int]


class DoctorSolved(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE"]
    shifts: list[DoctorSolverShift]
    objective: DoctorObjective
    wallTimeSec: float
    seed: int
    solverVersion: str


class DoctorCause(BaseModel):
    kind: Literal["COUNT", "FIXED", "REQUEST", "ALLDAY_RANGE", "PATTERN"]
    userId: str | None = None
    date: IsoDate | None = None


class DoctorInfeasible(BaseModel):
    status: Literal["INFEASIBLE"]
    causes: list[DoctorCause]
    wallTimeSec: float


class DoctorUnknown(BaseModel):
    status: Literal["UNKNOWN"]
    wallTimeSec: float


DoctorResult = Annotated[DoctorSolved | DoctorInfeasible | DoctorUnknown, Field(discriminator="status")]


class DoctorSolverResponse(RootModel[DoctorResult]):
    pass
