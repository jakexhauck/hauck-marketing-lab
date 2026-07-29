import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppConfig,
  ChatFile,
  ChatTurn,
  ClaudeCheck,
  ClientEntry,
  ClientStatus,
  CreativesManifest,
  DiagnosisFile,
  DiagnosisInputs,
  FolderSummary,
  KnowledgeChunk,
  KnowledgeTitle,
  KpiEntry,
  LaunchChecklist,
  SkillEntry,
  SkillFile,
  StreamEvent,
  TrackingAudit,
} from "./types";

export const api = {
  loadConfig: () => invoke<AppConfig>("load_config"),
  saveConfig: (config: AppConfig) => invoke<void>("save_config", { config }),
  suggestFolderCandidates: () => invoke<string[]>("suggest_folder_candidates"),
  parseFolder: (root: string) => invoke<FolderSummary>("parse_folder", { root }),
  readAgentBody: (root: string, slug: string) =>
    invoke<string>("read_agent_body", { root, slug }),
  loadSkill: (root: string, category: string, skillId: string) =>
    invoke<SkillFile>("load_skill", { root, category, skillId }),
  listSkills: (root: string) => invoke<SkillEntry[]>("list_skills", { root }),
  listKnowledgeTitles: (root: string) =>
    invoke<KnowledgeTitle[]>("list_knowledge_titles", { root }),
  createChat: (root: string, agent: string | null, title: string) =>
    invoke<ChatFile>("create_chat", { root, agent, title }),
  readChat: (path: string) => invoke<ChatFile>("read_chat", { path }),
  appendTurn: (path: string, turn: ChatTurn) =>
    invoke<void>("append_turn", { path, turn }),
  replaceLastTurn: (path: string, turn: ChatTurn) =>
    invoke<void>("replace_last_turn", { path, turn }),
  checkClaude: () => invoke<ClaudeCheck>("check_claude"),
  invokeClaude: (id: string, prompt: string) =>
    invoke<string>("invoke_claude", { id, prompt }),
  matchKnowledgeChunks: (root: string, userInput: string) =>
    invoke<KnowledgeChunk[]>("match_knowledge_chunks", { root, userInput }),
  readKnowledgeChunk: (root: string, chunkId: string) =>
    invoke<KnowledgeChunk>("read_knowledge_chunk", { root, chunkId }),

  readLaunchChecklist: (root: string, clientSlug: string) =>
    invoke<LaunchChecklist>("read_launch_checklist", { root, clientSlug }),
  writeLaunchChecklist: (root: string, clientSlug: string, checklist: LaunchChecklist) =>
    invoke<void>("write_launch_checklist", { root, clientSlug, checklist }),
  listClients: (root: string) => invoke<ClientEntry[]>("list_clients", { root }),
  readClientStatus: (root: string, clientSlug: string) =>
    invoke<ClientStatus>("read_client_status", { root, clientSlug }),
  setClientStatus: (root: string, clientSlug: string, status: ClientStatus) =>
    invoke<void>("set_client_status", { root, clientSlug, status }),
  saveLaunchReadinessVerdict: (root: string, clientSlug: string, body: string) =>
    invoke<string>("save_launch_readiness_verdict", { root, clientSlug, body }),

  readLatestKpis: (root: string, clientSlug: string) =>
    invoke<KpiEntry | null>("read_latest_kpis", { root, clientSlug }),
  readKpiHistory: (root: string, clientSlug: string, limit: number) =>
    invoke<KpiEntry[]>("read_kpi_history", { root, clientSlug, limit }),
  writeKpiEntry: (root: string, clientSlug: string, entry: KpiEntry) =>
    invoke<string>("write_kpi_entry", { root, clientSlug, entry }),

  readTrackingAudit: (root: string, clientSlug: string) =>
    invoke<TrackingAudit | null>("read_tracking_audit", { root, clientSlug }),
  writeTrackingAudit: (root: string, clientSlug: string, audit: TrackingAudit) =>
    invoke<string>("write_tracking_audit", { root, clientSlug, audit }),

  readCreativesManifest: (root: string, clientSlug: string) =>
    invoke<CreativesManifest | null>("read_creatives_manifest", { root, clientSlug }),
  writeCreativesManifest: (root: string, clientSlug: string, manifest: CreativesManifest) =>
    invoke<string>("write_creatives_manifest", { root, clientSlug, manifest }),

  saveDiagnosis: (
    root: string,
    clientSlug: string,
    inputs: DiagnosisInputs,
    agentResponse: string,
  ) =>
    invoke<DiagnosisFile>("save_diagnosis", {
      root,
      clientSlug,
      inputs,
      agentResponse,
    }),
  readLatestDiagnosis: (root: string, clientSlug: string) =>
    invoke<DiagnosisFile | null>("read_latest_diagnosis", { root, clientSlug }),

  pickFolder: async (): Promise<string | null> => {
    const result = await open({ directory: true, multiple: false });
    if (typeof result === "string") return result;
    return null;
  },

  onClaudeStream: (handler: (e: StreamEvent) => void): Promise<UnlistenFn> =>
    listen<StreamEvent>("claude://stream", (evt) => handler(evt.payload)),
};
