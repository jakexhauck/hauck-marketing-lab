import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildContractUpdate,
  cleanFileName,
  contractUpdateFromRead,
  emptyContractDto,
  isContractRead,
  isTenantContractPath,
  isoDateOrNull,
  toContractDto,
  type ContractRead,
} from "./clientContract";

const T = "1fd28dac-1e33-496f-8882-176c14623124";
const U = "0a6c1b0e-5d2f-4c1a-9f51-2b7a7e3c9d10";

const read = (over: Partial<ContractRead> = {}): ContractRead => ({
  isContract: true,
  lengthMonths: 6,
  startDate: "2026-09-01",
  endDate: "",
  monthlyFee: 2000,
  setupFee: null,
  payment: "Card, 1st of month",
  noticeDays: 30,
  autoRenew: "Month to month",
  adSpend: "",
  guarantee: "",
  clauses: ["Client owns the ad account."],
  ...over,
});

describe("isTenantContractPath", () => {
  it("accepts this tenant's own pdf", () => {
    expect(isTenantContractPath(T, `${T}/${U}.pdf`)).toBe(true);
  });
  it("refuses another tenant, traversal and non-pdf", () => {
    expect(isTenantContractPath(T, `${U}/${U}.pdf`)).toBe(false);
    expect(isTenantContractPath(T, `${T}/../${U}.pdf`)).toBe(false);
    expect(isTenantContractPath(T, `${T}/${U}.exe`)).toBe(false);
    expect(isTenantContractPath(T, 42)).toBe(false);
  });
});

describe("cleanFileName", () => {
  it("strips slashes and forces .pdf", () => {
    expect(cleanFileName("a/b\\c")).toBe("a b c.pdf");
    expect(cleanFileName("Deal.PDF")).toBe("Deal.PDF");
    expect(cleanFileName("")).toBe("Contract.pdf");
  });
});

describe("dates", () => {
  it("rejects impossible dates", () => {
    expect(isoDateOrNull("2026-02-30")).toBeNull();
    expect(isoDateOrNull("Sep 1, 2026")).toBeNull();
    expect(isoDateOrNull("2026-09-01")).toBe("2026-09-01");
  });
  it("adds months, clamping to month end", () => {
    expect(addMonths("2026-09-01", 6)).toBe("2027-03-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("contractUpdateFromRead", () => {
  it("works out the end from start + length when the contract does not state it", () => {
    expect(contractUpdateFromRead(read()).contract_end).toBe("2027-03-01");
  });
  it("keeps a stated end", () => {
    expect(contractUpdateFromRead(read({ endDate: "2027-02-15" })).contract_end).toBe("2027-02-15");
  });
  it("leaves unstated terms empty, never zero", () => {
    const u = contractUpdateFromRead(read({ lengthMonths: null, startDate: "" }));
    expect(u.contract_setup_fee).toBeNull();
    expect(u.contract_end).toBeNull();
    expect(u.contract_start).toBeNull();
  });
  it("drops out-of-range numbers", () => {
    expect(contractUpdateFromRead(read({ monthlyFee: -5 })).contract_monthly_fee).toBeNull();
  });
});

describe("isContractRead", () => {
  it("passes a full answer and fails a missing part", () => {
    expect(isContractRead(read())).toBe(true);
    const { guarantee: _g, ...rest } = read();
    expect(isContractRead(rest)).toBe(false);
    expect(isContractRead({ ...read(), monthlyFee: 19.5 })).toBe(false);
  });
});

describe("buildContractUpdate", () => {
  it("only touches keys that are present", () => {
    const r = buildContractUpdate({ monthlyFee: "2500" });
    expect(r).toEqual({ ok: true, update: { contract_monthly_fee: 2500 } });
  });
  it("blank clears", () => {
    const r = buildContractUpdate({ setupFee: "", endDate: "" });
    expect(r).toEqual({ ok: true, update: { contract_setup_fee: null, contract_end: null } });
  });
  it("refuses bad numbers and dates", () => {
    expect(buildContractUpdate({ noticeDays: "soon" }).ok).toBe(false);
    expect(buildContractUpdate({ startDate: "next week" }).ok).toBe(false);
    expect(buildContractUpdate({}).ok).toBe(false);
  });
});

describe("toContractDto", () => {
  it("maps an empty row like the empty record", () => {
    const dto = toContractDto({
      contract_file_path: "",
      contract_file_name: "",
      contract_uploaded_at: null,
      contract_read_at: null,
      contract_length_months: null,
      contract_start: null,
      contract_end: null,
      contract_monthly_fee: null,
      contract_setup_fee: null,
      contract_payment: "",
      contract_notice_days: null,
      contract_auto_renew: "",
      contract_ad_spend: "",
      contract_guarantee: "",
      contract_clauses: [],
    });
    expect(dto).toEqual(emptyContractDto());
  });
});
