import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppConfig,
  BenchmarkSummary,
  ChatFile,
  ChatTurn,
  ClaudeCheck,
  CopywriterEvent,
  DashboardState,
  ClientCredentialsFile,
  ClientEntry,
  ClientStatus,
  CreativesManifest,
  GhlAdvanceArgs,
  GhlAdvanceResult,
  GhlAppointment,
  GhlCalendar,
  GhlConfigStatus,
  GhlContactLite,
  GhlHubKey,
  GhlOpportunity,
  GhlPipeline,
  OpsAppointmentsFile,
  OpsClientsFile,
  OpsRevenueFile,
  OpsTasksFile,
  PersonalHubFile,
  DataChangedEvent,
  DiagnosisFile,
  DiagnosisInputs,
  DmFile,
  DriveIndex,
  DriveUploadResult,
  FolderSummary,
  GeneratorKind,
  GeneratorOutput,
  KnowledgeChunk,
  KnowledgeTitle,
  KnowledgeQuery,
  KpiEntry,
  OnboardingState,
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

  readOnboardingState: (root: string, clientSlug: string) =>
    invoke<OnboardingState>("read_onboarding_state", { root, clientSlug }),
  writeOnboardingState: (root: string, clientSlug: string, state: OnboardingState) =>
    invoke<void>("write_onboarding_state", { root, clientSlug, state }),
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
  addProspect: (
    root: string,
    input: {
      name: string;
      niche?: string | null;
      url?: string | null;
      contactName?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      scheduledAt?: string | null;
      status?: string | null;
      notes?: string | null;
    },
  ) =>
    invoke<import("./navigation").ProspectEntry>("add_prospect", {
      root,
      input,
    }),
  deleteProspect: (root: string, slug: string) =>
    invoke<void>("delete_prospect", { root, slug }),
  updateProspectStatus: (root: string, slug: string, status: string) =>
    invoke<import("./navigation").ProspectEntry>("update_prospect_status", {
      root,
      slug,
      status,
    }),
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
  uploadOutputToDrive: (
    root: string,
    clientSlug: string,
    outputPath: string,
    filename: string,
  ) =>
    invoke<DriveUploadResult>("upload_output_to_drive", {
      root,
      clientSlug,
      outputPath,
      filename,
    }),
  generateNanoBananaImage: (
    apiKey: string,
    prompt: string,
    aspectRatio: string,
    outputPath: string,
  ) =>
    invoke<string>("generate_nano_banana_image", {
      apiKey,
      prompt,
      aspectRatio,
      outputPath,
    }),
  generateCreativeSet: (
    apiKey: string,
    prompts: import("./types").CreativePrompt[],
    outputDir: string,
  ) =>
    invoke<import("./types").CreativeBatchResult>("generate_creative_set", {
      apiKey,
      prompts,
      outputDir,
    }),
  listBenchmarkSets: (root: string) =>
    invoke<BenchmarkSummary[]>("list_benchmark_sets", { root }),
  readBenchmarksForClient: (root: string, clientSlug: string) =>
    invoke<ParsedBenchmarks | null>("read_benchmarks_for_client", { root, clientSlug }),

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

  savePitchDeck: (
    root: string,
    clientSlug: string,
    title: string,
    summary: string | null,
    body: string,
  ) =>
    invoke<GeneratorOutput>("save_pitch_deck", {
      root,
      clientSlug,
      title,
      summary,
      body,
    }),
  listPitchDecks: (root: string, clientSlug: string, limit: number) =>
    invoke<GeneratorOutput[]>("list_pitch_decks", { root, clientSlug, limit }),
  openPitchDeck: (path: string) => invoke<void>("open_pitch_deck", { path }),

  readDashboardState: (root: string) =>
    invoke<DashboardState>("read_dashboard_state", { root }),
  writeDashboardState: (root: string, state: DashboardState) =>
    invoke<void>("write_dashboard_state", { root, state }),

  readOpsClients: (root: string) =>
    invoke<OpsClientsFile>("read_ops_clients", { root }),
  writeOpsClients: (root: string, file: OpsClientsFile) =>
    invoke<void>("write_ops_clients", { root, file }),
  readOpsTasks: (root: string) => invoke<OpsTasksFile>("read_ops_tasks", { root }),
  writeOpsTasks: (root: string, file: OpsTasksFile) =>
    invoke<void>("write_ops_tasks", { root, file }),
  readOpsRevenue: (root: string) =>
    invoke<OpsRevenueFile>("read_ops_revenue", { root }),
  writeOpsRevenue: (root: string, file: OpsRevenueFile) =>
    invoke<void>("write_ops_revenue", { root, file }),
  readOpsAppointments: (root: string) =>
    invoke<OpsAppointmentsFile>("read_ops_appointments", { root }),
  writeOpsAppointments: (root: string, file: OpsAppointmentsFile) =>
    invoke<void>("write_ops_appointments", { root, file }),

  appendActivity: (
    root: string,
    event: import("./activity").ActivityEvent,
  ) => invoke<void>("append_activity", { root, event }),
  tailActivity: (root: string, limit: number) =>
    invoke<import("./activity").ActivityTail>("tail_activity", { root, limit }),
  readActivityState: (root: string) =>
    invoke<import("./activity").ActivityState>("read_activity_state", { root }),
  markActivitySeen: (root: string) =>
    invoke<void>("mark_activity_seen", { root }),

  readPersonalHub: (root: string) =>
    invoke<PersonalHubFile>("read_personal_hub", { root }),
  writePersonalHub: (root: string, file: PersonalHubFile) =>
    invoke<void>("write_personal_hub", { root, file }),

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
    targetKind: "client" | "outreach" = "client",
  ) =>
    invoke<void>("run_web_designer", {
      id,
      root,
      clientSlug,
      mode,
      prompt,
      businessSlug,
      targetKind,
    }),
  runCopywriter: (
    id: string,
    root: string,
    csvPath: string,
    userInstructions: string,
  ) =>
    invoke<void>("run_copywriter", {
      id,
      root,
      csvPath,
      userInstructions,
    }),
  listDmFiles: (root: string) =>
    invoke<DmFile[]>("list_dm_files", { root }),
  readDmFile: (path: string) => invoke<string>("read_dm_file", { path }),
  onCopywriterStream: (handler: (e: CopywriterEvent) => void): Promise<UnlistenFn> =>
    listen<CopywriterEvent>("copywriter://stream", (evt) => handler(evt.payload)),
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

  watchRoot: (root: string) => invoke<void>("watch_root", { root }),
  onVaultChanged: (
    handler: (e: { kind: string; path: string; client_slug: string | null }) => void,
  ): Promise<UnlistenFn> =>
    listen<{ kind: string; path: string; client_slug: string | null }>(
      "vault://changed",
      (evt) => handler(evt.payload),
    ),

  googleCalendarConnect: () => invoke<void>("google_calendar_connect"),
  googleCalendarDisconnect: () => invoke<void>("google_calendar_disconnect"),
  googleCalendarIsConnected: () => invoke<boolean>("google_calendar_is_connected"),
  googleCalendarCreateEvent: (args: {
    title: string;
    startIso: string;
    endIso: string;
    description?: string | null;
    location?: string | null;
    allDay: boolean;
  }) => invoke<string>("google_calendar_create_event", { args }),
  googleCalendarUpdateEvent: (
    eventId: string,
    args: {
      title: string;
      startIso: string;
      endIso: string;
      description?: string | null;
      location?: string | null;
      allDay: boolean;
    },
  ) => invoke<void>("google_calendar_update_event", { eventId, args }),
  googleCalendarDeleteEvent: (eventId: string) =>
    invoke<void>("google_calendar_delete_event", { eventId }),

  ghlIsConfigured: () => invoke<boolean>("ghl_is_configured"),
  ghlGetLocationId: () => invoke<string | null>("ghl_get_location_id"),
  ghlGetConfigStatus: () => invoke<GhlConfigStatus>("ghl_get_config_status"),
  ghlSetCredentials: (privateToken: string, locationId: string) =>
    invoke<void>("ghl_set_credentials", { privateToken, locationId }),
  ghlSetPipelineChoice: (hub: GhlHubKey, pipelineId: string | null) =>
    invoke<void>("ghl_set_pipeline_choice", { hub, pipelineId }),
  ghlSetBookingCalendar: (calendarId: string | null) =>
    invoke<void>("ghl_set_booking_calendar", { calendarId }),
  ghlClearCredentials: () => invoke<void>("ghl_clear_credentials"),
  ghlListPipelines: () => invoke<GhlPipeline[]>("ghl_list_pipelines"),
  ghlListOpportunities: (pipelineId: string) =>
    invoke<GhlOpportunity[]>("ghl_list_opportunities", { pipelineId }),
  ghlListCalendars: () => invoke<GhlCalendar[]>("ghl_list_calendars"),
  ghlListAppointments: (
    calendarId: string,
    startIso: string,
    endIso: string,
  ) =>
    invoke<GhlAppointment[]>("ghl_list_appointments", {
      calendarId,
      startIso,
      endIso,
    }),
  ghlGetContact: (contactId: string) =>
    invoke<GhlContactLite>("ghl_get_contact", { contactId }),
  ghlAdvanceOpportunity: (args: GhlAdvanceArgs) =>
    invoke<GhlAdvanceResult>("ghl_advance_opportunity", { args }),
  metaListAdsInsights: (args: {
    adAccountId: string;
    clientSlug: string;
    clientName: string;
    windowDays: number;
    forceRefresh?: boolean;
    /** YYYY-MM-DD. When set together with endDate, overrides windowDays. */
    startDate?: string | null;
    endDate?: string | null;
    /** Meta attribution windows, e.g. ["7d_click","1d_view"]. */
    attributionWindows?: string[] | null;
    /** Single Meta `action_type` to count as a result. Overrides allowlist. */
    conversionAction?: string | null;
    /** Media buying root. When set, a daily KPI snapshot is written on success. */
    root?: string | null;
  }) =>
    invoke<import("./mockMetaAds").MetaAdsAccount>("meta_list_ads_insights", {
      adAccountId: args.adAccountId,
      clientSlug: args.clientSlug,
      clientName: args.clientName,
      windowDays: args.windowDays,
      forceRefresh: args.forceRefresh ?? false,
      startDate: args.startDate ?? null,
      endDate: args.endDate ?? null,
      attributionWindows: args.attributionWindows ?? null,
      conversionAction: args.conversionAction ?? null,
      root: args.root ?? null,
    }),
  metaClearAdsCache: () => invoke<void>("meta_clear_ads_cache"),
  metaBackfillKpis: (args: {
    adAccountId: string;
    clientSlug: string;
    clientName: string;
    days?: number | null;
    conversionAction?: string | null;
    root: string;
  }) =>
    invoke<{ written: number; skipped: number }>("meta_backfill_kpis", {
      adAccountId: args.adAccountId,
      clientSlug: args.clientSlug,
      clientName: args.clientName,
      days: args.days ?? null,
      conversionAction: args.conversionAction ?? null,
      root: args.root,
    }),
  metaBackfillIfNeeded: (root: string) =>
    invoke<{ backfilled: string[]; skipped: string[] }>(
      "meta_backfill_if_needed",
      { root },
    ),
  metaPauseCampaign: (campaignId: string) =>
    invoke<void>("meta_pause_campaign", { campaignId }),
  metaResumeCampaign: (campaignId: string) =>
    invoke<void>("meta_resume_campaign", { campaignId }),
  metaPauseAd: (adId: string) => invoke<void>("meta_pause_ad", { adId }),
  metaResumeAd: (adId: string) => invoke<void>("meta_resume_ad", { adId }),
  metaPauseAdSet: (adsetId: string) =>
    invoke<void>("meta_pause_ad_set", { adsetId }),
  metaResumeAdSet: (adsetId: string) =>
    invoke<void>("meta_resume_ad_set", { adsetId }),
  metaUpdateCampaignBudget: (campaignId: string, dailyBudgetCents: number) =>
    invoke<void>("meta_update_campaign_budget", {
      campaignId,
      dailyBudgetCents,
    }),
  metaUpdateAdSetBudget: (adsetId: string, dailyBudgetCents: number) =>
    invoke<void>("meta_update_ad_set_budget", { adsetId, dailyBudgetCents }),
  metaDuplicateCampaign: (campaignId: string) =>
    invoke<{ newId: string }>("meta_duplicate_campaign", { campaignId }),
  metaDuplicateAdSet: (adsetId: string) =>
    invoke<{ newId: string }>("meta_duplicate_ad_set", { adsetId }),
  metaDuplicateAd: (adId: string) =>
    invoke<{ newId: string }>("meta_duplicate_ad", { adId }),

  provisionMobileTenant: (input: {
    clientEmail: string;
    slug: string;
    name: string;
    niche: string;
    brandColor: string;
    brandInitials: string;
    appName: string;
    wonLabel: string;
    valueLabel: string;
    ghlLocationId: string;
    ghlToken: string;
    monthlySpend: number;
    sendInvite: boolean;
  }) =>
    invoke<{
      tenantId: string;
      userId: string;
      userEmail: string;
      invited: boolean;
      alreadyExisted: boolean;
    }>("provision_mobile_tenant", { input }),
};
