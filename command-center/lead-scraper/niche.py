"""Deny-first scored classifier. Hard drops (deny terms on the NAME and on EVERY
category, off-niche primaries, franchise-scale review counts, toll-free) are checked
first; survivors are scored; EXPORT_THRESHOLD gates the exporter. A bare category
match can never reach the threshold by construction.

Rejecting is only half of it. A deny list can only name what it has already thought
of, so on 2026-08-20 the table was filling with dentists, opticians and self-storage:
businesses no list happens to mention, carried in by the three signals every living
Google listing has. Two gates at the end of classify() ask the opposite question, and
they are deliberately separate:

    kept     needs a niche signal   - a core category OR a trade word in the name
    exported needs a core category  - GOOGLE has to call them the trade, not just
                                      their own signage

That is why "Faso Window Tinting" is stored and never texted: it carries the word
window, and Google calls it a window tinting service, which is not a window.

This is the SOP's niche.py with one change, and only one: the word lists are loaded
from a niche definition in niches/ instead of being hardcoded at module level, so a
new niche is data rather than code. The machine below (deny order, the name-and-every-
category scan, the category-only venue rule, the whole-word guards, the scoring
weights, the threshold) is unchanged.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

NICHES_DIR = Path(__file__).resolve().parent / "niches"
DEFAULT_NICHE = "home_services"


class Niche:
    """One niche's word lists, with the deny regexes compiled once."""

    def __init__(self, spec: dict):
        self.id = spec.get("id") or "unnamed"
        self.label = spec.get("label") or self.id
        self.export_threshold = int(spec.get("export_threshold", 50))
        self.max_reviews = int(spec.get("max_reviews", 120))

        self.keywords = tuple(spec.get("keywords") or ())

        # Recurring-service look-alikes -> hard drop, reported separately from the
        # general deny list (the SOP's MOW_DENY).
        self.recurring_deny = tuple(spec.get("recurring_deny") or ())

        # Off-niche: retail/supply, unrelated trades, venues, look-alike categories.
        # Scanned on the name AND every category.
        self.deny = tuple(spec.get("deny") or ())

        # Venue words only make sense as a CATEGORY ("Coffee County Roofing" is a
        # fine NAME). These deny on category but not on the name.
        self.category_only = frozenset(spec.get("category_only") or ())
        self.name_deny = tuple(t for t in self.deny if t not in self.category_only)

        # Ambiguous short words: require a whole-word match.
        self.whole_word = frozenset(spec.get("whole_word") or ())

        # A broad category denied unless it carries the narrower form that means
        # our work (the SOP's "architect but not landscape architect" rule).
        self.category_unless = tuple(
            (str(rule.get("deny") or ""), tuple(rule.get("unless") or ()))
            for rule in (spec.get("category_unless") or ())
            if rule.get("deny")
        )

        # Any of these in the PRIMARY category -> hard drop (off-niche business class).
        self.primary_deny = tuple(spec.get("primary_deny") or ())

        # Core categories: primary match +40, secondary +30 (not stacked).
        self.allow_core = tuple(spec.get("allow_core") or ())

        # Compound name signals: +15 each, capped at +30. Stored as {key: aliases}
        # so that variants of one idea ("roof"/"roofing") cannot double-count, which
        # is what the SOP's design build / design-build collapse did.
        raw_signals = spec.get("name_signals") or {}
        if isinstance(raw_signals, dict):
            self.name_signals = {k: tuple(v) for k, v in raw_signals.items()}
        else:  # a plain list is allowed; each term is its own key
            self.name_signals = {t: (t,) for t in raw_signals}

        # Weak name signals: +5 total.
        self.weak_signals = tuple(spec.get("weak_signals") or ())

        self._deny_re: dict[str, re.Pattern] = {}
        for term in self.recurring_deny + self.deny:
            self._deny_re[term] = re.compile(
                r"\b" + re.escape(term) + (r"\b" if term in self.whole_word else "")
            )

    def deny_hit(self, text: str, terms) -> str | None:
        for t in terms:
            pattern = self._deny_re.get(t)
            if pattern and pattern.search(text):
                return t
        return None


# Lists a child ADDS to rather than replaces. These are the machine: the venue
# words, the whole-word guards, the retail and off-trade rejections. Every trade
# wants all of them plus its own, so inheriting them means one place to fix a hole.
#
# Everything else (keywords, allow_core, name_signals, weak_signals) is what makes
# a trade that trade, so a child replaces it outright.
INHERITED_LISTS = (
    "deny", "recurring_deny", "category_only", "whole_word",
    "primary_deny", "category_unless",
)


def _resolve_spec(spec: dict, seen: tuple = ()) -> dict:
    """Fold a niche's `extends` parent into it.

    Shallow by design: a niche extends at most a shared base, and a base that
    extends a base is a structure nobody needs and everybody would misread.
    """
    parent_id = spec.get("extends")
    if not parent_id:
        return spec
    if parent_id in seen:
        raise ValueError(f"niche {spec.get('id')!r} extends itself via {parent_id!r}")

    parent_path = NICHES_DIR / f"{parent_id}.json"
    if not parent_path.is_file():
        raise FileNotFoundError(f"niche {spec.get('id')!r} extends missing base {parent_id!r}")
    parent = _resolve_spec(
        json.loads(parent_path.read_text(encoding="utf-8")), seen + (parent_id,)
    )

    merged = {**parent, **spec}
    for key in INHERITED_LISTS:
        base, own = parent.get(key) or [], spec.get(key) or []
        if not base and not own:
            continue
        if key == "category_unless":
            # Dicts, so de-duplicate on the broad term the rule is about.
            by_term = {r.get("deny"): r for r in base}
            by_term.update({r.get("deny"): r for r in own})
            merged[key] = list(by_term.values())
        else:
            merged[key] = list(dict.fromkeys([*base, *own]))

    # Inheritance is a union, which is right for every trade but one. 'garage door'
    # is in the shared deny SO THAT no other trade picks those firms up, and Google
    # files most of them as a garage door SUPPLIER, a word that everywhere else means
    # a counter with a showroom. A trade that IS the excluded thing has to be able to
    # say so. Narrow on purpose: it subtracts from deny only, and a term that was
    # never inherited is not an error.
    remove = set(spec.get("deny_remove") or ())
    if remove:
        merged["deny"] = [t for t in merged.get("deny") or [] if t not in remove]
    merged.pop("deny_remove", None)
    merged.pop("extends", None)
    return merged


def load_niche(name: str | None = None) -> Niche:
    """Load a niche by id from niches/, or from a path, or from a raw dict."""
    name = name or os.environ.get("LEADS_NICHE") or DEFAULT_NICHE
    path = Path(name)
    if not path.is_file():
        path = NICHES_DIR / f"{name}.json"
    if not path.is_file():
        raise FileNotFoundError(f"no niche definition for {name!r} (looked in {NICHES_DIR})")
    return Niche(_resolve_spec(json.loads(path.read_text(encoding="utf-8"))))


def niche_from_spec(spec: dict) -> Niche:
    """Build a niche straight from a dict, for definitions handed over by the app."""
    return Niche(spec)


def available_niches() -> list[dict]:
    """The niches a run can actually use. A leading underscore marks a base that
    exists to be extended, not chosen, so it never reaches the wizard."""
    out = []
    for p in sorted(NICHES_DIR.glob("*.json")):
        if p.stem.startswith("_"):
            continue
        try:
            spec = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        out.append({"id": spec.get("id") or p.stem, "label": spec.get("label") or p.stem})
    return out


ACTIVE = load_niche()
EXPORT_THRESHOLD = ACTIVE.export_threshold


def _has(text: str, signals) -> str | None:
    for s in signals:
        if s in text:
            return s
    return None


def phone_type_of(e164: str) -> str:
    """'toll_free' | 'other' | 'unknown' for an E.164 number."""
    try:
        import phonenumbers

        num = phonenumbers.parse(e164, "US")
        if phonenumbers.number_type(num) == phonenumbers.PhoneNumberType.TOLL_FREE:
            return "toll_free"
        return "other"
    except Exception:
        return "unknown"


def classify(
    name,
    primary_category="",
    all_categories=(),
    review_count=None,
    rating=None,
    website=None,
    phone_type=None,
    certified=False,
    niche: Niche | None = None,
):
    """Return (score, flags, verdict). verdict in {'drop','pass','low'}."""
    n = niche or ACTIVE
    nm = (name or "").lower()
    primary = (primary_category or "").lower()
    cats = [primary] if primary else []
    for c in all_categories or ():
        c = (c or "").lower().strip()
        if c and c not in cats:
            cats.append(c)

    flags: list[str] = []

    # --- HARD DROPS ---
    # Deny terms are checked against the NAME and against EVERY category, not just
    # the primary. This is the step that keeps the database clean.
    for label, text, terms in [("name", nm, n.name_deny)] + [("category", c, n.deny) for c in cats]:
        recurring = n.deny_hit(text, n.recurring_deny)
        if recurring:
            return 0, [f"exclude:{recurring}@{label}"], "drop"
        deny = n.deny_hit(text, terms)
        if deny:
            return 0, [f"deny:{deny}@{label}"], "drop"

    # A broad category is denied unless it carries the narrower form.
    for broad, exceptions in n.category_unless:
        for c in cats:
            if broad in c and not any(x in c for x in exceptions):
                return 0, [f"deny:{broad}@category"], "drop"

    off = _has(primary, n.primary_deny)
    if off:
        return 0, [f"primary_off_niche:{off}"], "drop"

    if review_count is not None and review_count > n.max_reviews:
        return 0, [f"reviews_gt_{n.max_reviews}"], "drop"

    if phone_type == "toll_free":
        return 0, ["toll_free"], "drop"

    # --- SCORING ---
    score = 0

    core_primary = _has(primary, n.allow_core)
    core_secondary = None
    if core_primary:
        score += 40
        flags.append(f"core_primary:{core_primary}")
    else:
        for c in cats[1:] if primary else cats:
            core_secondary = _has(c, n.allow_core)
            if core_secondary:
                score += 30
                flags.append(f"core_secondary:{core_secondary}")
                break

    sigs: list[str] = []
    for key, aliases in n.name_signals.items():
        if key in sigs:
            continue
        if any(alias in nm for alias in aliases):
            sigs.append(key)
    if sigs:
        score += min(15 * len(sigs), 30)
        flags += [f"name:{s}" for s in sigs]

    weak = [s for s in n.weak_signals if s in nm]
    if weak:
        score += 5
        flags.append("weak:" + ",".join(weak))
        if not core_primary and not core_secondary and not sigs:
            flags.append("weak_only")

    if review_count is not None and 1 <= review_count <= 80:
        score += 15
        flags.append("reviews_1_80")

    if rating is not None and float(rating) >= 4.3:  # 5.0 included on purpose
        score += 10
        flags.append("rating_4.3_up")

    if (website or "").strip():
        score += 10
        flags.append("website")
    elif not review_count and rating is None:
        score -= 15
        flags.append("no_web_no_reviews")

    if certified:
        score += 20
        flags.append("certified_directory")

    # --- THE NICHE SIGNAL GATE ---
    # Everything above this line only ever REJECTED. Nothing asked the row to look
    # like the trade, so on 2026-08-20 the table was filling with dentists, welders
    # and self-storage: businesses no deny list happens to name, carried in by the
    # three signals every living Google listing has (a review count, a rating and a
    # website, worth 35 together). Two rules close it, and they are deliberately
    # separate, because "worth storing" and "worth texting" are different questions.
    core_matched = bool(core_primary or core_secondary)

    # 1. To be KEPT at all, something has to say the trade: a core category, or a
    #    trade word in the name. Weak words ("home", "services", "pro") are noise
    #    every trade shares and can never carry a row on their own.
    if not core_matched and not sigs:
        return 0, flags + ["no_niche_signal"], "drop"

    # 2. To be EXPORTED, GOOGLE has to say the trade. A name word is confidence, not
    #    evidence: "Faso Window Tinting" and "Lowell's Stained Glass Studio" both
    #    carry the word window or glass and neither one fits a window. Their rows are
    #    still stored and still enriched; they simply cannot reach a list.
    if score >= n.export_threshold and not core_matched:
        return score, flags + ["no_core_category"], "low"

    verdict = "pass" if score >= n.export_threshold else "low"
    return score, flags, verdict


def is_kept(verdict):
    return verdict != "drop"  # 'low' rows are stored; the exporter gates on score
