# 듀티 생성 솔버 (Build Spec 2-6 business-logic-model §6)
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY solver ./solver
RUN useradd --system solver
USER solver
EXPOSE 8100
CMD ["/app/.venv/bin/uvicorn", "solver.app:app", "--host", "0.0.0.0", "--port", "8100"]
