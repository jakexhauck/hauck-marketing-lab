import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppConfig,
  BenchmarkSummary,
  ChatFile,
  ChatTurn,
  ClaudeCheck,
  DashboardState,
  ClientCredentialsFile,
  ClientEntry,
  ClientStatus,
  CreativesManifest,
  DataChangedEvent,
  DiagnosisFile,
  DiagnosisInputs,
  DriveIndex,
  FolderSummary,
  GeneratorKind,
  GeneratorOutput,
  KnowledgeChunk,
  KnowledgeTitle,
  KnowledgeQuery,
  KpiEntry,
  LaunchChecklist,
  NoteFront,
  ParsedBenchmarks,
  ProspectFile,
  ScraperEvent,
  SaveGeneratorOutputArgs,
  SkillEntry,
  SkillFile,
  SopFile,
  SopsIndex,
  StreamEvent,
  TrackingAudit,
  VaultNote,
  WebDesignerEvent,
  WebsiteFile,
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
  // ── outreach (Rust commands land in a follow-up). Until the backend ships,
  // these resolve to empty/no-op so the UI can call them safely.
  listProspects: async (
    root: string,
  ): Promise<import("./navigation").ProspectEntry[]> => {
    try {
      return await invoke<import("./navigation").ProspectEntry[]>(
        "list_prospects",
        { root },
      );
    } catch {
      return [];
    }
  },
  readProspect: async (
    root: string,
    slug: string,
  ): Promise<import("./navigation").ProspectEntry | null> => {
    try {
      return await invoke<import("./navigation").ProspectEntry | null>(
        "read_prospect",
        { root, slug },
      );
    } catch {
      return null;
    }
  },
  promoteLeadToProspect: async (
    root: string,
    row: Record<string, unknown>,
  ): Promise<import("./navigation").ProspectEntry | null> => {
    try {
      return await invoke<import("./navigation").ProspectEntry | null>(
        "promote_lead_to_prospect",
        { root, row },
      );
    } catch {
      return null;
    }
  },
  readClientStatus: (root: string, clientSlug: string) =>
    invoke<ClientStatus>("read_client_status", { root, clientSlug }),
  setClientStatus: (root: string, clientSlug: string, status: ClientStatus) =>
    invoke<void>("set_client_status", { root, clientSlug, status }),
  addClient: (
    root: string,
    slug: string,
    name: string,
    driveFolderUrl: string | null = null,
  ) =>
    invoke<ClientEntry>("add_client", {
      root,
      slug,
      name,
      driveFolderUrl,
    }),
  renameClient: (root: string, slug: string, newName: string) =>
    invoke<void>("rename_client", { root, slug, newName }),
  deleteClient: (root: string, slug: string) =>
    invoke<void>("delete_client", { root, slug }),
  setClientBenchmarks: (root: string, clientSlug: string, filename: string | null) =>
    invoke<void>("set_client_benchmarks", { root, clientSlug, filename }),
  setClientDriveFolder: (root: string, clientSlug: string, url: string | null) =>
    invoke<void>("set_client_drive_folder", { root, clientSlug, url }),
  readDriveIndex: (root: string, clientSlug: string) =>
    invoke<DriveIndex | null>("read_drive_index", { root, clientSlug }),
  refreshDriveIndex: (root: string, clientSlug: string) =>
    invoke<DriveIndex>("refresh_drive_index", { root, clientSlug }),
  listBenchmarkSets: (root: string) =>
    invoke<BenchmarkSummary[]>("list_benchmark_sets", { root }),
  readBenchmarksForClient: (root: string, clientSlug: string) =>
    invoke<ParsedBenchmarks | null>("read_benchmarks_for_client", { root, clientSlug }),
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

  readClientCredentials: (root: string, clientSlug: string) =>
    invoke<ClientCredentialsFile>("read_client_credentials", { root, clientSlug }),
  writeClientCredentials: (
    root: string,
    clientSlug: string,
    file: ClientCredentialsFile,
  ) => invoke<void>("write_client_credentials", { root, clientSlug, file }),
  clearClientCredentials: (root: string, clientSlug: string) =>
    invoke<void>("clear_client_credentials", { root, clientSlug }),

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

  saveGeneratorOutput: (args: SaveGeneratorOutputArgs) =>
    invoke<GeneratorOutput>("save_generator_output", {
      root: args.root,
      clientSlug: args.clientSlug,
      kind: args.kind,
      title: args.title,
      summary: args.summary,
      body: args.body,
      inputsYaml: args.inputsYaml,
    }),
  listGeneratorOutputs: (
    root: string,
    clientSlug: string,
    kind: GeneratorKind,
    limit: number,
  ) =>
    invoke<GeneratorOutput[]>("list_generator_outputs", {
      root,
      clientSlug,
      kind,
      limit,
    }),
  readLatestGeneratorOutput: (
    root: string,
    clientSlug: string,
    kind: GeneratorKind,
  ) =>
    invoke<GeneratorOutput | null>("read_latest_generator_output", {
      root,
      clientSlug,
      kind,
    }),

  readDashboardState: (root: string) =>
    invoke<DashboardState>("read_dashboard_state", { root }),
  writeDashboardState: (root: string, state: DashboardState) =>
    invoke<void>("write_dashboard_state", { root, state }),

  listSops: (root: string) => invoke<SopsIndex>("list_sops", { root }),
  refreshSopsIndex: (root: string, folderUrl: string) =>
    invoke<SopsIndex>("refresh_sops_index", { root, folderUrl }),
  readSop: (root: string, sopId: string) =>
    invoke<SopFile | null>("read_sop", { root, sopId }),
  fetchSop: (root: string, sopId: string) =>
    invoke<SopFile>("fetch_sop", { root, sopId }),
  clearSopCache: (root: string, sopId: string) =>
    invoke<void>("clear_sop_cache", { root, sopId }),

  readVaultNote: (root: string, path: string) =>
    invoke<VaultNote>("read_vault_note", { root, path }),
  writeVaultNote: (root: string, path: string, front: NoteFront, body: string) =>
    invoke<VaultNote>("write_vault_note", { root, path, front, body }),
  appendToMemory: (root: string, clientSlug: string, fact: string) =>
    invoke<VaultNote>("append_to_memory", { root, clientSlug, fact }),
  readAboutNotes: (root: string) =>
    invoke<VaultNote[]>("read_about_notes", { root }),
  readClientNotes: (root: string, clientSlug: string) =>
    invoke<VaultNote[]>("read_client_notes", { root, clientSlug }),
  findKnowledgeNotes: (root: string, query: KnowledgeQuery) =>
    invoke<VaultNote[]>("find_knowledge_notes", { root, query }),
  listVaultNotes: (root: string) =>
    invoke<VaultNote[]>("list_vault_notes", { root }),
  vaultRootPath: (root: string) =>
    invoke<string>("vault_root_path", { root }),

  runLeadScraper: (id: string, root: string, niche: string, city: string) =>
    invoke<void>("run_lead_scraper", { id, root, niche, city }),
  listProspectFiles: (root: string) =>
    invoke<ProspectFile[]>("list_prospect_files", { root }),
  leadScraperPaths: (root: string) =>
    invoke<[string, string]>("lead_scraper_paths", { root }),
  onLeadScraperStream: (handler: (e: ScraperEvent) => void): Promise<UnlistenFn> =>
    listen<ScraperEvent>("lead_scraper://stream", (evt) => handler(evt.payload)),

  runWebDesigner: (
    id: string,
    root: string,
    clientSlug: string,
    mode: "build" | "revamp",
    prompt: string,
    businessSlug: string,
  ) =>
    invoke<void>("run_web_designer", {
      id,
      root,
      clientSlug,
      mode,
      prompt,
      businessSlug,
    }),
  editWebDesigner: (
    id: string,
    root: string,
    clientSlug: string,
    filePath: string,
    userRequest: string,
    sectionScope: string | null,
    useDesignPolish: boolean,
  ) =>
    invoke<void>("edit_web_designer", {
      id,
      root,
      clientSlug,
      filePath,
      userRequest,
      sectionScope,
      useDesignPolish,
    }),
  listWebDesignerFiles: (root: string, clientSlug: string) =>
    invoke<WebsiteFile[]>("list_web_designer_files", { root, clientSlug }),
  readWebDesignerFile: (path: string) =>
    invoke<string>("read_web_designer_file", { path }),
  webDesignerDir: (root: string, clientSlug: string) =>
    invoke<string>("web_designer_dir", { root, clientSlug }),
  onWebDesignerStream: (handler: (e: WebDesignerEvent) => void): Promise<UnlistenFn> =>
    listen<WebDesignerEvent>("web_designer://stream", (evt) => handler(evt.payload)),

  gitSync: (root: string) =>
    invoke<{
      ok: boolean;
      summary: string;
      detail: string;
      committed: boolean;
      pulled: boolean;
      pushed: boolean;
    }>("git_sync", { root }),

  pickFolder: async (): Promise<string | null> => {
    const result = await open({ directory: true, multiple: false });
    if (typeof result === "string") return result;
    return null;
  },

  onClaudeStream: (handler: (e: StreamEvent) => void): Promise<UnlistenFn> =>
    listen<StreamEvent>("claude://stream", (evt) => handler(evt.payload)),

  onDataChanged: (handler: (e: DataChangedEvent) => void): Promise<UnlistenFn> =>
    listen<DataChangedEvent>("data://changed", (evt) => handler(evt.payload)),
};
