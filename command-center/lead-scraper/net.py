"""One HTTPS opener for the whole runner.

The SOP calls urllib.request.urlopen directly. On a python.org install of Python
for macOS that fails against Supabase with CERTIFICATE_VERIFY_FAILED, because that
build ships without the system root certificates wired up. The usual advice is to
run "Install Certificates.command", which edits the machine; doing it here instead
means the runner works the same on Jake's Mac, his PC, and anything else, without
either of them having to be prepared first.

certifi is preferred when present and the system store is the fallback, so this
never makes verification weaker. Certificates are always verified.
"""

from __future__ import annotations

import ssl
import urllib.request


def _build_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        # Fine on Linux and on a Homebrew Python, where the system store is wired
        # up already. Still a verifying context either way.
        return ssl.create_default_context()


SSL_CONTEXT = _build_context()


def urlopen(req, timeout: int = 60):
    """urllib.request.urlopen with our verified context. Same signature, same
    exceptions, so callers read exactly as the SOP wrote them."""
    return urllib.request.urlopen(req, timeout=timeout, context=SSL_CONTEXT)
