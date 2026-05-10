export type AppConfig = {
  media_buying_path: string | null;
};

export type AgentSummary = {
  slug: string;
  name: string;
  initial: string;
  short: string;
  role: string | null;
  description: string | null;
  path: string;
};

export type ChatSummary = {
  slug: string;
  title: string;
  agent: string | null;
  started_at: string | null;
  modified_at: string;
  preview: string | null;
  path: string;
};

export type FolderSummary = {
  root: string;
  agents: AgentSummary[];
  chats: ChatSummary[];
  knowledge_count: number;
  skill_count: number;
};

export type ChatTurn = {
  role: "user" | "agent";
  agent: string | null;
  at: string;
  body: string;
};

export type ChatFile = {
  path: string;
  slug: string;
  title: string;
  agent: string | null;
  started_at: string;
  turns: ChatTurn[];
};

export type ClaudeCheck = {
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
};

export type StreamEvent =
  | { kind: "started"; id: string }
  | { kind: "delta"; id: string; text: string }
  | { kind: "done"; id: string; full_text: string }
  | { kind: "error"; id: string; message: string };
