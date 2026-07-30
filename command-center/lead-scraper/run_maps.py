"""gosom wrapper. Native binary preferred, Docker fallback. Reads gosom's log to
estimate a block/failure rate so the coordinator can back off when Google throttles.

Verbatim from the SOP, with the Windows binary name handled so the same runner works
on the Mac and the PC.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

WD = Path(__file__).resolve().parent
DATA = WD / "data"
_EXE = ".exe" if sys.platform == "win32" else ""
NATIVE_BIN = Path(os.environ.get("GOSOM_BIN") or (Path.home() / "go" / "bin" / f"google-maps-scraper{_EXE}"))
DOCKER_IMAGE = "gosom/google-maps-scraper"
BLOCK_MARKERS = ("consent", "captcha", "unusual traffic", "/sorry/", "rate limit", "429")


def engine():
    env = os.environ.get("LEADS_ENGINE")
    if env in ("native", "docker"):
        return env
    s = DATA / ".engine"
    if s.exists() and s.read_text().strip() in ("native", "docker"):
        return s.read_text().strip()
    return "docker"


def engine_available():
    """(ok, message) so the coordinator can fail loudly instead of silently empty."""
    if engine() == "native":
        if NATIVE_BIN.is_file():
            return True, f"native: {NATIVE_BIN}"
        return False, (
            f"gosom binary not found at {NATIVE_BIN}. Install it with:\n"
            "  go install github.com/gosom/google-maps-scraper@latest\n"
            "or switch to Docker: echo docker > data/.engine"
        )
    try:
        subprocess.run(["docker", "image", "inspect", DOCKER_IMAGE],
                       capture_output=True, timeout=30, check=True)
        return True, f"docker: {DOCKER_IMAGE}"
    except Exception:
        return False, (
            f"Docker image {DOCKER_IMAGE} not available. Pull it with:\n"
            f"  docker pull {DOCKER_IMAGE}\n"
            "or install the native binary and: echo native > data/.engine"
        )


def _analyze(stderr):
    finished = stderr.count('"message":"job finished"')
    failed = stderr.count('"status":"failed"') + stderr.count('"level":"error"')
    blocked = sum(stderr.lower().count(m) for m in BLOCK_MARKERS)
    total = max(finished + failed, 1)
    return {"jobs_finished": finished, "jobs_failed": failed,
            "blocked_signals": blocked, "failure_rate": round((failed + blocked) / total, 3)}


def _count_records(path):
    try:
        text = path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return 0
    if not text:
        return 0
    if text.startswith("["):
        try:
            return len(json.loads(text))
        except json.JSONDecodeError:
            return 0
    return sum(1 for l in text.splitlines() if l.strip().startswith("{"))


def run_gmaps(queries, out_name, depth=10, concurrency=4, inactivity="2m",
              lang="en", proxies=None):
    in_path = DATA / (re.sub(r"\.(csv|json)$", "", out_name) + ".queries.txt")
    out_path = DATA / out_name
    in_path.parent.mkdir(parents=True, exist_ok=True)
    in_path.write_text("\n".join(queries) + "\n")
    if out_path.exists():
        out_path.unlink()

    if engine() == "native":
        cmd = [str(NATIVE_BIN), "-input", str(in_path), "-results", str(out_path)]
    else:
        cmd = ["docker", "run", "--rm", "-v", f"{DATA}:/data", DOCKER_IMAGE,
               "-input", f"/data/{in_path.name}", "-results", f"/data/{out_path.name}"]
    cmd += ["-depth", str(depth), "-c", str(concurrency),
            "-exit-on-inactivity", inactivity, "-lang", lang, "-json"]
    if proxies:
        cmd += ["-proxies", proxies]

    timeout = 120 + len(queries) * 90
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        err = (proc.stderr or "") + (proc.stdout or "")
        ok = proc.returncode == 0
    except subprocess.TimeoutExpired as e:
        err = (e.stderr or "") if isinstance(e.stderr, str) else ""
        ok = False

    stats = _analyze(err)
    return {"ok": ok, "path": str(out_path),
            "rows": _count_records(out_path) if out_path.exists() else 0, **stats}
