"""The CSV Jake imports into GHL, and the checks every lead passes first.

Each text is filled in for each lead. A lead with a blank in any of them is skipped
and listed with the reason, never sent a text with a hole in it. A curly quote in the
copy itself stops the whole export, because the fix belongs in the GHL workflow too.
"""

import csv
from datetime import datetime, timezone

from .text import is_gsm7, normalize_phone, render

COLUMNS = ["Company Name", "Phone", "City", "State", "service", "Timezone", "Website", "Tags"]

# Checked even before the texts exist, since every text is built from them.
BASE_FIELDS = "{{contact.company_name}} {{contact.city}} {{contact.service}}"


class TemplateError(Exception):
    pass


def _check_templates(messages):
    for i, text in enumerate(messages, 1):
        bad = sorted({ch for ch in text if not is_gsm7(ch)})
        if bad:
            shown = ", ".join(f"{ch!r} (U+{ord(ch):04X})" for ch in bad)
            raise TemplateError(f"Text {i} has characters outside GSM-7: {shown}. "
                                "Fix it here AND in the GHL workflow.")


def _row(lead, trade, batch):
    return {
        "Company Name": lead["company_name"], "Phone": lead["phone"], "City": lead["city"],
        "State": lead["state"], "service": lead["service"], "Timezone": lead["timezone"],
        "Website": (lead["website"] or "").split("?")[0], "Tags": f"{trade['tag']},{trade['trade']}-batch-{batch}",
    }


def _write(path, rows, columns):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        w.writerows(rows)


def export(con, trade, messages, out_dir, stamp=None, dry_run=False):
    _check_templates(messages)
    stamp = stamp or datetime.now().strftime("%Y%m%d_%H%M")
    checks = list(messages) + [BASE_FIELDS]
    placeholders = ",".join("?" * len(trade["keep_line_types"]))
    leads = con.execute(
        f"select * from leads where keep=1 and exported_at is null "
        f"and line_type in ({placeholders}) order by state, city",
        trade["keep_line_types"]).fetchall()

    good, skipped = [], []
    for lead in leads:
        fields = {k: lead[k] for k in ("company_name", "city", "state", "service")}
        reason = None
        for i, text in enumerate(checks, 1):
            filled, missing = render(text, fields)
            if missing:
                reason = f"blank: {', '.join(sorted(set(missing)))}"
                break
            if not is_gsm7(filled):
                odd = sorted({ch for ch in filled if not is_gsm7(ch)})
                reason = f"not GSM-7 after fill-in: {''.join(odd)!r}"
                break
        if reason:
            skipped.append({"Phone": lead["phone"], "Company Name": lead["company_name"],
                            "City": lead["city"], "reason": reason})
        else:
            good.append(_row(lead, trade, stamp[:8]))

    out_dir.mkdir(parents=True, exist_ok=True)
    result = {"csv": None, "skipped_csv": None, "count": len(good), "skipped": skipped}
    if skipped:
        result["skipped_csv"] = out_dir / f"{trade['trade']}_{stamp}_skipped.csv"
        _write(result["skipped_csv"], skipped, ["Phone", "Company Name", "City", "reason"])
    if not good:
        return result

    path = out_dir / f"{trade['trade']}_{stamp}.csv"
    _write(path, good, COLUMNS)
    result["csv"] = path
    if not dry_run:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with con:
            con.executemany("update leads set exported_at=?, export_file=? where phone=?",
                            [(now, path.name, r["Phone"]) for r in good])
    return result


def test_rows(trade, phones):
    """Rows for Jake's own numbers, filled with a made-up HVAC shop so every text renders."""
    rows = []
    for raw in phones:
        phone = normalize_phone(raw)
        if not phone:
            raise ValueError(f"Not a usable US mobile: {raw}")
        rows.append({
            "Company Name": "Test Heating & Cooling", "Phone": phone, "City": "Troy", "State": "MI",
            "service": trade["service_default"], "Timezone": "America/Detroit", "Website": "",
            "Tags": f"{trade['tag']},cold-sms-test",
        })
    return rows


def write_test_csv(trade, phones, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{trade['trade']}_TEST_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    _write(path, test_rows(trade, phones), COLUMNS)
    return path
