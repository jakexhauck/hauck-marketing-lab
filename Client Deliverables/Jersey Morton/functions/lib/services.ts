// The authority on what can be booked, what it costs, and how long it takes.
//
// index.html carries its own copy of this list for rendering, because the page
// has to work before the worker answers. The two are kept honest by
// test/parity.test.ts, which fails if they drift. Never edit one alone.

export interface Service {
  id: string;
  name: string;
  price: number;
  minutes: number;
  approx?: boolean;
  includesTone?: boolean;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  minutes: number;
  needsTone?: boolean;
}

export const SERVICES: Service[] = [
  { id: "haircut", name: "Haircut", price: 14, minutes: 90 },
  { id: "blowout", name: "Blowout", price: 14, minutes: 90 },
  { id: "specialtyStyle", name: "Specialty style", price: 30, minutes: 90 },
  { id: "colorRetouch", name: "Color retouch", price: 36, minutes: 120 },
  { id: "virginColor", name: "Virgin color application", price: 50, minutes: 120 },
  { id: "partialHighlight", name: "Partial highlight", price: 36, minutes: 120, approx: true },
  { id: "fullHighlight", name: "Full highlight", price: 60, minutes: 120 },
  { id: "bleachToneRetouch", name: "Bleach and tone retouch", price: 60, minutes: 180, approx: true, includesTone: true },
  { id: "bleachTone", name: "Bleach and tone", price: 80, minutes: 180, approx: true, includesTone: true },
  { id: "colorCorrection", name: "Color correction", price: 84, minutes: 180, approx: true },
];

// minutes is 0 on every add-on: they change the price, not the appointment
// length. If that ever stops being true, change it here and in index.html.
export const ADDONS: Addon[] = [
  { id: "addHaircut", name: "Add a haircut", price: 11, minutes: 0 },
  { id: "addToner", name: "Add toner", price: 9, minutes: 0, needsTone: true },
  { id: "addGloss", name: "Add gloss", price: 18, minutes: 0, needsTone: true },
];

export function findService(id: unknown): Service | null {
  return SERVICES.find((s) => s.id === id) ?? null;
}

// Add-ons the client was actually allowed to pick. A service that already
// includes tone never offers toner or gloss, so a request carrying them is
// either stale or tampered with, and they are dropped rather than charged.
export function allowedAddons(service: Service): Addon[] {
  return ADDONS.filter((a) => !(a.needsTone && service.includesTone));
}

export function resolveAddons(service: Service, ids: unknown): Addon[] {
  if (!Array.isArray(ids)) return [];
  const allowed = allowedAddons(service);
  return allowed.filter((a) => ids.includes(a.id));
}

// Priced server side from the ids, never trusted from the request body.
export function quote(service: Service, addons: Addon[]): { price: number; minutes: number; approx: boolean } {
  return {
    price: service.price + addons.reduce((n, a) => n + a.price, 0),
    minutes: service.minutes + addons.reduce((n, a) => n + a.minutes, 0),
    approx: Boolean(service.approx),
  };
}
