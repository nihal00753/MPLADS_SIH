"""
Root runner for MPLADS Pipeline Tests.
Runs tests from tests/test_pipeline.py.
"""
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    test_path = Path(__file__).parent / "tests" / "test_pipeline.py"
    res = subprocess.run([sys.executable, str(test_path)])
    sys.exit(res.returncode)
