import type { Client } from "../types";

export const clients: Client[] = [
  {
    id: "smiths-roofing",
    name: "Smith's Roofing",
    niche: "Roofing",
    brand: {
      color: "#4f46e5",
      logoUrl: null,
      initials: "SR",
      appName: "Smith Leads",
    },
    pipeline: {
      wonLabel: "Sold",
      valueLabel: "Job Value",
    },
    tier: "premium",
    monthlySpend: 2500,
  },
  {
    id: "glow-medspa",
    name: "Glow Med Spa",
    niche: "Med Spa",
    brand: {
      color: "#c47ab4",
      logoUrl: null,
      initials: "GM",
      appName: "Glow Leads",
    },
    pipeline: {
      wonLabel: "Booked & Paid",
      valueLabel: "Treatment Value",
    },
    tier: "pro",
    monthlySpend: 1800,
  },
  {
    id: "apex-detailing",
    name: "Apex Auto Detailing",
    niche: "Auto Detailing",
    brand: {
      color: "#d97706",
      logoUrl: null,
      initials: "AD",
      appName: "Apex Leads",
    },
    pipeline: {
      wonLabel: "Closed",
      valueLabel: "Service Total",
    },
    tier: "core",
    monthlySpend: 900,
  },
];

export function getClient(clientId: string): Client | undefined {
  return clients.find((c) => c.id === clientId);
}
