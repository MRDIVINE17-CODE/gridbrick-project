"""Vercel serverless entry point: exposes the FastAPI app as a Python function.

vercel.json rewrites /api/* here; FastAPI receives the original path and routes it.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.main import app  # noqa: E402

__all__ = ["app"]
