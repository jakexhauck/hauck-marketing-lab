"""Phone numbers, business names, and keeping every text inside GSM-7.

One character outside GSM-7 (a curly apostrophe is the usual culprit) switches the
whole message to UCS-2, which drops a segment from 160 characters to 70 and roughly
triples what each text costs.
"""

import re

TOLL_FREE = {"800", "833", "844", "855", "866", "877", "888"}

GSM7 = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
    "^{}\\[~]|€"
)

REPLACEMENTS = {
    "‘": "'", "’": "'", "‚": "'", "′": "'", "´": "'", "`": "'",
    "“": '"', "”": '"', "„": '"', "″": '"',
    "–": "-", "—": "-", "‒": "-", "‐": "-", "‑": "-",
    "…": "...", " ": " ", " ": " ", "​": "", "•": "-",
    "\t": " ",
}

LEGAL_SUFFIX = re.compile(r"[,\s]+(llc|l\.l\.c\.|inc\.?|incorporated|corp\.?|co\.|ltd\.?)$", re.I)


def normalize_phone(raw):
    """US number to E.164, or None. Toll-free is None: it can never take a text."""
    digits = re.sub(r"\D", "", str(raw or ""))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return None
    if digits[0] in "01" or digits[3] in "01":
        return None
    if digits[:3] in TOLL_FREE:
        return None
    return "+1" + digits


def sanitize(text):
    return "".join(REPLACEMENTS.get(ch, ch) for ch in text or "")


def is_gsm7(text):
    return all(ch in GSM7 for ch in text)


def clean_name(name):
    out = sanitize(name or "").strip()
    while True:
        trimmed = LEGAL_SUFFIX.sub("", out).strip(" ,")
        if trimmed == out:
            return out
        out = trimmed


MERGE = re.compile(r"\{\{\s*contact\.([a-z_]+)\s*\}\}")


def render(template, lead):
    """(text, missing_fields). A missing field is one absent or blank on the lead."""
    missing = []

    def fill(m):
        value = str(lead.get(m.group(1)) or "").strip()
        if not value:
            missing.append(m.group(1))
        return value

    return MERGE.sub(fill, template), missing


def split_messages(raw):
    """messages.txt: texts separated by a line of ---. Lines starting with # are notes."""
    body = "\n".join(l for l in raw.splitlines() if not l.lstrip().startswith("#"))
    return [m.strip() for m in re.split(r"(?m)^\s*---\s*$", body) if m.strip()]
