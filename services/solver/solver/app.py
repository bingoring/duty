"""무상태 솔버 HTTP 서비스 (Build Spec 2-6 business-logic-model §6). DB·인증 없음, 내부망 전용."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool

from .contract import SolverRequest, SolverResponse
from .model import VERSION, solve

app = FastAPI(title="duty-solver", version=VERSION)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "version": VERSION}


@app.post("/solve")
async def solve_endpoint(req: SolverRequest) -> dict:
    # CP-SAT는 C++ 안에서 돌므로 스레드 풀로 보내 이벤트 루프를 막지 않는다
    out = await run_in_threadpool(solve, req.model_dump(mode="json"))
    return SolverResponse.model_validate(out).model_dump(mode="json", exclude_none=True)
