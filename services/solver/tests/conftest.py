import os

# 테스트는 느린 CI에서도 결정적 시간으로 멈추게 한다(벽시계 안전장치에 먼저 걸리면 머신마다 다른 안이 나온다)
os.environ.setdefault("SOLVER_WALL_FACTOR", "10")
