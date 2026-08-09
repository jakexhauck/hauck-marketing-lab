import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FUNNEL_CAPI,
  buildUserData,
  normEmail,
  normName,
  normPhone,
  normState,
  normZip,
  originAllowedForFunnel,
  sendLeadEvent,
} from "./metaCapi";

// Hash vectors below are real SHA-256 of the NORMALISED string, computed with
// node's crypto. They are written out rather than recomputed in the test, so a
// change to the normaliser fails here instead of quietly agreeing with itself.
const H = {
  email: "a4a33fb476d25b62a1bde81d420ac0af98b5cb1d1d0cdefbf47006cc5530f622", // judy@example.com
  phone: "84dc9e7ca6de56058a4a1c69812f2b9f5fb15c975c6fe627efa042addb29b024", // 17348468788
  first: "71db428976f15f4fcbf4c2179ab12952a014124b557cb58f9b431666f7c7924f", // judy
  last: "a5dd5a83df0f496d4973db9b2d8e55b4750c56c933d82d3e0ea7c9c2adb4f63c", // bushey
  city: "448b2277471ee1c1f70f0fc8af31d44e178c57a10964ea5ced015a2b7e3eacc4", // westland
  state: "eee1c1ade6525d2463185a68156723b98306835f88a8d988c82fcf6d8baf85da", // mi
  zip: "47b00684ebe025c07475cbaabba524b7ed59eea55e06df340f6cdd79b0e8c2f5", // 48185
  country: "79adb2a2fce5c6ba215fe5f27f532d4e7edbac4b6a5e09e1ef3a08084a904621", // us
};

describe("normalisers", () => {
  it("lowercases and trims an email", () => {
    expect(normEmail("  Judy@Example.COM ")).toBe("judy@example.com");
  });

  it("prefixes a bare ten-digit US number with its country code", () => {
    expect(normPhone("(734) 846-8788")).toBe("17348468788");
  });

  it("leaves an already-prefixed number alone", () => {
    expect(normPhone("+1 734 846 8788")).toBe("17348468788");
  });

  it("strips punctuation and spaces out of a name", () => {
    expect(normName("Mary-Anne")).toBe("maryanne");
    expect(normName(" O'Brien ")).toBe("obrien");
  });

  it("drops the +4 from a US zip", () => {
    expect(normZip("48185-1234")).toBe("48185");
  });

  it("does not truncate a spelled-out state into a different one", () => {
    // "Minnesota" must never become "mi", which is Michigan.
    expect(normState("Minnesota")).toBe("minnesota");
    expect(normState("MI")).toBe("mi");
  });
});

describe("buildUserData", () => {
  const who = {
    email: "Judy@Example.com",
    phone: "(734) 846-8788",
    firstName: "Judy",
    lastName: "Bushey",
    city: "Westland",
    state: "MI",
    zip: "48185",
    country: "US",
  };

  it("hashes every identifying field, as a one-element array", async () => {
    const ud = await buildUserData(who, {});
    expect(ud.em).toEqual([H.email]);
    expect(ud.ph).toEqual([H.phone]);
    expect(ud.fn).toEqual([H.first]);
    expect(ud.ln).toEqual([H.last]);
    expect(ud.ct).toEqual([H.city]);
    expect(ud.st).toEqual([H.state]);
    expect(ud.zp).toEqual([H.zip]);
    expect(ud.country).toEqual([H.country]);
  });

  it("OMITS a missing field rather than sending the hash of an empty string", async () => {
    // The hash of "" is a real constant, so sending it would make every lead
    // that is missing a field match every other one on that field.
    const ud = await buildUserData({ email: "judy@example.com" }, {});
    expect(ud.em).toEqual([H.email]);
    expect("ph" in ud).toBe(false);
    expect("zp" in ud).toBe(false);
  });

  it("passes the click and browser ids through UNHASHED", async () => {
    const ud = await buildUserData(who, {
      fbc: "fb.1.1786000000000.IwAR-abc",
      fbp: "fb.1.1786000000000.1234567890",
      ip: "2600:1007:b20a::1",
      userAgent: "Mozilla/5.0 (Linux; Android 16)",
    });
    expect(ud.fbc).toBe("fb.1.1786000000000.IwAR-abc");
    expect(ud.fbp).toBe("fb.1.1786000000000.1234567890");
    expect(ud.client_ip_address).toBe("2600:1007:b20a::1");
    expect(ud.client_user_agent).toBe("Mozilla/5.0 (Linux; Android 16)");
  });
});

describe("originAllowedForFunnel", () => {
  const willis = FUNNEL_CAPI.willis;

  it("accepts the client's own domain", () => {
    expect(originAllowedForFunnel("https://williswindows.com", willis)).toBe(true);
    expect(originAllowedForFunnel("https://www.williswindows.com", willis)).toBe(true);
  });

  it("refuses a stranger, a lookalike and a missing Origin", () => {
    expect(originAllowedForFunnel("https://evil.example", willis)).toBe(false);
    expect(originAllowedForFunnel("https://williswindows.com.evil.example", willis)).toBe(false);
    expect(originAllowedForFunnel("http://williswindows.com", willis)).toBe(false);
    expect(originAllowedForFunnel(null, willis)).toBe(false);
  });
});

describe("sendLeadEvent", () => {
  afterEach(() => vi.unstubAllGlobals());

  function capture(response: unknown, ok = true, status = 200) {
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return {
        ok,
        status,
        json: async () => response,
      } as unknown as Response;
    });
    return calls;
  }

  const input = {
    eventId: "evt-1",
    eventTime: 1786297000,
    sourceUrl: "https://williswindows.com/quote",
    who: { email: "judy@example.com" },
    signals: { fbp: "fb.1.1.2" },
  };

  it("posts a Lead to the funnel's own pixel", async () => {
    const calls = capture({ events_received: 1, fbtrace_id: "tr-1" });
    const out = await sendLeadEvent("tok", FUNNEL_CAPI.willis, input);

    expect(calls[0].url).toBe("https://graph.facebook.com/v21.0/982737334630926/events");
    const event = calls[0].body.data[0];
    expect(event.event_name).toBe("Lead");
    expect(event.event_time).toBe(1786297000);
    expect(event.event_id).toBe("evt-1");
    expect(event.action_source).toBe("website");
    expect(event.user_data.em).toEqual([H.email]);
    expect(calls[0].body.access_token).toBe("tok");
    expect(out).toMatchObject({ ok: true, eventsReceived: 1, fbtraceId: "tr-1" });
  });

  it("omits test_event_code unless one was asked for", async () => {
    const calls = capture({ events_received: 1 });
    await sendLeadEvent("tok", FUNNEL_CAPI.willis, input);
    expect("test_event_code" in calls[0].body).toBe(false);

    const withCode = capture({ events_received: 1 });
    await sendLeadEvent("tok", FUNNEL_CAPI.willis, { ...input, testEventCode: "TEST123" });
    expect(withCode[0].body.test_event_code).toBe("TEST123");
  });

  it("reports Meta's refusal rather than claiming success", async () => {
    capture({ error: { message: "Invalid parameter" }, fbtrace_id: "tr-2" }, false, 400);
    const out = await sendLeadEvent("tok", FUNNEL_CAPI.willis, input);
    expect(out.ok).toBe(false);
    expect(out.status).toBe(400);
    expect(out.error).toBe("Invalid parameter");
  });

  it("keeps the subcode and Meta's own wording, which is the only useful part", async () => {
    // The real refusal seen while verifying this: every distinct fault arrives
    // as "Invalid parameter", so the subcode and user message are the fault.
    capture(
      {
        error: {
          message: "Invalid parameter",
          error_subcode: 2804003,
          error_user_title: "Event Timestamp Too Old",
          error_user_msg: "The timestamp for this event is too far in the past.",
          fbtrace_id: "tr-3",
        },
      },
      false,
      400,
    );
    const out = await sendLeadEvent("tok", FUNNEL_CAPI.willis, input);
    expect(out.errorSubcode).toBe(2804003);
    expect(out.errorDetail).toBe(
      "Event Timestamp Too Old: The timestamp for this event is too far in the past.",
    );
    expect(out.fbtraceId).toBe("tr-3");
  });

  it("survives the network being gone", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const out = await sendLeadEvent("tok", FUNNEL_CAPI.willis, input);
    expect(out).toMatchObject({ ok: false, status: 0 });
  });
});
