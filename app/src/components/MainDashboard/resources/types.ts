export type CategoryId =
  | "module-3"
  | "module-4"
  | "module-5"
  | "bonus";

export type Category = {
  id: CategoryId;
  label: string;
};

export type Block =
  | { kind: "section"; num: string; title: string; id: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; lead?: string; body: string }
  | { kind: "list"; items: string[] }
  | { kind: "learnPanel"; items: string[] }
  | {
      kind: "machineGrid";
      items: { num: string; title: string; desc: string }[];
    }
  | {
      kind: "funnel";
      tiers: { num: string; label: string; desc: string }[];
    }
  | { kind: "heroStats"; stats: { value: string; label: string }[] }
  | { kind: "satelliteGrid"; stats: { value: string; label: string }[] }
  | { kind: "takeaway"; text: string }
  | { kind: "quote"; body: string; attribution?: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "image"; src: string; alt?: string; caption?: string };

export type Article = {
  id: string;
  category: CategoryId;
  title: string;
  lede: string;
  readTimeMin: number;
  updated: string; // ISO date
  source?: { label: string; url?: string };
  body: Block[];
};
