import type { Article } from "./types";

export const BONUS_ARTICLES: Article[] = [
  {
    id: "bonus-mega-brain-tour",
    category: "bonus",
    title: "Behind My MEGA BRAIN",
    lede: "Most people use AI like a search engine. The MEGA BRAIN treats it like a team: memory, specialized agents, a knowledge base that compounds, and skills that execute repeatable workflows. This is the architectural tour.",
    readTimeMin: 75,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/bonus-mega-brain-tour.html" },
    body: [
      { kind: "learnPanel", items: [
        "The 4-part architecture: config, agents, skills, knowledge base",
        "How memory, MCPs, and hooks make AI compound day over day",
        "The Compound Engineering framework (40% plan, 20% work, 20% review, 20% document)",
        "Ralph Wiggum: the 8-pass copy loop that lifts conversion"
      ]},
      { kind: "section", num: "01", title: "The Big Idea", id: "the-big-idea" },
      { kind: "p", body: "The typical approach treats AI as a one-off query tool with no retention. The alternative is building a system where your AI maintains memory, operates as a specialized team, houses comprehensive knowledge, and improves continuously. The class goal is architectural understanding, not programming expertise. You should be able to customize a starter pack for your business in 30 minutes." },
      { kind: "quote", body: "That's not science fiction. That's a folder of markdown files and 6 agent definitions." },
      { kind: "section", num: "02", title: "The Architecture", id: "architecture" },
      { kind: "p", body: "Four interconnected components form the system: a master config (CLAUDE.md) that bootloads the brain, an agents folder housing your specialized AI team, a skills folder for reusable workflows, and a .brain/ folder storing organized markdown knowledge with domains (marketing, ops, sales, finance) and DNA expert personas." },
      { kind: "list", items: [
        "Config defines your identity and operational parameters",
        "Agents comprise your specialized team",
        "Skills execute repeatable processes",
        "Brain stores organized knowledge"
      ]},
      { kind: "p", body: "Implementation timeline: start with CLAUDE.md on day one. Add agents progressively as needed. Expand the knowledge base over time." },
      { kind: "section", num: "03", title: "CLAUDE.md: Your Brain's Operating System", id: "claude-md" },
      { kind: "p", body: "This file is read first in every session, establishing your identity, business focus, communication voice, and operational rules. Without it, your AI is a generic assistant. With it, you have a personalized partner. Comparable to the difference between temporary staffing and a six-month employee. Starter template runs about 2 KB and takes 15 minutes to customize." },
      { kind: "section", num: "04", title: "The Agent Team: Your AI C-Suite", id: "agent-team" },
      { kind: "p", body: "Agents function as specialized AI professionals, each with distinct personality, focus, and decision-making framework. The starter pack includes 6 agents (about 10 KB total)." },
      { kind: "machineGrid", items: [
        { num: "01", title: "CEO", desc: "Strategy, prioritization, go/no-go decisions. Use for strategic decisions needing a 90-day perspective." },
        { num: "02", title: "CMO", desc: "Funnels, advertising, creative direction, ROAS. Most-used agent. Campaign diagnosis, ad copy, angles, scaling, Meta optimization." },
        { num: "03", title: "COO", desc: "Operations, SOPs, delivery. Client onboarding workflows, delivery checklists, process documentation." },
        { num: "04", title: "CSO", desc: "Sales, discovery scripts, objections, proposals, pipeline. Use pre-call." },
        { num: "05", title: "CFO", desc: "P&L analysis, margin, unit economics. Client profitability, cost analysis, pricing." },
        { num: "06", title: "JARVIS", desc: "Orchestration and routing. Receives queries, directs to the right agent, synthesizes responses." }
      ]},
      { kind: "section", num: "05", title: "MEGA DIGESTIVE: Turn Courses Into Permanent Knowledge", id: "mega-digestive" },
      { kind: "p", body: "Most content consumption results in knowledge loss within one week. This system converts consumed material into permanent, searchable institutional knowledge. The full version uses 10 phases; the lite version delivers 80% of the value through 3." },
      { kind: "h3", text: "Phase 1: INGEST" },
      { kind: "p", body: "Drop raw content (transcripts, PDFs, books, video transcriptions) into a folder with clean filenames using the format YYYY-MM-DD_source_topic.md." },
      { kind: "h3", text: "Phase 2: CHUNK" },
      { kind: "p", body: "AI breaks each file into 4KB knowledge units with structured frontmatter (id, title, tags, source, related items). Each chunk addresses one complete idea. The outcome: permanent, searchable knowledge." },
      { kind: "h3", text: "Phase 3: SYNTHESIZE" },
      { kind: "p", body: "Convert chunks into actionable outputs: topic dossiers (2-page master documents), expert personas (knowledge transfer from specific experts), or decision trees (conditional logic rules). Agents gain expert-level knowledge." },
      { kind: "takeaway", text: "After a year of doing this, your AI brain will know more about your niche than any single human alive." },
      { kind: "section", num: "06", title: "The Knowledge Base: Your .brain/", id: "knowledge-base" },
      { kind: "p", body: "Markdown-based organization with structured frontmatter and inter-file linking (similar to Obsidian). Index file for navigation, domain folders for categorized chunks, and a DNA folder for expert personas. Naming convention is domain code plus topic plus sequence (e.g. MKT-ADS-001.md, OPS-ONB-001.md). The starter ships with example chunks like the Andromeda creative volume rule, a 7-day onboarding SOP, and a Gary Halbert persona template." },
      { kind: "section", num: "07", title: "The Skills: Your Reusable Workflows", id: "skills" },
      { kind: "p", body: "Skills are pre-defined processes within your AI playbook. They execute consistently when triggered." },
      { kind: "machineGrid", items: [
        { num: "01", title: "Firecrawl Research Lite", desc: "Voice-of-customer extraction from Reddit, Amazon reviews, YouTube comments, competitor sites. Outputs authentic pain language, outcomes, objections." },
        { num: "02", title: "Copywriter Lite", desc: "4-master direct response system: Schwartz (awareness), Georgi (RMBC), Halbert (hook craft), Bencivenga (validation)." },
        { num: "03", title: "MEGA Digestive Lite", desc: "The 3-phase knowledge digestion and chunking pipeline as an installable skill." }
      ]},
      { kind: "section", num: "08", title: "Memory System: Your AI Stops Forgetting", id: "memory-system" },
      { kind: "p", body: "Claude's default session-based memory means knowledge loss between conversations. Claude-mem uses a Chroma vector database to preserve important session info and auto-retrieve relevant memories later. Four memory types: user (identity, preferences), feedback (corrections), project (current work, client timelines), and reference (external system pointers)." },
      { kind: "p", body: "Without memory: repeated business explanations, lost patterns, zero-baseline onboarding. With memory: client continuity, decision compounding, accelerated team onboarding, systematic learning." },
      { kind: "takeaway", text: "Memory plus Knowledge Base plus Agents equals an AI that gets smarter every single day you use it." },
      { kind: "section", num: "09", title: "MCP Stack: Tools That Make Claude Useful", id: "mcp-stack" },
      { kind: "p", body: "MCPs function as USB ports for AI, adding external capabilities beyond conversational thinking. The core stack: Meta Ads MCP (run, audit, optimize Meta campaigns from Claude, 29 tools, OAuth-based, launched April 29 2026), Firecrawl MCP (web scraping at scale, clean markdown output), and Playwright MCP (browser automation: click, fill forms, screenshot, navigate scraper-blocking sites)." },
      { kind: "quote", body: "Meta Ads plus Firecrawl plus Playwright running together: find competitor brands ranking for a keyword in Meta Ad Library, pull their top 5 ads, scrape their landing pages, screenshot their checkout, compare to your client. A $5K research project. Done in 10 minutes." },
      { kind: "section", num: "10", title: "Hooks: Auto-Magic in the Background", id: "hooks" },
      { kind: "p", body: "Hooks are scripts that execute automatically when Claude performs specific actions, functioning as reflexive processes. Without them you have to remember to link chunks, validate frontmatter, save learnings, commit changes. Failure is inevitable. With them, the brain organizes itself." },
      { kind: "machineGrid", items: [
        { num: "01", title: "Auto-Link Chunks", desc: "On new file in .brain/domains/, scan and auto-suggest related chunks. Prevents orphaned knowledge." },
        { num: "02", title: "Validate Frontmatter", desc: "On any .md save in .brain/, verify required fields (id, title, tags, date, related). Block save if incomplete." },
        { num: "03", title: "Auto-Save Learnings", desc: "On session end, scan messages for learning keywords and save discoveries to the memory inbox for review." },
        { num: "04", title: "Auto-Commit", desc: "On file edit and session end, git commit with auto-sync message. Version history and rollback for free." }
      ]},
      { kind: "section", num: "11", title: "Compound Engineering: The 4-Phase Framework", id: "compound-engineering" },
      { kind: "p", body: "Agency owners skip planning, jump to execution, and pay downstream. For tasks over one day, allocate time differently." },
      { kind: "table", headers: ["Phase", "Allocation", "Purpose"], rows: [
        ["PLAN", "40%", "Define problem, prevent dead-ends, set success criteria"],
        ["WORK", "20%", "Execute on a clear path with no mid-flight decisions"],
        ["REVIEW", "20%", "Cold-read output, find gaps, refine"],
        ["DOCUMENT", "20%", "Capture learnings so future similar tasks cut planning by 70%"]
      ]},
      { kind: "p", body: "Use for new client onboarding, funnel launches, new SOP creation, hiring decisions, pricing changes, projects over a day. Skip for email replies, quick fixes, 30-minute tasks." },
      { kind: "section", num: "12", title: "Ralph Wiggum: The 8-Pass Copy Loop", id: "ralph-wiggum" },
      { kind: "p", body: "AI-generated copy typically reaches 6/10 quality: looks professional, doesn't convert. Run copy through 8 sequential passes, each strengthening the output. Named for repetition. Real example: same email 1.2% conversion before, 3.8% after." },
      { kind: "list", items: [
        "Pass 1 (Schwartz Awareness): Is this written for the correct awareness level?",
        "Pass 2 (Hook Strength): Does the first line stop scrolling?",
        "Pass 3 (Specificity): Replace vague language with precise data. Many becomes 73%. Soon becomes by Friday.",
        "Pass 4 (Proof): Every claim needs an adjacent number, name, or example. Cut unsupported claims.",
        "Pass 5 (Voice): Sound human, not AI. Strip em dashes, triple structures, corporate words like leverage, robust, seamless.",
        "Pass 6 (Pace): Vary sentence length. Use fragments. White space is a design element.",
        "Pass 7 (Cut): Remove 20% without losing meaning. Kill adjectives, qualifiers, throat-clearing intros.",
        "Pass 8 (Cold Read): Read fresh. Does it flow, land emotionally, close? If not, return to the relevant pass."
      ]},
      { kind: "p", body: "Time investment: 8 to 25 minutes per piece. Most writers skip this rigor for 5-minute production. Your commitment produces superior conversion performance." },
      { kind: "section", num: "13", title: "Install in 30 Minutes", id: "install" },
      { kind: "list", items: [
        "Unzip mega-brain-starter.zip and rename folder to your agency name",
        "Open CLAUDE.md and replace every [BRACKET] with real info: agency name, niches, voice, goals",
        "Open each agent file in .claude/agents/ and replace [YOUR_AGENCY_NAME], adjust missions",
        "Read example chunks in .brain/domains/ and write ONE chunk of real knowledge from your business",
        "Open Claude Code in the project folder, ask it to read CLAUDE.md and explain your business back"
      ]},
      { kind: "section", num: "14", title: "The Compound", id: "compound" },
      { kind: "p", body: "Primary rule: add one chunk per day to your brain. 30 days is 30 pieces of permanent knowledge. 90 days is 90. One year is 365. Each chunk improves future answers, strengthens agents, and increases business defensibility." },
      { kind: "quote", body: "Most agency owners don't have this. They have notion docs they never reread. They have webinars they watched once. Their knowledge leaks every week. You stop the leak. You compound.", attribution: "Brez" },
      { kind: "takeaway", text: "Transform AI from a search tool into a specialized team with memory, knowledge, and reflexes. Then add one chunk a day and let compounding do the rest." }
    ]
  },
  {
    id: "bonus-invisible-skeleton",
    category: "bonus",
    title: "The Invisible Skeleton",
    lede: "Every great ad on the internet is built on an invisible skeleton. Once you can see the skeleton, you can copy it legally, swap your product in, and let AI write a brand new ad in any niche.",
    readTimeMin: 75,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/bonus-invisible-skeleton.html" },
    body: [
      { kind: "learnPanel", items: [
        "The 10 jobs every great ad does, in order",
        "How to x-ray a winning ad and extract a reusable skeleton",
        "The master AI prompt that turns a skeleton into 5 new ads",
        "Where to hunt winning ads: Meta Ad Library plus spy tools plus keyword search"
      ]},
      { kind: "section", num: "01", title: "The Big Idea", id: "big-idea" },
      { kind: "p", body: "Professionals don't think in frameworks. They think in jobs. Each line of a winning ad performs a specific function. Understand the underlying jobs (rather than memorizing the words) and you can build ads in any vertical with AI." },
      { kind: "quote", body: "The pros don't think in frameworks. They think in jobs." },
      { kind: "section", num: "02", title: "The 10 Jobs Every Great Ad Does", id: "ten-jobs" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Pattern Interrupt", desc: "Stop the scroll. Contrarian statement, weird visual, wait-what moment." },
        { num: "02", title: "Audience ID", desc: "Tell the right person this is for them. Geography, age, profession, situation." },
        { num: "03", title: "Problem Statement", desc: "Name the pain so they nod. Specific, recognized, daily." },
        { num: "04", title: "Agitate", desc: "Twist the knife. Why this pain is worse than they think or growing fast." },
        { num: "05", title: "Villain / Old Way", desc: "Blame something external. It's not your fault, it's X. Big emotional unlock." },
        { num: "06", title: "Mechanism / New Way", desc: "The unique angle. What's different. Why it works when nothing else has." },
        { num: "07", title: "Proof", desc: "Reviews, numbers, press logos, before/after, doctors, years in business." },
        { num: "08", title: "Benefit Stack", desc: "The 3 outcomes they actually care about. Short and rhythmic." },
        { num: "09", title: "Offer + Risk Reversal", desc: "Price, bonus, guarantee, free trial. Removes the what-if-it-doesn't-work fear." },
        { num: "10", title: "Urgency + CTA", desc: "Deadline, low stock, limited spots, plus the clear next step." }
      ]},
      { kind: "takeaway", text: "Once you internalize this list, your brain auto-tags each line as you read." },
      { kind: "section", num: "03", title: "Live X-Ray 1: GLP-1 Weight Loss Clinic (Local)", id: "xray-glp1" },
      { kind: "table", headers: ["Line", "Job"], rows: [
        ["Houston women over 35, losing weight isn't about willpower.", "Pattern Interrupt + Audience ID"],
        ["It's about the hormone your doctor never tested for.", "Villain / Old Way"],
        ["At [Clinic], MDs prescribe semaglutide and run full hormone panels.", "Mechanism / New Way"],
        ["800+ patients, average 22 lbs lost in 90 days.", "Proof"],
        ["First consult plus labs is $49 this month, normally $299.", "Offer"],
        ["FDA-approved meds. Real MDs. No gimmicks.", "Risk Reversal"],
        ["Only 12 spots left for May.", "Urgency"],
        ["Tap below to book.", "CTA"]
      ]},
      { kind: "p", body: "Every sentence does one job. The order mirrors how a scrolling brain works. Big benefit stack and agitate are absent: in this niche the audience already lives with daily pain, so mechanism moves to prominence." },
      { kind: "section", num: "04", title: "Live X-Ray 2: Cryo Practice (Local)", id: "xray-cryo" },
      { kind: "table", headers: ["Line", "Job"], rows: [
        ["Stretching isn't fixing your back. You need to fix the inflammation.", "Pattern Interrupt + Villain"],
        ["Austin people over 30 with chronic back, knee, or shoulder pain, this is for you.", "Audience ID + Problem"],
        ["Three minutes in our cryo chamber drops your body temp 40 degrees and shuts off inflammation at the source.", "Mechanism / New Way"],
        ["NFL teams, UFC fighters, and 1,400+ Austin locals use it every week.", "Proof"],
        ["First session free. Bring a friend, theirs is free too.", "Offer + Risk Reversal"],
        ["This week only. We block 20 free sessions then we're done.", "Urgency"],
        ["Book your free session in 30 seconds.", "CTA"]
      ]},
      { kind: "p", body: "Same skeleton, different tone. When the audience doesn't initially want your service, the mechanism does the heavy lifting. It must make them think oh, that's actually clever." },
      { kind: "section", num: "05", title: "Live X-Ray 3: Ecom Skincare Serum", id: "xray-ecom" },
      { kind: "table", headers: ["Line", "Job"], rows: [
        ["Stop using retinol at night. It's making your skin worse.", "Pattern Interrupt + Villain"],
        ["99% of retinols oxidize in 3 weeks. That's why your skin gets red and flaky.", "Problem + Agitate"],
        ["Ours uses encapsulated retinaldehyde. 11x stronger, zero irritation.", "Mechanism"],
        ["24,000+ five-star reviews. Featured in Vogue and Allure.", "Proof"],
        ["Smoother skin in 14 days. Fewer lines in 30. No peeling.", "Benefit Stack"],
        ["40% off plus free serum sample today.", "Offer"],
        ["60-day glow guarantee or full refund.", "Risk Reversal"],
        ["Sold out 3 times this year. Restock just dropped.", "Urgency"],
        ["Shop Now.", "CTA"]
      ]},
      { kind: "p", body: "Nine jobs in eight lines. Ecom moves fast because visuals handle audience ID and pattern interrupt at once. Scripts jump to the villain. Ecom skeletons are dense. Local skeletons are slower and trust-heavy. Info products and high-ticket are slower still." },
      { kind: "section", num: "06", title: "The Master Prompt: Skeleton to Ad with AI", id: "master-prompt" },
      { kind: "p", body: "Once you have a skeleton, feed it to AI as a senior direct response copywriter and pass it the jobs list, your product, audience, pain, offer, and tone. The prompt forbids copying words from examples, requires matching the rhythm (one sentence per line, max 12 words, under 90 words total), bans corporate language, em dashes, and triple structures, and asks for 5 variations each with a one-sentence note on what's different. Magic lives in the skeleton, not the model. Claude tends to write the most natural lines; ChatGPT is faster." },
      { kind: "section", num: "07", title: "Where to Find Winning Ads to Rip", id: "where-to-find" },
      { kind: "h3", text: "The Free Way: Meta Ad Library" },
      { kind: "list", items: [
        "Open facebook.com/ads/library. Country: United States. Category: All ads.",
        "Search the brand name to see every active ad they're running.",
        "Filter for Active ads only. Killed ads don't matter.",
        "Check start date: 30+ days running is working, 60+ is scaling, 90+ is a control they won't change. Study those.",
        "Copy the headline and body into a doc. Apply the 10-job framework. Tag each line. You have a skeleton."
      ]},
      { kind: "h3", text: "The Pro Way: Spy Tools" },
      { kind: "table", headers: ["Tool", "Why", "Price"], rows: [
        ["Foreplay.co", "Spyder auto-tracks brands and pulls every ad. Curated library tagged by hook, format, angle. Used by top DR pros. Start here if buying one tool.", "$49 to $99/mo"],
        ["Atria", "Newer, AI-powered. Scores ads, surfaces winning hooks, generates scripts. Best if already running $5K+/mo in ads.", "~$99/mo"],
        ["Magic Brief", "Creative brief tool with built-in ad library. Popular with UGC agencies.", "~$99/mo"],
        ["AdSpy", "155M+ ads in 88 languages. Massive database, advanced filters, CTA search. Dated interface.", "$149/mo"],
        ["Minea", "Ecom-focused. Drop a competitor URL, see all their ads plus tested products. Best for dropshippers.", "$49 to $99/mo"]
      ]},
      { kind: "quote", body: "If you only buy one, buy Foreplay. Every direct response person worth following on X uses it." },
      { kind: "section", num: "08", title: "The Brands to Study", id: "brands-to-study" },
      { kind: "h3", text: "GLP-1 / Weight Loss Telehealth" },
      { kind: "list", items: [
        "Hims & Hers: biggest GLP-1 advertiser. Long-form curiosity hooks.",
        "Ro (Ro Body): premium positioning, clean creative, MD-led trust.",
        "Henry Meds: aggressive offers, low-friction signup, risk reversal masters.",
        "Mochi Health: female-targeted, beauty-adjacent, soft sell.",
        "Found: personalized weight loss, hormone testing positioning.",
        "LifeMD: scaled telehealth, strong UGC plus testimonial library.",
        "Calibrate: premium, science-heavy mechanism, slower funnel.",
        "Sequence (WeightWatchers): brand authority plus GLP-1, lifestyle creative."
      ]},
      { kind: "h3", text: "Cryo / Wellness / Recovery" },
      { kind: "list", items: [
        "Restore Hyper Wellness: biggest US chain (IV, cryo, red light). Menu ad masters.",
        "iCRYO: franchise, local-targeted city-by-city. Geo-hook study.",
        "Perspire Sauna Studio: infrared sauna, female wellness positioning.",
        "The Cold Plunge: tubs plus studios. Biohacking angle.",
        "CryoUSA: older brand, dialed offers and local hooks."
      ]},
      { kind: "h3", text: "Ecom DR Brands" },
      { kind: "list", items: [
        "True Classic: $300M apparel built on Meta. UGC king.",
        "Hexclad: cookware. Masters of old way vs new way reveal.",
        "Olipop: soda alternative. Category reframing in 5 seconds.",
        "AG1 (Athletic Greens): textbook authority plus benefit stack.",
        "Magic Spoon: cereal. Brilliant villain framing.",
        "Manscaped: grooming. Humor as pattern interrupt.",
        "Liquid Death: water. Brand-led with DR mechanics underneath.",
        "Ridge Wallet: DTC original. Offer stack and risk reversal language.",
        "Lume Deodorant: problem-you-didn't-know-you-had angle.",
        "Tushy: bidet. Makes a boring product scroll-stopping."
      ]},
      { kind: "section", num: "09", title: "Keyword Hunting", id: "keyword-hunting" },
      { kind: "p", body: "Meta Ad Library searches keywords, not just brands. This reveals competitors you don't know yet and shows niche heat. Set country to US and ad category to All ads. Toggle from Advertiser to Ad Content to search inside copy. Use specific niche language: weight loss returns 50,000+ ads (useless); tirzepatide returns ~800 (actionable). Use quotes for exact phrases. Result counts: 5,000+ is hot, 500 to 2,000 is healthy, under 200 is small or early." },
      { kind: "h3", text: "GLP-1 Keywords" },
      { kind: "list", items: [
        "semaglutide: drug name, catches every brand selling it",
        "tirzepatide: newer drug, newer brands, less crowded",
        "compounded GLP-1: telehealth selling cheaper versions",
        "weight loss injection: consumer-facing language",
        "ozempic alternative: positioning keyword",
        "telehealth weight loss: entire telehealth model",
        "stubborn belly fat: classic DR pain hook",
        "hormone weight loss: female-targeted menopause and metabolism"
      ]},
      { kind: "h3", text: "Cryo / Wellness Keywords" },
      { kind: "list", items: [
        "cryotherapy: core term, clinics and home equipment",
        "cold plunge: huge in 2026",
        "infrared sauna: wellness/beauty crossover, female-skewed",
        "red light therapy: at-home and clinic combos, premium",
        "recovery studio: local-only positioning",
        "chronic inflammation: pain hook",
        "biohacking: premium DTC and clinics",
        "first session free: offer-based tripwire"
      ]},
      { kind: "h3", text: "Ecom Keywords" },
      { kind: "list", items: [
        "retinol serum: most saturated skincare niche",
        "peptide serum: newer angle, premium, less competitive",
        "gut health: probiotics and digestion",
        "bloating: pain hook for supplements, probiotics, hormones",
        "berberine: natural ozempic play riding GLP-1 wave",
        "non toxic cookware: premium, old way vs new way",
        "premium tee: True Classic style ads, UGC heavy",
        "as seen on shark tank: authority and press-logo plays"
      ]},
      { kind: "h3", text: "Hook-Based Keywords" },
      { kind: "list", items: [
        "stop using: villain pattern interrupt",
        "the truth about: curiosity gap opener",
        "not your fault: reframe plus villain",
        "why your X isn't: pattern of blame",
        "99% of: authority plus villain",
        "doctor approved: authority hook"
      ]},
      { kind: "h3", text: "The Scaled-Ad Filter Workflow" },
      { kind: "list", items: [
        "Sort by start date, oldest first. Old and still active equals scaled.",
        "Look for repeat creative. Same hook in 5+ videos or formats equals winner.",
        "Click see ad details. Multi-platform placement means bigger budget.",
        "Check the page library. 50+ active ads is scaling, 5 is testing.",
        "Save winners to a swipe file. Screenshot plus paste body text. Build skeleton inventory."
      ]},
      { kind: "p", body: "Rule of thumb: if a keyword returns 200+ active ads and the same 5 to 10 brands keep showing up, that's a hot scaled niche. Those brands are your skeleton library." },
      { kind: "section", num: "10", title: "Homework", id: "homework" },
      { kind: "list", items: [
        "Pick 5 brands close to your niche. Open Meta Ad Library. Find one ad per brand running 60+ days.",
        "Tag every line with a job using the 10-job list. You now have 5 skeletons.",
        "Find the common skeleton: across all 5 ads, what jobs show up most and in what order? That's the master skeleton for the vertical.",
        "Feed the master skeleton into the AI prompt. Generate 5 ads, pick strongest 2. That's your launch creative."
      ]},
      { kind: "takeaway", text: "After one week, you stop reading ads as words. You read them as skeletons. That's the single biggest unlock in direct response. Once it clicks, you never go back." }
    ]
  },
  {
    id: "bonus-niche-landing-page",
    category: "bonus",
    title: "Niche Landing Page in 10 Min",
    lede: "When prospects research your business after the first message, generic or missing pages kill deals. Build prospect-specific pages with Claude and ship them on Vercel in ten minutes.",
    readTimeMin: 30,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/bonus-niche-landing-page.html" },
    body: [
      { kind: "learnPanel", items: [
        "Why niche-specific pages convert better than one generic agency site",
        "The master Claude prompt for a niche landing page",
        "Deploy from local file to live URL in 60 seconds on Vercel",
        "Build a personal authority page that holds up when prospects Google you"
      ]},
      { kind: "section", num: "01", title: "Why Niche-Specific Pages Win", id: "why-niche-pages" },
      { kind: "p", body: "Rather than maintaining one generic agency site, create a dedicated page for each target industry. Niche pages signal expertise (you speak the language and know the problems), eliminate legitimacy doubt (a professional presence kills the spam perception), and pre-sell the call (prospects show up 70% convinced)." },
      { kind: "section", num: "02", title: "What You Need", id: "what-you-need" },
      { kind: "list", items: [
        "Claude.ai account (free tier works, Pro is faster)",
        "Vercel account (free, requires GitHub connection)",
        "GitHub account (free)",
        "Prospect info: business name, niche, city"
      ]},
      { kind: "section", num: "03", title: "Niche Variables", id: "niche-variables" },
      { kind: "table", headers: ["Niche", "Pain", "Dream Outcome"], rows: [
        ["Plumbing", "Seasonal slow months, depending on word-of-mouth", "Booked solid 52 weeks/year"],
        ["Dentistry", "Empty appointment slots, high no-show rate", "Full schedule, higher-value patients"],
        ["Real Estate", "Zillow leads are expensive and low quality", "Consistent stream of motivated buyers/sellers"],
        ["Med Spa", "Hard to stand out, promotions kill margins", "Fully booked high-ticket services"],
        ["Gym/Fitness", "High churn, competing with big chains on price", "Full membership, low churn, loyal community"],
        ["Home Services", "Job boards expensive, seasonality kills cash flow", "Consistent inbound leads year-round"],
        ["Ecommerce", "Rising ad costs, iOS attribution challenges", "Profitable ROAS with predictable CAC"]
      ]},
      { kind: "section", num: "04", title: "The Master Claude Prompt", id: "master-prompt" },
      { kind: "p", body: "The prompt asks Claude to write a niche landing page with a headline tying the industry pain to a dream outcome, a What We Do section explaining AI-powered Meta ads in industry language, a Results We Get section with 2 to 3 realistic outcome bullets, a 3-step How It Works (Discovery, 7-day build, Ongoing optimization), an About Us positioning the agency as niche-focused, and a CTA button to Calendly." },
      { kind: "p", body: "Design specs: dark background (#0A0A0A), white text, blue accents (#3B82F6). Mobile responsive, minimal and premium, text-only, single HTML file with inline CSS. Output is just the HTML file, no explanations." },
      { kind: "section", num: "05", title: "Personalize with the Prospect's Name", id: "personalize" },
      { kind: "p", body: "A follow-up prompt adds two personalization moves: insert the prospect's business name into the hero headline, and add a line acknowledging that you've specifically reviewed their business and know you can help. Layer in scarcity by mentioning you take one client per city. The combination buys instant credibility and urgency." },
      { kind: "section", num: "06", title: "Deploy to Vercel in 60 Seconds", id: "deploy-vercel" },
      { kind: "list", items: [
        "Save the Claude HTML output as index.html locally",
        "Create a GitHub repository and upload the index.html file",
        "Connect the repository to Vercel and trigger an automatic deployment",
        "Receive a live URL immediately (e.g. yourproject.vercel.app)",
        "Send the link to prospects who ask for more information",
        "Optional: connect a custom domain via Namecheap (about $12/year)"
      ]},
      { kind: "section", num: "07", title: "Scale: One Page Per Niche", id: "scale" },
      { kind: "p", body: "Build a dedicated page for each target niche before you launch outreach. Conversion on replied messages doubles when the niche page already exists, versus scrambling to build one after replies come in." },
      { kind: "table", headers: ["Niche Page", "Build Time"], rows: [
        ["Plumbing ads page", "10 minutes"],
        ["Dental ads page", "10 minutes"],
        ["Real estate ads page", "10 minutes"],
        ["Med spa ads page", "10 minutes"]
      ]},
      { kind: "section", num: "08", title: "Action Checklist", id: "action-checklist" },
      { kind: "h3", text: "Today" },
      { kind: "list", items: [
        "Pick a single starting niche",
        "Create GitHub and Vercel accounts",
        "Run the master Claude prompt with filled variables",
        "Deploy to Vercel and grab the live URL"
      ]},
      { kind: "h3", text: "This Week" },
      { kind: "list", items: [
        "Build two more niche pages to cover your top 3",
        "Reference niche-specific landing pages in outreach replies",
        "Buy a niche-focused domain if budget allows"
      ]},
      { kind: "takeaway", text: "You're not building a website. You're building a trust machine." },
      { kind: "section", num: "09", title: "Bonus: Build Your Own Authority Page", id: "authority-page" },
      { kind: "p", body: "Your personal authority page is what shows up when a prospect Googles your name after the first contact. You can launch without case studies by leading with mechanism (AI Arbitrage System), niche specificity, and process." },
      { kind: "machineGrid", items: [
        { num: "01", title: "Hero", desc: "Photo plus headline positioning you as the helper for specific niches in a specific region. Calendly CTA." },
        { num: "02", title: "Niche Specificity", desc: "Three cards showcasing target industries with value props." },
        { num: "03", title: "Process", desc: "Three-step framework: Discovery, AI campaign build, Launch and optimize." },
        { num: "04", title: "AI Arbitrage System", desc: "Your credibility anchor: simultaneous testing, audience identification, daily optimization." },
        { num: "05", title: "Exclusivity", desc: "One client per niche per area positioning." },
        { num: "06", title: "About", desc: "Honest 2-3 sentence bio with photo and social links." },
        { num: "07", title: "Final CTA", desc: "Call-to-action with objection handling: you'll walk away with 3 things you can do immediately." }
      ]},
      { kind: "p", body: "The authority page prompt takes your name, region, three target niches, Calendly link, photo URL (or initials placeholder), and a short bio. Specs: dark mode with #3B82F6 blue accents, mobile responsive single HTML file with inline CSS, output is the complete HTML only. Use a professional placeholder with initials if you don't have a photo yet. Mechanism and process establish authority without existing case studies." }
    ]
  },
  {
    id: "bonus-claude-freepik-mcp",
    category: "bonus",
    title: "Meta Ads MCP + AI Creative Stack",
    lede: "Two halves: install Meta's official Ads MCP on Claude Desktop and Claude Code to pull and analyze client data, then use Claude Design plus Freepik (Nano Banana to Seedance) to ship statics, landing pages, decks, and video for local-biz clients.",
    readTimeMin: 60,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/bonus-claude-freepik-local-biz.html" },
    body: [
      { kind: "learnPanel", items: [
        "Install Meta Ads MCP on Claude Desktop and Claude Code in under 2 minutes",
        "8 client-ready prompts for daily pulse, reports, audits, and pre-pitch audits",
        "6 static ad creative prompts plus 3 landing page prompts plus a master pitch deck prompt",
        "Freepik recipe: Nano Banana still to Seedance animation in 4 steps"
      ]},
      { kind: "section", num: "01", title: "The New Agency Math", id: "new-agency-math" },
      { kind: "p", body: "For local-biz clients on $1.5K to $5K monthly retainers, every hour in design or reporting tools eats your margin. The old way: brief, designer, 5 days, 2 ad variants, manual Looker reporting at 3 hours a week, $75 to $150/hour design over 3 to 5 day cycles, 22 to 35% margin if disciplined. The new way: brief, Claude Design plus Freepik, 60 minutes, 8 variants plus landing page plus deck. Meta MCP pulls reports on demand. 65%+ margin on the same retainer." },
      { kind: "quote", body: "Local biz budgets can't justify a $5K creative shop or a dedicated reporting analyst. Agencies that deliver volume, freshness, and clarity on tight retainers will dominate this market for the next five years." },
      { kind: "section", num: "02", title: "What's New This Week", id: "whats-new" },
      { kind: "p", body: "On April 29 2026 Meta shipped first-party AI-agent connectors in open beta. Workflow: connect Meta Business account, get a unique MCP URL, paste it into Claude Desktop or Claude Code, and Claude can pull data, create campaigns, manage catalogs, and run diagnostics. No Meta Developer App. No Marketing API approval wait." },
      { kind: "h3", text: "29 Tools Across 5 Families" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Campaigns & Ads", desc: "5 write tools: create_campaign, create_ad_set, create_ad, update_entity, activate_entity." },
        { num: "02", title: "Product Catalog", desc: "10 read/write tools: catalog_create, get_catalogs, get_details, get_diagnostics, get_feed_rules, get_products, and more." },
        { num: "03", title: "Accounts & Assets", desc: "3 read tools: get_ad_accounts, get_ad_entities, get_pages_for_business." },
        { num: "04", title: "Tracking & Datasets", desc: "4 read tools: get_dataset_details, get_dataset_quality, get_dataset_stats, get_errors." },
        { num: "05", title: "Insights & Performance", desc: "7 read tools: advertiser_context, anomaly_signal, auction_ranking_benchmarks, industry_benchmark, performance_trend, opportunity_score, help_article." }
      ]},
      { kind: "h3", text: "Your Plan: Freepik (Nano Banana + Seedance)" },
      { kind: "p", body: "Freepik consolidates Nano Banana (Google's Gemini 2.5 Flash Image, photoreal and word-edited) and Seedance (ByteDance's video model with the best natural human motion and lip-sync available). One subscription replaces Midjourney plus Runway, with a built-in image-to-video bridge and batch exports for client retainers. Same API behind TikTok's video R&D." },
      { kind: "p", body: "Stack thinking: Meta MCP is the data layer (analyze, report, manage). Claude Design is the design layer (statics, LPs, decks). Freepik is the media layer (photoreal images, video). Each does a distinct job. Stack them together." },
      { kind: "section", num: "03", title: "Install Meta Ads MCP", id: "install-meta-mcp" },
      { kind: "h3", text: "Claude Desktop in 4 clicks, 90 seconds" },
      { kind: "list", items: [
        "Open Claude Settings then Connectors (profile icon, bottom-left)",
        "Click + Add custom connector at the top right of the Connectors panel",
        "Fill in NAME as META MCP and MCP SERVER URL as https://mcp.facebook.com/ads, then Add",
        "Approve Meta OAuth: sign in with the same email as Ads Manager, pick the ad accounts to share, click Approve. A green status indicator confirms readiness."
      ]},
      { kind: "p", body: "To test, ask Claude to list all your Meta ad accounts with account name, currency, status, and total spend in the last 7 days as a clean table. If actual accounts come back, you're done." },
      { kind: "h3", text: "Claude Code in 1 command, 30 seconds" },
      { kind: "p", body: "Add the MCP via the claude mcp add command with the http transport, pointing at https://mcp.facebook.com/ads. Verify with claude mcp list and look for meta-ads connected. OAuth happens in your browser on first use." },
      { kind: "section", num: "04", title: "8 Prompts for Client-Ready Output", id: "client-prompts" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Daily Pulse Dashboard", desc: "Yesterday's performance grouped by campaign, with spend, CPM, CTR, CPA, conversions vs 7-day average. HTML dashboard with red/yellow/green cards and a recommended action." },
        { num: "02", title: "Friday Client Report", desc: "Last 7 days as a one-pager: spend vs target, leads/purchases, CPL trend, top 3 ads by ROAS, anomalies flagged. Confident, jargon-free, agency branded." },
        { num: "03", title: "Andromeda Cleanup Audit", desc: "14-day ad set review. Flag extended Learning Phase, sub-50 weekly conversions, CPA over 1.5x account average. Output a kill/keep/scale table." },
        { num: "04", title: "Catalog Health Check", desc: "Run catalog diagnostics, build a prioritized fix list grouped by severity with revenue-impact tier, formatted for the client's dev." },
        { num: "05", title: "Anomaly Slack Alert", desc: "Run anomaly_signal for the last 24 hours, one-line plain-English explanation plus one-line action, ready to paste into Slack." },
        { num: "06", title: "Auction Edge Report", desc: "Auction ranking benchmarks for top 10 ads by spend. Show quality, engagement, conversion ranking and explain the likely drag for losers." },
        { num: "07", title: "Pre-Pitch Account Audit", desc: "Opportunity score plus industry benchmark for the prospect, or public Meta Ad Library footprint if no account access. State-of-their-advertising pitch one-pager." },
        { num: "08", title: "Bloomberg-Style Live Dashboard", desc: "Self-refreshing HTML: today's spend, leads, ROAS as big numbers with up/down arrows, 7-day revenue bar chart, top 5 ads, anomaly feed. Dense, monospace, dark." }
      ]},
      { kind: "section", num: "05", title: "Claude Design: Statics, LPs and Decks", id: "claude-design" },
      { kind: "p", body: "Claude outputs HTML/CSS artifacts, not raster images. Screenshot HTML to PNG for ads, deploy directly as landing pages, or PDF-export as decks. One output engine, three deliverables." },
      { kind: "takeaway", text: "Drop reference images in when prompting. Brand kits, competitor ads, vibe boards, Figma frames, website screenshots. Claude reads visual style and matches it." },
      { kind: "p", body: "Workflow: drop in brand kit, logo, competitor ads, existing website. Tell Claude to match the brand's vibe or design in that style for your niche. Iterate by asking for 10 more variations changing only the hook." },
      { kind: "section", num: "06", title: "6 Niche Static Ad Prompts", id: "static-ad-prompts" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Family Dentist (1080x1080)", desc: "Before/after warm trust ad. Headline about a kid's first dental visit not ending in tears. Mint and cream palette, Playfair plus Inter, 5-star badge, 247 happy families this year." },
        { num: "02", title: "Local Gym 35-50 (1080x1350)", desc: "Transformation plus offer for dads. Matte black plus neon green, Bebas Neue, stats panel (22 lbs / 16 weeks / 3x per week), 5 spots left urgency." },
        { num: "03", title: "Italian Restaurant (1080x1080)", desc: "Hand-written Wednesday secret menu. Cream and brown chalkboard, Caveat plus Cormorant, 3 dishes with prices, walk-in only 6 to 9 PM." },
        { num: "04", title: "Real Estate Seller (1080x1350)", desc: "Sold-listing flex. Headline about $47K over asking in 8 days. Navy plus champagne, Cormorant Garamond plus Manrope, before/after price tags, DM PLAYBOOK CTA." },
        { num: "05", title: "Hair Salon (1080x1920)", desc: "Story-format before/after for a colorist. Soft pink plus rose gold, Didot or Bodoni, two photo boxes labeled 9 AM and 1 PM, DM GLOW CTA." },
        { num: "06", title: "Plumber (1080x1080)", desc: "Trust-builder: We answer the phone. Apparently that's rare now. Red and white, condensed Oswald plus Inter, 3 stats (24/7, $0 quote, 4.9 stars on 312 reviews)." }
      ]},
      { kind: "h3", text: "The Combo: Meta MCP plus Claude Design" },
      { kind: "p", body: "One winning ad, 10 variations in 4 minutes. Use Meta MCP to find the top-performing ad in the account over 14 days (highest ROAS, minimum 50 conversions), pull headline, primary text, image description, and key stats. Then have Claude design 10 HTML variations keeping the core angle: 3 new headlines, 3 new layouts (split, stacked, full-bleed), 2 new CTAs, 2 new social proof angles. Each variation gets a note on which variable changed and the hypothesis for outperformance." },
      { kind: "section", num: "07", title: "Landing Pages: Your $1.5K to $3K Deliverable", id: "landing-pages" },
      { kind: "machineGrid", items: [
        { num: "A", title: "Dentist LP", desc: "Hero (dentist your kids ask to visit), 3 promises, 3 testimonials, Meet Dr. bio, services grid, 7-question FAQ accordion, final CTA with map. Mint plus cream, Playfair plus Inter." },
        { num: "B", title: "Gym LP (12-week transformation)", desc: "Hero with video placeholder, who-this-is-for/not-for, 3 before/after cards, 4-phase timeline, 6-item what's-included, investment plus 30-day guarantee, coach bio, 8-question FAQ. Matte black plus neon green." },
        { num: "C", title: "Real Estate LP (free home valuation)", desc: "Hero with address/email/phone form, 3-step report explanation, grid of 6 recent sold listings, 5 differentiators, 3 testimonials, 6-question FAQ, repeated CTA form. Navy plus champagne, Cormorant Garamond plus Manrope." }
      ]},
      { kind: "section", num: "08", title: "Pitch Deck Master Prompt", id: "pitch-deck" },
      { kind: "p", body: "Build a 12-slide deck as a single HTML file with snap-scroll fullscreen sections: cover, opportunity, where they are now (3 honest observations), where they could be in 90 days (3 outcomes with target numbers), strategy funnel, Month 1/2/3 deliverables with one KPI each, 3 sample ad mockups, team cards, single-tier investment with one bold recommended tier, guarantee and sign here CTA. Background #0A0A0F, accent #4d8eff, Space Grotesk plus Inter, glassmorphism cards, 100vh slides, no JavaScript." },
      { kind: "section", num: "09", title: "Freepik: Nano Banana to Seedance", id: "freepik" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Source the still", desc: "Real client photo or generate from scratch with Nano Banana." },
        { num: "02", title: "Edit in Nano Banana", desc: "Clean background, swap product, change time of day, add brand colors." },
        { num: "03", title: "Animate with Seedance", desc: "5-second image-to-video with a specific gesture and camera move." },
        { num: "04", title: "Stitch in CapCut", desc: "Captions, music, CTA card, brand outro. Export 9:16, 1:1, 16:9." }
      ]},
      { kind: "h3", text: "6 Niche Video Prompt Pairs" },
      { kind: "p", body: "Dentist: photoreal warm modern dental office, female dentist in light-blue scrubs gently examining a smiling 8-year-old, soft natural light, documentary style. Seedance animates the dentist lifting the mirror, smiling, turning to camera with a thumbs-up while the child laughs. 5 seconds." },
      { kind: "p", body: "Local Gym: photoreal gritty 6 AM gym, 45-year-old man mid-deadlift with sweat on his forehead, cinematic anamorphic look. Seedance has him rack the bar, exhale heavily, and give a confident nod to camera. 5 seconds." },
      { kind: "p", body: "Restaurant: top-down shot of a wood-fired pizza pulled from the oven, cheese bubbling, smoke rising, basil scattered, dim warm restaurant. Seedance pushes the camera in, the pizza lands on the table, a hand reaches in for the cheese pull. 5 seconds." },
      { kind: "p", body: "Real Estate: modern $850K family home at golden hour, JUST SOLD sign in foreground, Latina realtor smiling in a blazer. Seedance tracks left to reveal the full house, realtor turns to camera and mouths sold. 5 seconds." },
      { kind: "p", body: "Hair Salon: salon mirror selfie POV, 28-year-old woman with fresh bombshell blonde hair, black robe, soft pink lighting, ultra-realistic phone shot. Seedance has her flip her hair side to side, laugh, blow a kiss to camera. 5 seconds." },
      { kind: "p", body: "Plumber: photoreal plumber in branded polo kneeling at a clean modern kitchen sink, smiling homeowner with coffee in the background, natural daylight, documentary style. Seedance has him stand up and thumbs-up the homeowner, who laughs and nods. 5 seconds." },
      { kind: "section", num: "10", title: "The Local-Biz Agency Stack (LBAS)", id: "lbas" },
      { kind: "p", body: "Set up once. Then for each retainer client, every month, one hour gets you eight ads plus a landing page plus a pitch deck plus a Friday report." },
      { kind: "table", headers: ["#", "Step", "Tool", "Time", "Output"], rows: [
        ["00", "Install Meta Ads MCP (one-time)", "Meta + Claude Desktop/Code", "10 min", "Live data layer"],
        ["01", "Brief", "Notion / paper", "5 min", "1-page client brief"],
        ["02", "Static ad creatives x 4-6", "Claude Design", "15 min", "4-6 PNG ads"],
        ["03", "Hero images x 3-4", "Freepik / Nano Banana", "10 min", "3-4 photoreal stills"],
        ["04", "Animate top 2", "Freepik / Seedance", "10 min", "2 x 5s MP4"],
        ["05", "Stitch + caption", "CapCut", "10 min", "Final 9:16 + 1:1 ads"],
        ["06", "Friday client report", "Meta MCP + Claude", "5 min", "HTML 1-pager"],
        ["07", "Landing page (optional)", "Claude Design", "20 min", "Single-page HTML site"],
        ["08", "Pitch deck (optional)", "Claude Design", "15 min", "12-slide HTML deck"]
      ]},
      { kind: "machineGrid", items: [
        { num: "01", title: "Core Bundle", desc: "55 minutes. Steps 01 to 06. Every retainer client, every month." },
        { num: "02", title: "Premium Bundle", desc: "90 minutes. Adds landing page and deck. Charge $1.5K to $3K extra." },
        { num: "03", title: "Margin Recovery", desc: "3x to 5x improvement. Same retainer, less time, more clients." }
      ]},
      { kind: "section", num: "11", title: "Homework", id: "homework" },
      { kind: "list", items: [
        "Install Meta Ads MCP on Claude Desktop and Claude Code",
        "Run the Daily Pulse prompt on a real client account and screenshot the dashboard",
        "Create 5 static ads from Claude Design using the closest niche prompt to your client",
        "Create 2 video ads from Freepik (Nano Banana to Seedance, 5 seconds each)",
        "Create 1 landing page using a Section 4.2 prompt",
        "Ship the full bundle for one local-biz client within 48 hours"
      ]},
      { kind: "takeaway", text: "If you don't ship within 48 hours of this class, you didn't take it." }
    ]
  }
];
