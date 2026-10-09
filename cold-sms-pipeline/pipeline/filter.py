"""Keep or drop a Google Maps listing, and pick its sub-category.

Every category on the listing is read, not just the first: Google attaches up to ten,
and the trade's own one can sit last behind 'Service establishment' and 'Electrician'.
"""

import re


def _has_word(text, words):
    """Whole-word match, so 'air' does not fire on 'Fairview' or 'repair'."""
    for w in words:
        if re.search(rf"(?<![a-z]){re.escape(w)}(?![a-z])", text):
            return w
    return None


def judge(row, trade):
    """(keep, reason). The reason names the rule, so a dropped lead can be explained."""
    name = (row.get("title") or "").lower()
    cats = [c.strip().lower() for c in (row.get("categories") or []) if c and c.strip()]
    primary = (row.get("category") or (cats[0] if cats else "")).strip().lower()
    if primary and primary not in cats:
        cats.insert(0, primary)

    brand = _has_word(name, trade["franchises"])
    if brand:
        return False, f"franchise: {brand}"

    hit = _has_word(name, trade["name_deny"])
    if hit and not _has_word(name, trade["name_deny_unless"]):
        return False, f"name says {hit}"

    reviews = row.get("review_count") or 0
    if reviews > trade["max_reviews"]:
        return False, f"too big: {reviews} reviews"

    core = set(trade["core_categories"])
    if primary in core:
        return True, f"primary category: {primary}"

    # Primaries Google gives real installers with nothing else attached ('Door supplier'
    # alone): the name has to say the trade, and none of the categories may.
    if primary in trade.get("name_only_categories", []):
        bad = next((c for c in cats if c in trade.get("name_only_deny_categories", [])), None)
        if bad:
            return False, f"primary category {primary}, also {bad}"
        if not _has_word(name, trade["name_only_words"]):
            return False, f"primary category {primary}, name does not say the trade"
        return True, f"{primary} with {trade['trade']} name"

    if primary in trade["conditional_categories"]:
        if not any(c in core for c in cats):
            return False, f"primary category {primary}, no {trade['trade']} category"
        if not _has_word(name, trade["name_words"]):
            return False, f"primary category {primary}, name does not say the trade"
        return True, f"{primary} with {trade['trade']} name and category"

    return False, f"primary category: {primary or 'none'}"


def service_for(name, trade):
    lowered = (name or "").lower()
    for rule in trade["service_rules"]:
        if _has_word(lowered, rule["name_words"]):
            return rule["value"]
    return trade["service_default"]
