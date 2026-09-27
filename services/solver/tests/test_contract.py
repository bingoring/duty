import json
import shlex
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_contract_py가_JSON_Schema와_같다(tmp_path):
    """다르면 `pnpm --filter @duty/contract gen && pnpm --filter @duty/solver gen`."""
    gen = json.loads((ROOT / "package.json").read_text())["scripts"]["gen"]
    args = shlex.split(gen.replace("solver/contract.py", str(tmp_path / "contract.py")))
    subprocess.run(args, cwd=ROOT, check=True, capture_output=True)
    assert (tmp_path / "contract.py").read_text() == (ROOT / "solver" / "contract.py").read_text()
