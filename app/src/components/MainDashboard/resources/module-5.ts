import type { Article } from "./types";

export const MODULE_5_ARTICLES: Article[] = [
  {
    id: "m5-1-intro-ai-media-buying",
    category: "module-5",
    title: "Introduction to AI-Powered Media Buying",
    lede: "By the end of this module you will have software watching ads continuously, Claude generating copy in seconds, and a daily workflow that takes about five minutes. This is the same system used with real clients.",
    readTimeMin: 3,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.1-intro-ai-media-buying.html" },
    body: [
      { kind: "learnPanel", items: [
        "What you will build across the next four lessons",
        "How AI changes the day-to-day of media buying",
        "The two tools that do all the work, and where you sit in the loop",
        "Realistic expectations for an AI-assisted workflow"
      ]},
      { kind: "section", num: "01", title: "What You Are About to Build", id: "what-you-build" },
      { kind: "p", body: "No setup is required for this introductory lesson. It frames everything that comes after: by module's end you will have software monitoring ads continuously, Claude generating copy quickly, and a daily routine that takes roughly five minutes." },
      { kind: "section", num: "02", title: "Before AI vs After AI", id: "before-vs-after" },
      { kind: "h3", text: "Before AI (Manual Process)" },
      { kind: "list", items: [
        "Manual ad checking every few hours",
        "Guesswork about which headlines actually perform",
        "Two hours spent writing ad copy",
        "Risk of forgotten underperforming ads burning budget overnight"
      ]},
      { kind: "h3", text: "After AI (Automated Process)" },
      { kind: "list", items: [
        "Software monitors ads every minute",
        "AI generates 20 headlines in 30 seconds for human selection",
        "Underperforming ads pause themselves automatically",
        "You receive performance reports instead of discovering problems late"
      ]},
      { kind: "section", num: "03", title: "The 2-Tool System", id: "two-tool-system" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Claude Code (The Brain)", desc: "Handles ad copy writing, competitor research, and strategy. An intelligent assistant operating continuously." },
        { num: "02", title: "The Software (The Hands)", desc: "Executes ad creation on Facebook, monitors performance, and implements changes. Eliminates manual interface clicking." }
      ]},
      { kind: "p", body: "You remain the decision-maker. These two tools manage the operational tasks." },
      { kind: "section", num: "04", title: "What You Will Have by the End", id: "end-state" },
      { kind: "list", items: [
        "Claude Code configured and operational",
        "Software connected to a Facebook ad account",
        "AI agent with rules for ad management",
        "Daily routine that takes five minutes"
      ]},
      { kind: "section", num: "05", title: "Real Talk, Set Your Expectations", id: "expectations" },
      { kind: "takeaway", text: "This is not a passive income solution. You still think and decide. AI is an advanced tool that requires skilled operation. This module teaches the practical application." },
      { kind: "p", body: "Lesson 5.2 covers Claude Code setup and takes about fifteen minutes." }
    ]
  },
  {
    id: "m5-2-ai-orchestrator-setup",
    category: "module-5",
    title: "Claude Code Setup",
    lede: "A hands-on install that takes about fifteen minutes. All you need is a computer and an internet connection. No coding knowledge required.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.2-claude-code-setup.html" },
    body: [
      { kind: "learnPanel", items: [
        "What Claude Code is and why we use VS Code as the interface",
        "How to install VS Code, the Claude Code extension, and Git Bash on Windows",
        "How to set up your agent's personality and CLAUDE.md knowledge file",
        "How to verify it all works with a quick ad-copy test"
      ]},
      { kind: "section", num: "01", title: "What Is Claude Code?", id: "what-is-claude-code" },
      { kind: "p", body: "Claude Code is an AI assistant you talk to in plain English. It can write ad copy, do research, and analyze data. It was built by Anthropic. We run it inside VS Code, a free Microsoft application that here functions mostly as a chat interface, not a coding tool." },
      { kind: "section", num: "02", title: "Installation Steps Overview", id: "install-overview" },
      { kind: "list", items: [
        "Step 1: Download VS Code from code.visualstudio.com",
        "Step 2 (Windows only): Install Git Bash from gitforwindows.org",
        "Step 3: Install the Claude Code extension via the VS Code marketplace",
        "Step 4: Sign in with an Anthropic account (Pro plan, $20/month)",
        "Step 5: Create your project folder (your HQ)",
        "Step 6: Choose your agent's personality",
        "Step 7: Create the CLAUDE.md configuration file",
        "Step 8: Test with sample prompts"
      ]},
      { kind: "section", num: "03", title: "Step 1: Download VS Code", id: "download-vscode" },
      { kind: "list", items: [
        "Go to code.visualstudio.com in your browser",
        "Click the blue download button (it auto-detects your OS)",
        "Mac: open the file and drag VS Code to Applications",
        "Windows: open the file and click Install",
        "Launch VS Code. The dark welcome screen is normal"
      ]},
      { kind: "p", body: "Windows users have one more step. Download Git Bash from gitforwindows.org. Claude Code needs it to talk to the system properly. Install takes about two minutes." },
      { kind: "section", num: "04", title: "Step 2: Install the Claude Code Extension", id: "install-extension" },
      { kind: "list", items: [
        "In the VS Code left sidebar, click the four-squares icon",
        "This opens the Extensions panel",
        "Type 'Claude Code' in the search bar",
        "Select the option verified by Anthropic (look for the checkmark)",
        "Click the blue Install button",
        "Wait about 10 seconds for it to finish"
      ]},
      { kind: "section", num: "05", title: "Step 3: Sign In", id: "sign-in" },
      { kind: "list", items: [
        "Press Ctrl+Shift+P (Windows) or Cmd+Shift+P (Mac) to open the command search",
        "Type 'Claude: Sign In' and select it",
        "A browser opens for Anthropic login or account creation",
        "Pick the Pro plan ($20/month)",
        "Return to VS Code. The Claude chat panel should appear"
      ]},
      { kind: "p", body: "If the chat panel does not appear, click View in the top menu and select Claude Code." },
      { kind: "section", num: "06", title: "Step 4: Create Your HQ", id: "create-hq" },
      { kind: "p", body: "This folder is your agent's operational base. All client files, ad copy, and reports live here. Pick a name you will use often." },
      { kind: "list", items: [
        "Click File then Open Folder",
        "Create a new Desktop folder with your chosen name",
        "Avoid spaces in the folder name. Use dashes",
        "Examples: the-brain, hq, command-center, the-lab"
      ]},
      { kind: "section", num: "07", title: "Step 5: Choose Your Agent's Personality", id: "personality" },
      { kind: "machineGrid", items: [
        { num: "01", title: "J.A.R.V.I.S. (The Strategist)", desc: "Calm, precise, dry humor. Addresses you as Sir. British butler aesthetic. Precision, wit, class." },
        { num: "02", title: "HARVEY (The Closer)", desc: "Confident, sharp, unfiltered. Identifies strategic weaknesses and pushes bigger thinking. Blunt, bold, winner." },
        { num: "03", title: "ALFRED (The Mentor)", desc: "Patient and wise. Provides reasoning. Wisdom, patience, depth." },
        { num: "04", title: "F.R.I.D.A.Y. (The Operator)", desc: "Fast, efficient, minimal flair. Answer-first approach. Speed, minimal, clean." },
        { num: "05", title: "DONNA (The Chief of Staff)", desc: "Sharp, organized, proactive. Anticipates needs with light sarcasm. Sharp, organized, sass." },
        { num: "06", title: "Build Your Own", desc: "Create a personalized personality from scratch." }
      ]},
      { kind: "section", num: "08", title: "Step 6: Create Your CLAUDE.md File", id: "claude-md" },
      { kind: "p", body: "This file is your agent's knowledge base. It sets identity, communication style, and business context. Claude reads it at the start of every conversation." },
      { kind: "list", items: [
        "Right-click in the left file panel, choose New File",
        "Name it exactly CLAUDE.md",
        "Paste the personality template you picked",
        "Fill in the bracketed sections with your details",
        "Save the file"
      ]},
      { kind: "h3", text: "Template Sections (Common to All)" },
      { kind: "list", items: [
        "Identity: agent name, role, communication style parameters",
        "Personality rules: response guidelines, interaction preferences, challenge and feedback style",
        "Who I am: your name, agency (or solo), primary function (Facebook/Instagram ad management)",
        "My clients: space for client names and details, added over time",
        "Ad copy rules: natural non-salesy tone, 3 to 5 headline variations per request, 6th grade reading level, metrics focus (cost per result, CTR, ROAS), flag anything that breaks Meta policy",
        "My voice: the tone you want for ads"
      ]},
      { kind: "section", num: "09", title: "Step 7: Test It", id: "test-it" },
      { kind: "list", items: [
        "In the Claude chat panel, type: Write me 3 Facebook ad headlines for a pizza shop",
        "Press Enter and verify headlines appear",
        "Optional second test: Give me 5 Instagram story ideas for a gym"
      ]},
      { kind: "section", num: "10", title: "Troubleshooting", id: "troubleshooting" },
      { kind: "list", items: [
        "Claude not responding: close and reopen VS Code (fixes 90% of issues)",
        "Extension not found: search inside the Extensions panel (four-squares icon), not the regular search bar",
        "Sign-in not working: clear browser cookies for anthropic.com and retry"
      ]},
      { kind: "p", body: "With Claude configured, the next lesson covers connecting the software to your Facebook ad account." }
    ]
  },
  {
    id: "m5-3-meta-api-connection",
    category: "module-5",
    title: "Connecting Software to Meta API",
    lede: "A one-time setup that links your software to a Facebook ad account through an API. After this, you can create, monitor, and adjust ads without touching Facebook directly.",
    readTimeMin: 20,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.3-meta-api-connection.html" },
    body: [
      { kind: "learnPanel", items: [
        "What an API is and why you need one for ad automation",
        "How to create a Meta developer app tied to your Business Manager",
        "How to generate the access token and grab your Ad Account ID",
        "How to verify the connection and fix the most common errors"
      ]},
      { kind: "section", num: "01", title: "What Is an API?", id: "what-is-an-api" },
      { kind: "p", body: "An API is a secure communication channel between your software and Facebook. It lets the software create ads, monitor performance, and adjust campaigns without you logging into Facebook every time." },
      { kind: "section", num: "02", title: "Before You Start", id: "prerequisites" },
      { kind: "list", items: [
        "Meta Business Manager already set up (covered in Module 3)",
        "Your Facebook Page connected to Business Manager",
        "Admin access to the Business Manager you are working from"
      ]},
      { kind: "p", body: "If you manage client ad accounts, the client must grant access through their own Business Manager. Do not skip this. If any prerequisite is missing, revisit Module 3 first." },
      { kind: "section", num: "03", title: "Step 1: Go to Meta Developers", id: "step-1-developers" },
      { kind: "list", items: [
        "Go to developers.facebook.com",
        "Click Log In using the Facebook account tied to your Business Manager",
        "Land on the Meta for Developers dashboard",
        "Select My Apps from the top right",
        "Click the green Create App button"
      ]},
      { kind: "section", num: "04", title: "Step 2: Create Your App", id: "step-2-create-app" },
      { kind: "list", items: [
        "Select Business as the app type",
        "Name it something memorable (e.g., 'My Agency Ads Tool'). Only you see it",
        "Provide a contact email",
        "Select your Business Manager from the portfolio options",
        "Click Create App",
        "Complete any security verification if prompted"
      ]},
      { kind: "p", body: "The word 'app' here just means a container holding your connection credentials. You are not building software." },
      { kind: "section", num: "05", title: "Step 3: Get Your Access Token", id: "step-3-token" },
      { kind: "list", items: [
        "In the left dashboard menu, click Tools",
        "Open Graph API Explorer",
        "On the right, select User Token from the User or Page dropdown",
        "Add the four permissions one at a time",
        "Click Generate Access Token (blue button)",
        "Click Continue on the popup to authorize",
        "Copy the resulting token string"
      ]},
      { kind: "h3", text: "The Four Permissions" },
      { kind: "list", items: [
        "ads_management: lets the software create and modify ads",
        "ads_read: lets the software view ad performance data",
        "business_management: grants access to Business Manager",
        "pages_read_engagement: lets the software read Page information"
      ]},
      { kind: "takeaway", text: "Treat this token like a banking password. It gives full control of your ad account. Initial tokens expire in about an hour. The software will help you convert it to a long-lived sixty-day token." },
      { kind: "section", num: "06", title: "Step 4: Paste Into the Software", id: "step-4-paste" },
      { kind: "list", items: [
        "Open the software",
        "Go to Settings, then Meta Connection (or API Settings)",
        "Paste your access token into the field",
        "Enter your Ad Account ID (Business Manager, Ad Accounts; it starts with 'act_')",
        "Click Connect or Save"
      ]},
      { kind: "section", num: "07", title: "Step 5: Test the Connection", id: "step-5-test" },
      { kind: "list", items: [
        "Open the Campaigns or Dashboard section in the software",
        "If connected, your existing campaigns appear",
        "If you have no campaigns, you see an empty list with no error",
        "Either result confirms a working connection"
      ]},
      { kind: "section", num: "08", title: "Troubleshooting", id: "troubleshooting" },
      { kind: "list", items: [
        "Invalid token: it expired. Go back to Graph API Explorer and generate a new one",
        "No ad account found: confirm your Ad Account ID starts with 'act_'",
        "Permissions error: return to Step 3 and confirm all four permissions were added",
        "Business not found: you need admin access on the Business Manager, not employee-level"
      ]},
      { kind: "section", num: "09", title: "What's Next", id: "whats-next" },
      { kind: "list", items: [
        "Brain (Claude Code): connected",
        "Hands (Software to Facebook): connected"
      ]},
      { kind: "p", body: "Lesson 5.4 covers configuring the automation rules so the system can run on autopilot." }
    ]
  },
  {
    id: "m5-4-ai-media-buying-agent",
    category: "module-5",
    title: "Your AI Media Buying Agent",
    lede: "This lesson installs a full Traffic Command system into Claude Code: five specialized agents, over 500 knowledge files from real campaigns, plug-and-play skills, and built-in commands. It is the same system used in the agency.",
    readTimeMin: 10,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.4-ai-media-buying-agent.html" },
    body: [
      { kind: "learnPanel", items: [
        "Who the five specialist sub-agents are and what each one does",
        "How to install Traffic Command into your existing Claude Code workspace",
        "How to test it with diagnosis, creative, and strategy prompts",
        "What knowledge, skills, commands, and templates come bundled"
      ]},
      { kind: "section", num: "01", title: "The Five Specialized Agents", id: "five-agents" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Aurelius (Traffic Commander)", desc: "Routes incoming tasks to the right specialist based on the request." },
        { num: "02", title: "Zenith (Metrics Analyst)", desc: "Analyzes campaign data and finds performance problems plus their root causes." },
        { num: "03", title: "Vortex (Creative Architect)", desc: "Develops ad copy, generates hooks, and explores messaging angles." },
        { num: "04", title: "Nexus (Tracking Specialist)", desc: "Handles pixel implementation, Conversions API, and attribution modeling." },
        { num: "05", title: "Stratos (Strategy Advisor)", desc: "Owns campaign scaling, budget allocation, and overall campaign structure." }
      ]},
      { kind: "section", num: "02", title: "What's Inside the Package", id: "whats-inside" },
      { kind: "list", items: [
        "500+ knowledge files distilled from real campaigns",
        "18 plug-and-play skills (hooks, copywriting, creative briefs, metric analysis, fatigue detection, funnel review, tracking audits, structure, budget, kill/scale rules, unit economics, and more)",
        "5 built-in commands accessible inside Claude Code",
        "Client report templates",
        "A diagnostic framework that maps symptoms to the right specialist"
      ]},
      { kind: "quote", body: "This is the same system we use in our agency." },
      { kind: "section", num: "03", title: "Install It", id: "install" },
      { kind: "list", items: [
        "Open VS Code with your existing my-ad-agency folder from Lesson 5.2",
        "Drag the contents of the unzipped package into your workspace",
        "Verify these folders appear: agents/, knowledge/, skills/, commands/ plus README.md",
        "Preserve your existing CLAUDE.md. The agents folder adds to it, it does not replace it"
      ]},
      { kind: "section", num: "04", title: "Test It", id: "test-it" },
      { kind: "h3", text: "Test 1: Diagnosis (Zenith)" },
      { kind: "p", body: "Ask: My CPM is $45 and CTR is 0.6%, what is wrong? You should see Zenith reason through likely causes." },
      { kind: "h3", text: "Test 2: Creative Generation (Vortex)" },
      { kind: "p", body: "Ask: Write me 10 Facebook ad hooks for a dentist in Miami that needs more patients. Vortex should respond with niche-aware, varied hooks." },
      { kind: "h3", text: "Test 3: Strategy (Stratos)" },
      { kind: "p", body: "Ask: My client is a gym owner with $2K/month ad budget. Build me a campaign plan. Stratos should outline structure, audiences, and creative direction." },
      { kind: "p", body: "Success signs: responses reference the knowledge base, mention 'Andromeda,' apply niche-specific benchmarks, or hand off to the right specialist." },
      { kind: "section", num: "05", title: "Built-in Commands", id: "commands" },
      { kind: "list", items: [
        "/traffic for general traffic assistance",
        "/traffic-audit for a comprehensive campaign audit",
        "/traffic-diagnose to identify problems and solutions",
        "/traffic-hooks for hook generation",
        "/traffic-scale for scaling strategy"
      ]},
      { kind: "section", num: "06", title: "Templates and Diagnostic Framework", id: "templates" },
      { kind: "p", body: "Pre-built templates cover performance reporting, creative briefs, campaign audits, scaling readiness, and launch checks. The agents populate them with your campaign data." },
      { kind: "p", body: "Zenith uses pattern recognition. High CPM with low CTR usually means creative is the bottleneck (routes to Vortex). Strong CTR with low conversions points at the landing page. Strong creative with low impressions points at follow-up gaps. The system names the problem, assigns ownership, and recommends a next action." },
      { kind: "section", num: "07", title: "Setup Checklist", id: "checklist" },
      { kind: "list", items: [
        "Confirmed the agents/, knowledge/, skills/, commands/ folders plus README.md and DEVELOPER-GUIDE.md exist",
        "Ran Test 1 and received hooks using the seven-category system",
        "Ran Test 2 about high cost-per-lead and got guidance to pause when it exceeds target by 3x for four straight days",
        "Ran Test 3 and got a plan referencing Advantage+ features, creative diversity, and niche benchmarks"
      ]},
      { kind: "takeaway", text: "The agents contain the same conceptual information taught in the rest of the module. Returning to ask them clarifying questions is the intended pattern, not a fallback." }
    ]
  },
  {
    id: "m5-5-reading-ad-data-with-ai",
    category: "module-5",
    title: "Reading Your Ad Data With AI",
    lede: "Instead of staring at Ads Manager, export your data and let Claude Code tell you what to kill, scale, or test. Once you know the routine, the whole thing takes about two minutes.",
    readTimeMin: 5,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.5-reading-ad-data-with-ai.html" },
    body: [
      { kind: "learnPanel", items: [
        "How to export the right columns from Ads Manager",
        "How to feed a CSV to Claude Code and ask for kill/scale decisions",
        "What questions get the most useful answers back",
        "How often to run this, and how Adlevel will replace the manual step"
      ]},
      { kind: "section", num: "01", title: "The Process", id: "the-process" },
      { kind: "h3", text: "Step 1: Export from Ads Manager" },
      { kind: "list", items: [
        "Open Meta Ads Manager",
        "Select your date range (7 days is the recommended default)",
        "Confirm these columns are visible: Campaign name, Ad set name, Ad name, Amount spent, Results, Cost per result, CTR, CPM",
        "Go to Reports, then Export Table Data, then CSV",
        "Save the file"
      ]},
      { kind: "h3", text: "Step 2: Drop It Into Claude Code" },
      { kind: "p", body: "Drag the CSV into your Claude Code workspace folder. The agent automatically picks up files named clearly, like ads-march-9.csv." },
      { kind: "h3", text: "Step 3: Ask Your Agent to Analyze" },
      { kind: "p", body: "Give a specific prompt that includes your target metrics. Ask for profitable vs losing ads, ad sets to pause immediately, winners to scale, and tomorrow's action items. Tell it to use real numbers and be specific. Always include your target cost per lead. Without context, numbers do not mean anything." },
      { kind: "section", num: "02", title: "What You Get Back", id: "what-you-get" },
      { kind: "p", body: "The agent returns concrete callouts like: Campaign 'Local Dentist Broad' spent $142 with 3 leads at $47.33 each, nearly 2x target. It identifies underperformers, recommends pauses, highlights top performers, and suggests where to shift budget." },
      { kind: "section", num: "03", title: "Other Questions to Ask", id: "other-questions" },
      { kind: "list", items: [
        "Compare this week's data to last week. Trending up or down?",
        "Explain CPM increases in client-friendly language",
        "If my budget got cut in half tomorrow, which campaigns keep running?",
        "Generate a weekly client report from this data",
        "Which creative angles perform best? What should the next ads emphasize?"
      ]},
      { kind: "section", num: "04", title: "How Often Should You Do This?", id: "cadence" },
      { kind: "h3", text: "Weekly (Minimum)" },
      { kind: "p", body: "Export Monday mornings. Review the 7-day data, make kill/scale decisions, and send the client report." },
      { kind: "h3", text: "Daily (Recommended)" },
      { kind: "p", body: "A 2-minute export with the question: Anything I need to act on today? Catches budget-draining problems early. This is what top media buyers actually do." },
      { kind: "takeaway", text: "Name files by date (ads-2026-03-09.csv) so week-over-week comparisons in Claude are trivial." },
      { kind: "section", num: "05", title: "Common Mistakes", id: "common-mistakes" },
      { kind: "list", items: [
        "Vague requests. Specify target CPL, optimization focus, and the decisions you need",
        "Overreacting to a single day. Accounts need 3 to 7 days for patterns. Pull full weeks before big calls",
        "Missing columns. Without CPM and CTR, the agent cannot diagnose creative issues"
      ]},
      { kind: "section", num: "06", title: "What's Coming: Automatic Data", id: "whats-coming" },
      { kind: "p", body: "Adlevel removes the manual CSV export step by connecting to your ad accounts directly and feeding data to the agents in real time. No more downloads or file transfers. The agents monitor campaigns continuously and flag issues as they happen. Learning the manual flow first builds the data literacy that makes you a stronger media buyer regardless of which automation layer you pick up later." },
      { kind: "section", num: "07", title: "Checklist", id: "checklist" },
      { kind: "list", items: [
        "Exported campaign data from Ads Manager as CSV",
        "Uploaded the CSV to your Claude Code workspace",
        "Requested analysis with your target CPL included",
        "Received kill / scale / watch recommendations",
        "Decided on a daily or weekly export cadence"
      ]}
    ]
  },
  {
    id: "m5-6-ai-copy-creative-generation",
    category: "module-5",
    title: "AI Ad Copy and Creative Generation",
    lede: "Build a copy agent inside Claude Code that is trained on your client's voice, audience, and what converts on Meta. Not generic AI copy, copy that performs.",
    readTimeMin: 6,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.6-ai-ad-copy-creative-generation.html" },
    body: [
      { kind: "learnPanel", items: [
        "How to write Ad Copy Rules into CLAUDE.md",
        "How to set up a per-client copy brief so the agent remembers the voice",
        "How to run a three-round iteration loop for better hooks",
        "How to record proven winners so the agent learns over time"
      ]},
      { kind: "section", num: "01", title: "Build Your Copy Agent", id: "build-copy-agent" },
      { kind: "p", body: "Add an Ad Copy Rules section to your CLAUDE.md. The rules cover how you write, what you never do, and the hook formulas you use most." },
      { kind: "h3", text: "How I Write Ads" },
      { kind: "list", items: [
        "Sound like a real person, never a marketing textbook",
        "Short, punchy sentences. Easy to read on mobile",
        "Lead with the problem or desire, not the business name",
        "Every ad opens with a hook that stops the scroll",
        "Write at a 6th grade reading level. No jargon",
        "Include a clear CTA that tells them exactly what to do next"
      ]},
      { kind: "h3", text: "What I Never Do" },
      { kind: "list", items: [
        "No fake urgency when inventory is unlimited",
        "No income claims or guarantees the client cannot support",
        "No clickbait that does not deliver",
        "No walls of text. 5 to 7 lines max for primary text",
        "Nothing that would violate Meta ad policies"
      ]},
      { kind: "h3", text: "Hook Formulas" },
      { kind: "list", items: [
        "Problem-Agitate: Tired of [problem]? Here is why it keeps happening",
        "Result-Lead: [Specific result] in [timeframe]. Here is how",
        "Question: What would you do with [desirable outcome]?",
        "Pattern Interrupt: Start with something unexpected",
        "Social Proof: [Number] people in [location] already did this",
        "Us vs Them: Most [businesses] do X. We do Y"
      ]},
      { kind: "section", num: "02", title: "Set Up a Client Copy Brief", id: "client-brief" },
      { kind: "p", body: "Create clients/[client-name].md and fill in everything Claude needs to write in this client's voice." },
      { kind: "list", items: [
        "Business info: type, location, target audience, price range, unique angle",
        "Voice and tone: how the owner actually talks, words to use, words to avoid",
        "Current offers: what is being promoted right now",
        "Past winners: copy or angles that performed before",
        "Competitors: top local competitors and their messaging"
      ]},
      { kind: "takeaway", text: "This 10-minute setup saves hours later. Claude remembers everything." },
      { kind: "section", num: "03", title: "Generate Ad Copy", id: "generate-copy" },
      { kind: "p", body: "Ask for variations with hook, primary text, headline, and CTA, specifying the goal (leads, store visits, sales). For more control, request specific hook counts, audience awareness level (problem-aware, solution-aware, unaware), and word count limits." },
      { kind: "p", body: "For creative concepts, ask Claude to describe the visual (image or video), the on-creative hook text, the primary text, and the headline. The output should be ready to hand to a designer." },
      { kind: "section", num: "04", title: "The Iteration Loop", id: "iteration-loop" },
      { kind: "list", items: [
        "Round 1: generate 10 variations",
        "Round 2: pick the top 3 and make them punchier. Shorter sentences, stronger hooks, less AI-sounding language",
        "Round 3: create 3 emotional angles per winner. One for missing out, one for aspiration, one for solving pain"
      ]},
      { kind: "section", num: "05", title: "Train Your Agent Over Time", id: "train-agent" },
      { kind: "p", body: "After ads run, add a Proven Winners section to the client file. Record the hook, CTR, cost per lead, and why it worked. Also keep a What Didn't Work section: generic angles (0.4% CTR), long-form storytelling (ignored on mobile), discount-only hooks (attracts low LTV customers)." },
      { kind: "p", body: "Example entries: a social proof hook with a local angle landed 3.2% CTR at $8.40 CPL. A curiosity-driven hook with specific numbers landed 4.1% CTR at $6.20 CPL." },
      { kind: "takeaway", text: "After a month, your agent knows the client's audience better than most human copywriters because it references real proven approaches." },
      { kind: "section", num: "06", title: "UGC Script Generation", id: "ugc-scripts" },
      { kind: "p", body: "Ask Claude for a 30-second UGC script: a person talking to camera like a testimonial, hook in the first 2 seconds, camera directions in brackets, a natural CTA. Expect output that opens with a close-up face, shows the product, captures consumption, displays a phone screen with ordering details, and ends with a natural recommendation." },
      { kind: "section", num: "07", title: "Checklist", id: "checklist" },
      { kind: "list", items: [
        "Added Ad Copy Rules section to CLAUDE.md",
        "Created a client brief file for at least one client",
        "Generated a first batch of ad copy variations",
        "Ran a three-round iteration loop",
        "Added Proven Winners to the client file",
        "Optional: generated a UGC script",
        "Optional: generated creative concepts with visual direction"
      ]}
    ]
  },
  {
    id: "m5-7-image-generation-for-ads",
    category: "module-5",
    title: "Image Generation for Ads",
    lede: "AI image generators replace graphic designers for most ad work. Product mockups, lifestyle shots, before-and-afters, scroll-stopping visuals: minutes, not days.",
    readTimeMin: 7,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.7-image-generation-for-ads.html" },
    body: [
      { kind: "learnPanel", items: [
        "Which tool to pick first and why",
        "The five rules for prompts that produce usable ad images",
        "A reusable prompt formula plus 12 niche-ready prompts",
        "How to finish images in Canva and avoid the common mistakes"
      ]},
      { kind: "section", num: "01", title: "Which Tool to Use", id: "tools" },
      { kind: "machineGrid", items: [
        { num: "01", title: "ChatGPT (DALL-E 3)", desc: "Easiest to use. Type a description and go. The recommended starting point." },
        { num: "02", title: "Midjourney", desc: "Superior quality for lifestyle and aspirational shots. Runs inside Discord." },
        { num: "03", title: "Leonardo AI", desc: "Generous free tier and strong product-style shots." }
      ]},
      { kind: "p", body: "We focus on ChatGPT because most students already have access. The prompting principles transfer cleanly across the others." },
      { kind: "section", num: "02", title: "Prompting Rules for Ad Images", id: "prompting-rules" },
      { kind: "list", items: [
        "Be specific. Not 'a person at a gym' but 'a 30-year-old woman in a modern gym doing a dumbbell curl, smiling, black tank top, warm lighting, brick walls'",
        "Specify format. 'Square format for Instagram feed' or 'vertical 9:16 for stories'",
        "Specify style. 'Professional photo realistic' vs 'flat illustration' vs 'cinematic lighting' produce very different results",
        "Plan for text. 'Empty space in the top third for text' or 'clean background on the left for copy'",
        "No logos or text in the image itself. AI butchers letterforms. Generate clean visuals and add text in Canva"
      ]},
      { kind: "section", num: "03", title: "The Prompting Formula", id: "formula" },
      { kind: "p", body: "Structure: [subject] in [setting/location], [action/pose], [style/mood], [lighting], [camera angle], [format]. [additional details]. Leave space for text overlay on [position]. The lesson demonstrates this with a complete family pizza dinner scene that specifies setting, lighting, format, and text space." },
      { kind: "section", num: "04", title: "12 Ready-to-Use Prompts by Niche", id: "niche-prompts" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Restaurant / Pizza Shop", desc: "Close-up wood-fired oven margherita with stretching cheese, steam, warm orange light, rustic Italian kitchen." },
        { num: "02", title: "Gym / Fitness Studio", desc: "28-year-old man on battle ropes, intense expression, dramatic side lighting, motion blur, dark moody industrial setting, 9:16." },
        { num: "03", title: "Dentist", desc: "Confident woman in her 30s with a wide genuine smile, clean bright background, soft natural light, blue bokeh." },
        { num: "04", title: "Med Spa / Beauty Clinic", desc: "Close-up glowing clear skin, soft side studio lighting, minimal makeup, luxury aesthetic, white and gold background." },
        { num: "05", title: "Real Estate Agent", desc: "Young couple receiving house keys in front of a modern suburban home, golden hour, 16:9, blurred sold sign." },
        { num: "06", title: "HVAC / Home Services", desc: "Family relaxed on a modern living room couch, AC unit subtly visible, warm cozy summer light." },
        { num: "07", title: "Barber Shop", desc: "Skilled barber doing a precise fade, close-up side angle, warm vintage lighting, exposed brick." },
        { num: "08", title: "Dog Groomer", desc: "Golden retriever puppy post-groom with a bow, sitting on grooming table, clean white background, bright cheerful light." },
        { num: "09", title: "Personal Injury Lawyer", desc: "Concerned middle-aged person at a desk with an attentive attorney, modern law office, warm serious lighting." },
        { num: "10", title: "Auto Detailing", desc: "Glossy black luxury sedan with mirror-finish paint reflecting sky, low angle, golden hour, 16:9, water droplets." },
        { num: "11", title: "Yoga / Pilates Studio", desc: "Woman in warrior pose, bright airy studio, natural window light, plants, wooden floors, 9:16." },
        { num: "12", title: "Coffee Shop / Cafe", desc: "Beautifully crafted latte with intricate art on rustic wood, morning side sunlight, blurred pastry background, overhead shot." }
      ]},
      { kind: "section", num: "05", title: "After You Generate: The Canva Step", id: "canva-step" },
      { kind: "list", items: [
        "Upload the AI-generated image as the background",
        "Add the headline text on top",
        "Insert a CTA button or text ('Book Now,' 'Claim Your Free Trial')",
        "Drop in the client's logo",
        "Export as PNG or JPG"
      ]},
      { kind: "p", body: "About five minutes of work and you have a professional ad creative with no designer involved." },
      { kind: "section", num: "06", title: "Before / After Prompts", id: "before-after" },
      { kind: "p", body: "For results-based niches (med spas, detailing, landscaping) use a template like: Create a side-by-side before and after image. Left side describes the before state. Right side describes the after state. Clean white divider line, BEFORE and AFTER labels at the top, photo realistic, square format." },
      { kind: "section", num: "07", title: "Common Mistakes", id: "mistakes" },
      { kind: "list", items: [
        "Putting text in the AI image. It will come out as gibberish. Add text in Canva",
        "Using the first image. Generate 3 to 4 and pick the best one",
        "Forgetting format. Specify dimensions (1:1 for feed) so post-cropping does not ruin it",
        "Over-perfection. 'Real' ads outperform stock-feeling ones. Use 'candid shot' and 'natural lighting' for authenticity"
      ]},
      { kind: "section", num: "08", title: "Checklist", id: "checklist" },
      { kind: "list", items: [
        "Picked an image tool (ChatGPT recommended)",
        "Tried the prompting formula on one niche",
        "Generated 3+ variations of one ad image",
        "Added text, logo, and CTA in Canva on one image",
        "Saved best prompts for reuse",
        "Generated a before/after image for a results-based niche",
        "Built a library of 5+ ad images for one client"
      ]}
    ]
  },
  {
    id: "m5-8-ai-video-animation-for-ads",
    category: "module-5",
    title: "AI Video and Animation for Ads",
    lede: "Video ads beat static images on Meta. Higher engagement, lower CPM, more conversions. AI tools let you make them in minutes for the cost of one decent lunch per month.",
    readTimeMin: 7,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.8-ai-video-animation-for-ads.html" },
    body: [
      { kind: "learnPanel", items: [
        "Which AI video tool to reach for in which situation",
        "The end-to-end workflow from copy to image to video to upload",
        "What kind of video to make for each niche",
        "The cost math vs hiring a video editor"
      ]},
      { kind: "section", num: "01", title: "The Tools", id: "tools" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Remotion (Code-Based)", desc: "Build videos with code. Tell Claude what to build. Great for templated, reusable videos like weekly reports and dynamic text overlays." },
        { num: "02", title: "Runway (Easiest)", desc: "Image-to-video or text-to-video clips. Best for turning AI-generated images into video with subtle motion." },
        { num: "03", title: "Kling (Longer Clips)", desc: "Handles longer clips and complex motion. Use it for 10-15 second scenes with people in motion." },
        { num: "04", title: "Pika (Quick and Fun)", desc: "Quick animations and effects. Great for product photo effects, logo animations, and Instagram-friendly 3D pops." }
      ]},
      { kind: "section", num: "02", title: "Remotion: Tell Claude What to Build", id: "remotion" },
      { kind: "p", body: "Set up a Remotion project from the command line, then ask Claude to build a 15-second vertical (1080x1920) video with animated headline text, content transitions, and an end card matching your styling. Once the template exists, you swap text for each new client. The lesson walks through the create-video setup and a sample build prompt." },
      { kind: "section", num: "03", title: "Runway: Image to Video", id: "runway" },
      { kind: "list", items: [
        "Go to runway.com and create an account (free trial available)",
        "Upload an AI-generated ad image from Lesson 5.7",
        "Pick Image to Video",
        "Enter a motion prompt: e.g., 'slow zoom in, hair blowing slightly in wind'",
        "Generate. You get a 4 to 10 second clip"
      ]},
      { kind: "p", body: "Example: take a static pizza-oven image, upload to Runway, prompt subtle motion, and the result feels noticeably more premium than the static version." },
      { kind: "section", num: "04", title: "The Full Workflow for Client Video Ads", id: "full-workflow" },
      { kind: "list", items: [
        "Write ad copy using your copywriter agent (Lesson 5.6)",
        "Generate base imagery with AI (Lesson 5.7)",
        "Pick a video tool: subtle motion to Runway, people in motion to Kling, text animation to Remotion, social to Pika",
        "Add text overlays in the video tool or in Canva Video (free)",
        "Export as MP4 at 1080x1920 (stories/reels) or 1080x1080 (feed)",
        "Upload to Meta Ads Manager"
      ]},
      { kind: "p", body: "Total time for a finished video ad: 15 to 30 minutes. No designer, editor, or freelancer needed." },
      { kind: "section", num: "05", title: "What to Make for Each Niche", id: "by-niche" },
      { kind: "list", items: [
        "Restaurants: slow-motion food shots, steam, cheese pulls, with offer overlays",
        "Gyms: quick exercise cuts, before/after transformations, animated text testimonials",
        "Dentists: smile reveals, clinic walkthroughs, visit-process demos",
        "Med Spas: slow product pans, treatment process clips, results reveals",
        "Home Services: before/after transitions with pricing overlays"
      ]},
      { kind: "section", num: "06", title: "The 'Never Hire a Video Editor' Math", id: "the-math" },
      { kind: "table", headers: ["Service", "Cost"], rows: [
        ["Freelance editor (4 videos/client/month)", "$400 to $1,200/mo"],
        ["Runway", "$15/mo"],
        ["Kling", "$10/mo or free"],
        ["Pika", "Free tier"],
        ["Remotion", "Free (open source)"],
        ["Canva", "Free"],
        ["Total with AI tools", "Under $30/mo"]
      ]},
      { kind: "section", num: "07", title: "Quick Start: Your First AI Video Ad", id: "quick-start" },
      { kind: "list", items: [
        "Use ChatGPT to generate an ad image (use 5.7 prompts)",
        "Go to runway.com and upload it",
        "Set motion to 'slow zoom in with slight camera movement'",
        "Download the 5-second clip",
        "Open Canva and create a Mobile Video project",
        "Insert the clip, add headline text and a CTA",
        "Export as MP4"
      ]},
      { kind: "p", body: "About 10 minutes start to finish. No design experience required." },
      { kind: "section", num: "08", title: "Checklist", id: "checklist" },
      { kind: "list", items: [
        "Signed up for at least one AI video tool (Runway recommended)",
        "Converted an AI-generated image into a video clip",
        "Added text overlay using Canva",
        "Exported a finished video ad (1080x1920 or 1080x1080)",
        "Optional: set up a Remotion project with Claude Code",
        "Optional: created a text animation video with Remotion",
        "Built at least two video ad variations for one client",
        "Uploaded a finished video ad to Meta Ads Manager"
      ]}
    ]
  },
  {
    id: "m5-9-lead-scraping",
    category: "module-5",
    title: "Lead Scraping with Claude Code",
    lede: "You need clients. Cold outreach works, but only if your list is right. Claude Code finds 50 qualified prospects in 10 minutes, scored by how likely they are to say yes.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.9-lead-scraping.html" },
    body: [
      { kind: "learnPanel", items: [
        "Why finding businesses already running bad ads is the easiest sell",
        "How to pick the right niche and city for your first list",
        "How the 1 to 5 scoring system tells you who to message first",
        "A weekly outreach rhythm that produces real calls"
      ]},
      { kind: "section", num: "01", title: "Why This Works", id: "why-this-works" },
      { kind: "p", body: "The trick is not just finding businesses. It is finding businesses already spending money on ads but doing it badly. They already believe in advertising. You only need to show them you would do it better." },
      { kind: "p", body: "Claude Code searches the web, pulls business info, checks the Meta Ad Library to see who is running ads, and scores each prospect by how likely they are to say yes. All in one prompt." },
      { kind: "section", num: "02", title: "Step 1: Pick a Niche and City", id: "pick-niche-city" },
      { kind: "p", body: "Be specific. 'Restaurants in the US' is useless. 'Italian restaurants in Tampa, FL' is perfect." },
      { kind: "h3", text: "Good Niches to Start With" },
      { kind: "list", items: [
        "Dentists, Gyms, HVAC, Plumbers, Salons, Restaurants",
        "Roofing, Med Spas, Auto Detail, Dog Groomers",
        "Real Estate, Cleaning"
      ]},
      { kind: "p", body: "Pick your city first. Local businesses trust local people. 'I am based in Tampa and I help Tampa businesses' lands harder than cold outreach from across the country." },
      { kind: "section", num: "03", title: "Step 2: Run the Prospecting Prompt", id: "prospecting-prompt" },
      { kind: "p", body: "The prospecting prompt tells Claude Code to search for 50 niche businesses in your city, collect name, phone, website, address, Google rating, review count, and Facebook status, check the Meta Ad Library for active ads, score each prospect 1 to 5 based on ad presence and quality, filter to 3.5+ stars and 20+ reviews, then output a markdown table you can review before saving as CSV." },
      { kind: "p", body: "Why 3.5+ stars and 20+ reviews? Those businesses are established enough to have ad budget. A business with three reviews and two stars probably cannot afford you." },
      { kind: "section", num: "04", title: "The Scoring System", id: "scoring-system" },
      { kind: "table", headers: ["Score", "Status", "Description"], rows: [
        ["5", "Running bad ads", "Easiest to close. They already spend money but waste it. You show them what you would do differently."],
        ["4", "Running decent ads", "They know ads work. Pitch better results, better CPL, better creative."],
        ["3", "Facebook page, no ads", "Online but not advertising. Needs a little education on why ads work."],
        ["2", "No Facebook, good reviews", "Good business, not online. More work to convert but could be long-term."],
        ["1", "No online presence", "Skip. If they do not have a website, they are not ready for ads."]
      ]},
      { kind: "section", num: "05", title: "Step 3: Send Your Outreach", id: "send-outreach" },
      { kind: "h3", text: "Template for Score 4-5: They Are Running Ads" },
      { kind: "quote", body: "Hey [name], I was looking at [business]'s Facebook ads and noticed a few things that could probably cut your cost per lead in half" },
      { kind: "p", body: "Why this works: you lead with value, not a pitch. The fact that you already looked at their ads puts you ahead of 95% of cold outreach." },
      { kind: "h3", text: "Template for Score 2-3: They Are Not Running Ads" },
      { kind: "quote", body: "Hey [name], I help [niche] businesses in [city] get more customers through Facebook and Instagram ads. Most of your competitors are running them" },
      { kind: "p", body: "Why this works: naming a specific competitor creates urgency. They did not know their competitor was running ads. Now they want to know more." },
      { kind: "takeaway", text: "Keep it short. Nobody reads a five-paragraph cold message. Three to four sentences max. If it does not fit in a text, it is too long." },
      { kind: "section", num: "06", title: "Step 4: Make It a Weekly System", id: "weekly-system" },
      { kind: "table", headers: ["Day", "Action"], rows: [
        ["MON", "Run the scraping prompt for a new city or niche. Get 50 fresh prospects."],
        ["MON", "Send 10 to 15 outreach messages to your highest-scored prospects."],
        ["WED", "Follow up with anyone who did not respond Monday."],
        ["FRI", "Second follow-up. Add new prospects from this week's list."]
      ]},
      { kind: "p", body: "That is 40 to 60 messages a week. Even at a 5% response rate, you get 2 to 3 calls a week. Close one a month and you are making money." },
      { kind: "takeaway", text: "Track everything. Add columns to your CSV: outreach date, response, notes, follow-up date. If you are not tracking, you are guessing." },
      { kind: "section", num: "07", title: "Bonus: Check Any Business in the Ad Library", id: "ad-library-check" },
      { kind: "p", body: "To check a specific business manually, go to facebook.com/ads/library and search by name. If they have active ads, you see every one: creative, copy, how long it has been running. Ads running 60+ days are probably working. Ads that just started are tests." },
      { kind: "section", num: "08", title: "What NOT to Do", id: "what-not-to-do" },
      { kind: "list", items: [
        "Do not spam 200 people with the same generic message. Personalize every outreach",
        "Do not pitch on the first message. Your goal is a 10-minute call, not a sale. Offer value first",
        "Do not skip follow-ups. Most responses come on the 2nd or 3rd message",
        "Do not target businesses with under 20 reviews. They usually cannot afford you"
      ]},
      { kind: "section", num: "09", title: "Homework Checklist", id: "homework" },
      { kind: "list", items: [
        "Picked a niche and your city. Start local. One niche, one city",
        "Ran the prospecting prompt and got 50 businesses with contact info, ratings, and ad status",
        "Reviewed the table and focused on Score 4-5 prospects",
        "Exported as CSV with tracking columns",
        "Sent first 5 personalized outreach messages",
        "Set reminders for Wednesday and Friday follow-ups",
        "Created a prospects/ folder for storing CSVs by city/niche"
      ]}
    ]
  },
  {
    id: "m5-10-automated-lead-scraping",
    category: "module-5",
    title: "Automated Lead Scraping",
    lede: "Take the manual scraping from 5.9 and turn it into a one-command system that drops 50 scored prospects into Google Sheets. Run it every Monday and the list builds itself.",
    readTimeMin: 20,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.10-automated-lead-scraping.html" },
    body: [
      { kind: "learnPanel", items: [
        "The difference between the manual 5.9 flow and this automated one",
        "How to have Claude Code build the scraping script for you",
        "How to connect Google Sheets via a service account",
        "How to schedule weekly runs, and why you never automate outreach"
      ]},
      { kind: "section", num: "01", title: "Manual vs Automated", id: "manual-vs-automated" },
      { kind: "h3", text: "Lesson 5.9 (Manual)" },
      { kind: "list", items: [
        "Paste prompt into Claude Code",
        "Receive a markdown table back",
        "Copy it into a spreadsheet manually",
        "Add tracking columns yourself",
        "Repeat weekly by hand"
      ]},
      { kind: "h3", text: "Lesson 5.10 (Automated)" },
      { kind: "list", items: [
        "Run one command in Claude Code",
        "Claude builds the scraping script",
        "Prospects go directly into Google Sheets",
        "Pre-formatted with scores and tracking columns",
        "Schedule automatic Monday runs"
      ]},
      { kind: "takeaway", text: "Do 5.9 first. You need to understand the manual process before automating it. Automation without understanding is a mess." },
      { kind: "section", num: "02", title: "How the System Works", id: "how-it-works" },
      { kind: "list", items: [
        "You run a command like: python scrape.py 'dentists' 'Tampa, FL'",
        "The script searches for businesses and pulls name, phone, website, address, Google rating, review count",
        "It checks the Meta Ad Library for ad activity",
        "It scores each prospect 1 to 5 (5 = bad ads / easiest close; 1 = no presence / skip)",
        "It pushes everything to a new Google Sheets tab, pre-formatted and sorted by score"
      ]},
      { kind: "section", num: "03", title: "Step 1: Ask Claude Code to Build the Tool", id: "build-tool" },
      { kind: "p", body: "Give Claude Code a build prompt that specifies a Python script (scrape.py) accepting niche and city arguments, the data fields to collect, the Meta Ad Library check, the 1 to 5 scoring rules, filters for sub-3.5 stars or fewer than 20 reviews, and a Google Sheets push via service account. Ask for a beginner-friendly README, a requirements.txt, graceful error handling, and terminal progress updates." },
      { kind: "p", body: "The Google Sheets tab should be named [City] - [Niche] - [Date] with columns: Score, Business Name, Phone, Website, Address, Rating, Reviews, Facebook Page, Running Ads, Number of Ads, Ad Quality Notes, Outreach Date, Response, Notes, Follow-Up Date. Bold header row, light blue background, auto-resized columns, with a local CSV backup in prospects/." },
      { kind: "takeaway", text: "Claude builds the whole thing. You do not need to write any code." },
      { kind: "section", num: "04", title: "Step 2: Connect Google Sheets", id: "connect-sheets" },
      { kind: "h3", text: "Create a Google Sheet" },
      { kind: "list", items: [
        "Go to sheets.google.com and create a new spreadsheet named 'Agency Prospects'",
        "Copy the Sheet ID from the URL (the long string between /d/ and /edit)"
      ]},
      { kind: "h3", text: "Set Up Google API Credentials" },
      { kind: "list", items: [
        "Visit console.cloud.google.com",
        "Create a project and enable the Google Sheets API",
        "Create a service account and download the JSON key file",
        "If stuck, ask Claude for a beginner walk-through"
      ]},
      { kind: "h3", text: "Share the Sheet" },
      { kind: "list", items: [
        "Share the sheet with the service account email",
        "Grant Editor access"
      ]},
      { kind: "h3", text: "Add the Sheet ID" },
      { kind: "p", body: "Open the config file Claude created, paste your Sheet ID, and the script can now write to your sheet." },
      { kind: "section", num: "05", title: "Step 3: Run the Scraper", id: "run-scraper" },
      { kind: "p", body: "Inside the lead-scraper folder, install dependencies with pip install -r requirements.txt, then run python scrape.py with your niche and city as arguments. The terminal shows progress as it finds businesses, checks the Ad Library, and scores each prospect. Open your Google Sheet when it finishes." },
      { kind: "p", body: "Try multiple niches: HVAC in Phoenix, med spas in Miami, gyms in Austin, roofing in Dallas. Each run creates a new tab. By the end of the week you could have 200+ scored prospects across four niches." },
      { kind: "section", num: "06", title: "Step 4: Schedule It (Optional)", id: "schedule" },
      { kind: "p", body: "Ask Claude to set up a weekly run: every Monday at 8 AM, scrape these niches and cities, create new tabs, and send a completion notification (email, Slack, or Discord)." },
      { kind: "takeaway", text: "Your computer has to be on. The schedule runs on your machine. If your laptop is closed Monday morning, nothing runs. If that is a problem, ask Claude to deploy it to a free cloud service like a GitHub Action or a small server." },
      { kind: "section", num: "07", title: "Step 5: Work the List", id: "work-list" },
      { kind: "list", items: [
        "Monday morning: open the sheet, sort by Score 5",
        "Quick-check each top prospect's ads in the Meta Ad Library (30 seconds), note weaknesses for your opener",
        "Send personalized outreach to the top 15 using 5.9 templates. Mention specific ads or competitors",
        "Update tracking columns with outreach date and a Wednesday follow-up reminder",
        "Follow up Wednesday and Friday"
      ]},
      { kind: "takeaway", text: "Do not automate the outreach. Scraping, fine. Outreach, never. Personal messages from a real person convert. Mass-blasted AI messages get ignored and can get your accounts flagged." },
      { kind: "section", num: "08", title: "If Something Breaks", id: "troubleshooting" },
      { kind: "list", items: [
        "Google Sheets permission denied: you forgot to share the sheet with the service account email",
        "Module not found: re-run pip install -r requirements.txt",
        "Rate limited or too many requests: add a 2 to 3 second delay between searches",
        "Script found 0 businesses: broaden search terms or try a bigger city"
      ]},
      { kind: "section", num: "09", title: "Homework Checklist", id: "homework" },
      { kind: "list", items: [
        "Completed 5.9 (manual lead scraping)",
        "Pasted the build prompt into Claude Code",
        "Created the Google Sheet and connected API credentials",
        "Ran the scraper for your first niche and city",
        "Verified prospects appeared in Google Sheets",
        "Ran it for a second niche or city",
        "Optional: set up a weekly schedule",
        "Sent outreach to the top 10 Score-5 prospects"
      ]}
    ]
  },
  {
    id: "m5-11-competitor-research",
    category: "module-5",
    title: "AI Competitor Research",
    lede: "Before writing ads for a client, find out what competitors are running. Meta Ad Library plus Claude Code gives you full competitive intelligence in five minutes.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.11-competitor-research.html" },
    body: [
      { kind: "learnPanel", items: [
        "How to pull competitor ads from the Meta Ad Library efficiently",
        "The six things to look for in any competitor ad",
        "A Claude analysis prompt that produces patterns, gaps, and angles",
        "A monthly check rhythm so you do not get caught off-guard"
      ]},
      { kind: "section", num: "01", title: "The Workflow", id: "workflow" },
      { kind: "list", items: [
        "Find competitors via Ad Library search",
        "Grab 5 to 10 active ads (screenshots or copy)",
        "Feed everything to Claude with the analysis prompt",
        "Get patterns, gaps, and angles back"
      ]},
      { kind: "section", num: "02", title: "Step 1: Find Competitors in the Ad Library", id: "find-competitors" },
      { kind: "list", items: [
        "Go to facebook.com/ads/library",
        "Set country (usually United States) and category to All ads",
        "Search by competitor name or by niche plus city ('Dentist Tampa') to find local advertisers",
        "Ask the client for their top 3 to 5 competitors if you do not know them"
      ]},
      { kind: "p", body: "Grab a mix of competitors and formats: images, videos, carousels. Screenshot, copy the text, or save the shareable link." },
      { kind: "takeaway", text: "Ads running 3+ months are probably profitable. Unprofitable ads usually stop. Study long-running ads most closely." },
      { kind: "section", num: "03", title: "Step 2: What to Look For", id: "what-to-look-for" },
      { kind: "list", items: [
        "How long has it been running? 60+ days likely works. Newly launched = tests",
        "What's the hook? The first line or the opening second of video",
        "What's the offer? Free consult, discount, free trial, limited-time deal",
        "What format? Image, video, carousel. Pro photography or UGC?",
        "What's the CTA? 'Book now,' 'Learn more,' 'Call now,' 'Shop now'",
        "What's the landing page? Form, calendar, phone, something else"
      ]},
      { kind: "section", num: "04", title: "Step 3: Feed Them to Claude", id: "feed-claude" },
      { kind: "p", body: "Drop screenshots or paste ad copy into Claude Code with an analysis prompt. Ask Claude to analyze each ad's hook (and why it works), offer, probable target audience, emotional trigger (fear, desire, social proof, urgency, curiosity), weaknesses, and unexplored angles. Then ask for a synthesis: top three patterns across all the ads, three unaddressed gaps, and five novel angles that would differentiate your client." },
      { kind: "section", num: "05", title: "What Claude Gives You Back", id: "what-claude-returns" },
      { kind: "p", body: "Example output for 'SmileBright Dental': fear-based messaging ('Don't let dental problems worsen'), free exam plus X-ray offer for new patients, targeting anxious adults 25 to 55, stock photo of a smiling woman. Weaknesses: generic hook, generic imagery that matches every other competitor, offer buried in the third paragraph." },
      { kind: "p", body: "Identified gap: no competitor shows the actual clinic experience, staff introductions, or first-visit walkthroughs that would reduce patient anxiety. Recommended angles: first-visit walkthrough, staff introduction emphasizing personality, transparent pricing." },
      { kind: "takeaway", text: "Save the analysis to clients/[client]/competitor-analysis.md so you can reference it next campaign and track how the competitive set evolves." },
      { kind: "section", num: "06", title: "Monthly Competitor Check", id: "monthly-check" },
      { kind: "p", body: "Competitors keep adjusting. Re-run the analysis monthly with a comparative prompt: review the current Ad Library against the prior month's analysis stored in clients/[client]/competitor-analysis.md and report what's new, what's gone, emerging angles, relevant offers, and recommended strategy adjustments. Set a calendar reminder for the first Monday of each month." },
      { kind: "section", num: "07", title: "The Full Workflow (End to End)", id: "full-workflow" },
      { kind: "list", items: [
        "Get competitor names from the client or Ad Library search",
        "Pull 5 to 10 active ads with a mix of competitors and formats",
        "Run the analysis prompt for patterns, gaps, and angles",
        "Build your strategy around the gaps, not copies of competitor ads",
        "Save the analysis and re-run monthly"
      ]},
      { kind: "section", num: "08", title: "Pro Moves", id: "pro-moves" },
      { kind: "h3", text: "Check Competitors in Other Cities" },
      { kind: "p", body: "Competitors in other markets often run angles not yet used locally. Research 2 to 3 cities in your niche to find fresh approaches before saturation spreads." },
      { kind: "h3", text: "Look at the Big Players" },
      { kind: "p", body: "National brands invest heavily in testing. Ads running 6+ months from major national brands in your niche are proven. Adapt them to local context." },
      { kind: "h3", text: "Track Ad Longevity" },
      { kind: "p", body: "Keep a simple spreadsheet: competitor name, launch date, status (running or discontinued). After a few months, the data shows which ad styles have staying power in the niche. That data is gold." },
      { kind: "section", num: "09", title: "What NOT to Do", id: "what-not-to-do" },
      { kind: "list", items: [
        "Do not copy competitor ads. The goal is patterns and gaps, not plagiarism",
        "Do not skip the analysis. 10 screenshots without synthesis is wasted effort",
        "Do not only look at your city. Local competitors copy each other. Look elsewhere for fresh angles"
      ]},
      { kind: "section", num: "10", title: "Homework Checklist", id: "homework" },
      { kind: "list", items: [
        "Searched the Ad Library for client's niche plus city",
        "Found 5 to 10 ads from different competitors, formats, and launch dates",
        "Screenshot or transcribed primary text, headline, description, creative",
        "Ran the analysis prompt and got patterns, gaps, and angles",
        "Archived the analysis in clients/[client]/competitor-analysis.md",
        "Used identified gaps to shape ad strategy",
        "Looked at competitors in at least one other city",
        "Scheduled a monthly competitor check (first Monday)"
      ]}
    ]
  },
  {
    id: "m5-12-selling-automations",
    category: "module-5",
    title: "Selling AI Automations (Upsell)",
    lede: "A business paying you $1,500/month for ads almost always has 15 other problems you can solve. Lead follow-up gaps, no email list, missing reviews, manual reminders. Most automations run themselves after setup.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.12-selling-automations.html" },
    body: [
      { kind: "learnPanel", items: [
        "Why post-signature is the highest-leverage moment to upsell",
        "Five automations you can sell, each with build steps and pricing",
        "Three-tier packaging that takes you from $1,500 to $3,500+ per client",
        "Exactly when to pitch and what trigger phrases to listen for"
      ]},
      { kind: "section", num: "01", title: "Why Upselling Works", id: "why-upselling-works" },
      { kind: "quote", body: "A buyer is a buyer is a buyer.", attribution: "Dan Kennedy, No B.S. Direct Marketing" },
      { kind: "p", body: "Once a contract is signed, the client is in a buying state. Objections are cleared, trust is fresh, excitement is high, and budget is unlocked. That is the optimal moment to present additional value." },
      { kind: "machineGrid", items: [
        { num: "01", title: "Maximum Buy-In", desc: "Objections are already handled. Trust and belief in the outcome are at their peak, so the next logical offer faces almost no resistance." },
        { num: "02", title: "Your Best Customer Is Your Existing Customer", desc: "Acquiring a new client costs 5 to 7x more than upselling. A $1,500/month client can become $3,500/month with the right add-ons." },
        { num: "03", title: "The Next Logical Offer", desc: "Upsells succeed when they make obvious sense. Lead follow-up after ad setup is not a random pitch, it is the obvious next step. Clients often expect it before you ask." }
      ]},
      { kind: "h3", text: "Two Optimal Moments" },
      { kind: "list", items: [
        "At contract signature: 'Most clients also add lead follow-up so they do not lose leads. Want to include it?'",
        "At 30 to 60 days post-launch when results are measurable: 'We are generating 40 leads/month but your team only responds to 60%. Let us fix that.'"
      ]},
      { kind: "section", num: "02", title: "The Onboarding Upsell Script", id: "onboarding-script" },
      { kind: "p", body: "Pitch this right after the ad management contract is signed, in the same conversation. Express confidence in delivery, explain the critical 5-minute response window (conversion drops 80% after that), describe the automated follow-up mechanics (texts within 60 seconds, 24-hour and 72-hour follow-ups, zero burden on the client's team), reference typical results (20 to 30% more booked appointments), and ask to include it in the initial setup." },
      { kind: "takeaway", text: "Do not be pushy. A no is fine. Offer it again at 30 to 60 days with real numbers on lost-lead response gaps." },
      { kind: "section", num: "03", title: "The Math", id: "the-math" },
      { kind: "heroStats", stats: [
        { value: "$7,500", label: "5 clients x $1,500/mo, no upsells" },
        { value: "$15,000", label: "5 clients x $3,000/mo average with upsells" },
        { value: "+100%", label: "Revenue lift with $50 to $100/mo in tool costs" }
      ]},
      { kind: "p", body: "Automations need less ongoing management than ad work because they run independently once built." },
      { kind: "section", num: "04", title: "The Upsell Menu", id: "upsell-menu" },
      { kind: "p", body: "Pick 1 to 2 automations per client based on what is actually broken. You do not need to sell all five." },
      { kind: "h3", text: "Lead Follow-Up Automation ($500 to $800/month)" },
      { kind: "p", body: "Local businesses are bad at fast follow-up. Build: instant text greeting, email confirmation with offer details, 24-hour follow-up text, 72-hour final-chance text." },
      { kind: "h3", text: "Email Sequences ($500 to $1,000/month)" },
      { kind: "p", body: "Most local businesses do no email marketing at all. A welcome sequence and monthly newsletter beats 90% of competitors. Build: 5-email welcome series, monthly newsletter template, re-engagement for dormant leads, post-visit follow-up." },
      { kind: "h3", text: "Review Generation System ($300 to $500/month)" },
      { kind: "p", body: "Auto-prompt customers for Google reviews after a visit. More reviews lift ranking and organic traffic. Build: automated post-visit text with review link, low-rating redirect to a private feedback form rather than a public review." },
      { kind: "h3", text: "Chatbot / AI Receptionist ($500 to $1,000/month)" },
      { kind: "p", body: "Website or Facebook chatbot answers FAQs, books appointments, and captures lead info 24/7. Build: AI trained on FAQs, services, pricing, captures name, phone, email, service requested, books to calendar, sends notification." },
      { kind: "h3", text: "Weekly Reporting Dashboard ($300 to $500/month)" },
      { kind: "p", body: "Replace vague 'ads are going well' updates with a professional dashboard. Build: Looker / Data Studio dashboard tracking spend, leads, CPL, ROAS, auto-updating daily with a weekly email summary." },
      { kind: "section", num: "05", title: "Pricing Packages", id: "pricing-packages" },
      { kind: "table", headers: ["Package", "Price", "Contents"], rows: [
        ["Basic", "$1,500/mo", "Ad management, campaign setup, monthly reporting, creative refreshes"],
        ["Growth", "$2,500/mo", "Everything in Basic plus lead follow-up automation, email sequences, faster response, more booked appointments"],
        ["Premium", "$3,500 to $4,000/mo", "Everything in Growth plus AI chatbot, review generation, reporting dashboard, full automation suite"]
      ]},
      { kind: "p", body: "Tool costs run $50 to $100/month. Everything else is profit. Most of these run themselves after setup." },
      { kind: "section", num: "06", title: "When to Pitch", id: "when-to-pitch" },
      { kind: "takeaway", text: "Never pitch upsells on the initial call. Wait 30 to 60 days for results to build credibility. Let the work speak first." },
      { kind: "h3", text: "Listen for These Trigger Phrases" },
      { kind: "list", items: [
        "We are getting leads but my front desk is not following up fast enough",
        "I wish we had more Google reviews",
        "Do you know anything about email marketing?",
        "People keep asking questions on our Facebook page at midnight"
      ]},
      { kind: "p", body: "Frame your response as solving their problem, not as a pitch." },
      { kind: "section", num: "07", title: "The Pitch Script", id: "pitch-script" },
      { kind: "p", body: "For calls or messages: open by acknowledging strong ad performance (specific leads and CPL). Name a concrete gap (X% of leads have no response in the first hour). Cite the benchmark (21x higher conversion when contacted within 5 minutes vs 30+). Describe the automation (60-second texts, confirmation emails, automatic follow-ups, calendar booking) and emphasize zero burden on their team. Reference a comparable client result (20 to 40% more bookings). State the additional cost and ask about timing." },
      { kind: "takeaway", text: "Never fabricate numbers. Use verified internal or industry data. If you do not have it, say 'industry benchmarks,' do not invent client results." },
      { kind: "section", num: "08", title: "Tools You Will Use", id: "tools" },
      { kind: "machineGrid", items: [
        { num: "01", title: "GoHighLevel", desc: "All-in-one: texts, emails, calendar, pipeline. $97 to $297/month. Widely adopted by agency owners." },
        { num: "02", title: "Make.com", desc: "Visual automation builder. Connects Meta lead forms to Twilio texts to Sheets to email. More DIY, cheaper at scale than GHL." },
        { num: "03", title: "Zapier", desc: "If-this-then-that connector. Simpler than Make, more expensive as volume grows. Great for fast integrations." }
      ]},
      { kind: "p", body: "Setup runs 2 to 4 hours per client. After that the systems mostly run themselves. Weekly check-ins make sure nothing has broken. Use Claude Code to draft email copy, text sequences, and chatbot scripts." },
      { kind: "section", num: "09", title: "What NOT to Do", id: "what-not-to-do" },
      { kind: "list", items: [
        "Do not pitch before ad results land. Trust is earned first. Day-one pitches look like greed",
        "Do not oversell technical complexity. 'AI-powered omnichannel automation suite' scares clients. 'Texts every new lead within 60 seconds' is clearer",
        "Do not set and forget. Check automations weekly. Broken follow-up = lost leads = damaged reputation"
      ]},
      { kind: "section", num: "10", title: "Homework Checklist", id: "homework" },
      { kind: "list", items: [
        "Identified 1 to 2 automations matching current client complaints",
        "Priced Basic / Growth / Premium packages for your local market",
        "Listened for trigger phrases instead of forcing pitches",
        "Customized the pitch script with real client data",
        "Set up at least one automation (recommended: lead follow-up first)",
        "Tracked measurable impact: bookings, response times, review growth",
        "Replicated the working automation across other clients"
      ]}
    ]
  },
  {
    id: "m5-13-building-sops-with-ai",
    category: "module-5",
    title: "Building SOPs with AI",
    lede: "Everything you do lives in your head. To hire, you need step-by-step docs. Claude writes them based on what you already do. Five minutes per SOP instead of two hours.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.13-building-sops.html" },
    body: [
      { kind: "learnPanel", items: [
        "Why undocumented processes cap your client load",
        "The three-step Claude SOP loop (do, narrate, save)",
        "Four SOPs every agency should have first",
        "The 'Watch Me' real-time narration method"
      ]},
      { kind: "section", num: "01", title: "Why This Matters", id: "why-this-matters" },
      { kind: "h3", text: "Without SOPs" },
      { kind: "list", items: [
        "You handle everything personally and become the bottleneck",
        "You cannot take time off or delegate",
        "You cannot hire because nothing is documented",
        "You cap out at 5 to 7 clients"
      ]},
      { kind: "h3", text: "With SOPs" },
      { kind: "list", items: [
        "Team members execute consistently from the doc",
        "You shift from doing the task to growing the business",
        "You scale past 10 clients"
      ]},
      { kind: "takeaway", text: "An SOP is just a checklist with context. Documentation showing exactly what to do, in what order, and what to do if it goes wrong." },
      { kind: "section", num: "02", title: "How Claude Builds Your SOPs", id: "how-claude-builds" },
      { kind: "list", items: [
        "Do the task like normal (onboarding, launching campaigns, sending reports)",
        "Tell Claude what you did, in plain language. Messy is fine. Claude structures it",
        "Review the cleaned-up SOP, fix anything wrong, and save it in sops/"
      ]},
      { kind: "p", body: "Doing this by hand takes hours per SOP. With Claude it takes about five minutes." },
      { kind: "section", num: "03", title: "4 SOPs Every Agency Needs", id: "four-sops" },
      { kind: "p", body: "These four cover roughly 90% of weekly work." },
      { kind: "h3", text: "1. Client Onboarding" },
      { kind: "list", items: [
        "Initial call: gather business info, goals, budget, audience, competitors",
        "Send contract and invoice",
        "Get Meta ad account access (Business Manager) and Facebook page",
        "Set up client folder with documentation files",
        "Run competitor research via the Meta Ad Library",
        "Draft initial ad strategy and request client approval",
        "Build campaigns in Ads Manager",
        "Create ad copy and creatives",
        "Launch and set a 5-day review checkpoint",
        "Send a 'we are live' message with clear expectations"
      ]},
      { kind: "h3", text: "2. Ad Launch Checklist" },
      { kind: "list", items: [
        "Pixel installed and firing",
        "Conversion event set up (leads, purchases, etc.)",
        "Audience targeting matches the strategy",
        "Budget configured (daily vs lifetime)",
        "Ad copy proofread",
        "Image/video dimensions correct",
        "CTA button aligned with the objective",
        "Landing page URL accurate",
        "Mobile page speed acceptable",
        "UTM tracking parameters included",
        "Naming conventions followed",
        "Client approved the creative"
      ]},
      { kind: "h3", text: "3. Weekly Optimization Routine" },
      { kind: "list", items: [
        "Review 7-day data in Ads Manager",
        "Compare to target cost per result",
        "Pause ad sets spending 2x target with zero results",
        "Increase budget 20% on well-performing ad sets",
        "Watch frequency (above 3 = fatigue)",
        "Watch CTR (below 1% = creative issue)",
        "Check demographic and placement breakdowns",
        "Document the pattern",
        "Create 2 to 3 new ad variations to test",
        "Send the client update"
      ]},
      { kind: "h3", text: "4. Client Reporting" },
      { kind: "list", items: [
        "Pull 7-day and month-to-date data from Ads Manager",
        "Complete the template: spend, results, CPL, CTR, CPM",
        "Compare week-over-week with trend indicators",
        "Write 3 to 4 bullets: what worked, what changed, what is next",
        "Keep it simple and client-friendly",
        "Send via the client's preferred channel"
      ]},
      { kind: "section", num: "04", title: "The 'Watch Me' Method", id: "watch-me-method" },
      { kind: "p", body: "Tell Claude you will narrate a task as it happens, then speak through every action: 'Opening Ads Manager, filtering to last 7 days. Campaign X spent $200 with 3 leads, $66/lead, over our $40 target. Pausing this ad set after 5 days. Frequency at 3.5 means audience fatigue. Duplicating winning ad set to test new creative.' When you finish, ask Claude to turn it all into a clean SOP that someone unfamiliar with this work could follow." },
      { kind: "takeaway", text: "This captures everything because you document in real time instead of trying to remember later." },
      { kind: "section", num: "05", title: "Where to Store SOPs", id: "where-to-store" },
      { kind: "list", items: [
        "your-project/sops/client-onboarding.md",
        "your-project/sops/ad-launch-checklist.md",
        "your-project/sops/weekly-optimization.md",
        "your-project/sops/client-reporting.md",
        "your-project/sops/competitor-research.md",
        "your-project/sops/new-hire-training.md"
      ]},
      { kind: "p", body: "Share the folder with new hires so they get the full process from day one. SOPs are living documents. Update them as the process improves. Outdated SOPs are worse than no SOPs." },
      { kind: "section", num: "06", title: "Homework Checklist", id: "homework" },
      { kind: "list", items: [
        "Created sops/ folder in your Claude Code project",
        "Built a client onboarding SOP",
        "Built an ad launch checklist",
        "Built a weekly optimization SOP",
        "Built a client reporting SOP with a template",
        "Tested the Watch Me method on a real task",
        "Reviewed and refined at least one SOP (Claude gets about 90% right; you supply the last 10%)"
      ]}
    ]
  },
  {
    id: "m5-14-claude-code-daily-use",
    category: "module-5",
    title: "Claude Code in Real Life",
    lede: "Your role is the operator. Claude does the work. The better you describe what you want, the better the output. That is the only skill that matters.",
    readTimeMin: 40,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.14-claude-code-daily-use.html" },
    body: [
      { kind: "learnPanel", items: [
        "What an AI operator does versus what Claude does",
        "Eleven things you can do with Claude Code starting today",
        "How to set up your operator with a CLAUDE.md profile",
        "The website + outreach play that turns free mockups into recurring contracts"
      ]},
      { kind: "section", num: "01", title: "Your Role: The Operator", id: "operator-role" },
      { kind: "p", body: "You direct the AI's work through clear instructions. No coding, no design expertise, no formal training. Just the ability to articulate what you need." },
      { kind: "p", body: "Claude's role is the worker. Website building, email writing, lead research, data analysis, content creation, at speeds nobody had access to before. Three-hour tasks finish in 30 seconds." },
      { kind: "quote", body: "The better you describe what you want, the better the output. That is literally the only skill." },
      { kind: "p", body: "The gap between a generic website and a $5,000 deliverable lives entirely in how clearly you brief it." },
      { kind: "section", num: "02", title: "What You Can Do Right Now", id: "what-you-can-do" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Build Websites and Landing Pages", desc: "Describe the spec and Claude builds a working site. 'Build a landing page for a [niche] in [city]. Hero, services, testimonials, contact form. Dark design.'" },
        { num: "02", title: "Find Leads in Any City", desc: "Claude scrapes Google for business info: name, phone, website, rating. 'Find 20 [niche] businesses in [city]. Get name, website, phone, Google rating.'" },
        { num: "03", title: "Write Email Sequences", desc: "Whole sequences in 30 seconds: cold, onboarding, nurture, re-engagement. 'Write a 5-email sequence for [situation]. Casual tone, include social proof.'" },
        { num: "04", title: "Generate Client Proposals", desc: "Discovery call notes become a tiered proposal in two minutes. 'Here are my notes: [paste]. Write a proposal with 3 tiers and a clear next step.'" },
        { num: "05", title: "Handle Sales Objections", desc: "'They said [objection] for a $[price] service. Give me 5 different ways to handle it.' Logic, emotion, pricing flex, reframes, urgency." },
        { num: "06", title: "Analyze Ad Performance", desc: "Export CSV. 'Read this CSV. Top 3 winners, bottom 3 to kill, patterns. Format as a client report.'" },
        { num: "07", title: "Plan Weekly Social Content", desc: "'7 days of posts for [business]. 2 tips, 2 behind-the-scenes, 2 results, 1 hot take.'" },
        { num: "08", title: "Write SOPs", desc: "Informal notes become delegation-ready SOPs. 'Here is how I [process]: [notes]. Turn it into a numbered SOP with checkboxes.'" },
        { num: "09", title: "Draft Contracts and Agreements", desc: "First-draft service agreements and freelancer contracts. 'Write a service agreement for [service] at $[price]/month. Scope, payment, cancellation.' Have a lawyer review before signing." },
        { num: "10", title: "Research Competitors", desc: "'Here is a competitor page: [paste]. Break down hook, offer, CTA. What is weak? How do I beat them?'" },
        { num: "11", title: "Repeat-Task Rule", desc: "If you are doing something more than twice, Claude should be doing it. Every repetitive task is a candidate." }
      ]},
      { kind: "section", num: "03", title: "Set Up Your AI Operator", id: "set-up-operator" },
      { kind: "list", items: [
        "Step 1: create a project folder like 'my-agency' and open it in VS Code",
        "Step 2: create CLAUDE.md and fill it with your operator's context"
      ]},
      { kind: "h3", text: "CLAUDE.md Template Contents" },
      { kind: "list", items: [
        "Operator name (Atlas, Nova, Friday, etc.)",
        "Your name",
        "Your business focus (marketing agency, etc.)",
        "Target niche (dentists, contractors, restaurants)",
        "Geographic location",
        "Pricing (e.g., $1,500/month for ads)",
        "Communication style (casual, direct, non-corporate)",
        "Rules (no fabricated stats, no fake testimonials, keep things simple, 'lead finding' means local niche businesses)"
      ]},
      { kind: "p", body: "Claude pulls from this every conversation. Generic output disappears." },
      { kind: "section", num: "04", title: "Build a Website in One Prompt", id: "build-website" },
      { kind: "p", body: "Request a modern landing page that specifies the niche and business name, location, hero with headline and CTA button, services section (3-4 with icons), about, testimonials, contact (phone, address, form), footer, dark modern mobile-responsive design, and file format (index.html)." },
      { kind: "heroStats", stats: [
        { value: "30 sec", label: "Build time" },
        { value: "$0", label: "Build cost" },
        { value: "$2,000", label: "Typical client charge" }
      ]},
      { kind: "section", num: "05", title: "Use It to Land Clients", id: "land-clients" },
      { kind: "list", items: [
        "FIND: Use Claude to scrape 20 businesses (name, website, phone, rating, condition). Save as leads.csv",
        "CHECK: Filter to the ones with bad/outdated websites",
        "REVAMP: Rebuild each as a modern dark landing page using their real info. Save as revamp.html",
        "SCREENSHOT: Capture before/after visuals",
        "SEND: DM, video, or email with the mockup attached"
      ]},
      { kind: "h3", text: "Outreach Templates" },
      { kind: "list", items: [
        "DM: 'hey [name], i came across [business] and mocked up a quick redesign, no charge. what do you think?'",
        "Video: 'hey [name], made a 60s video walking through a redesign for [business]. want the full thing?'",
        "Email: 'hi [name], put together a quick mockup for [business]. no obligation, just wanted to share.'"
      ]},
      { kind: "section", num: "06", title: "The Numbers", id: "the-numbers" },
      { kind: "heroStats", stats: [
        { value: "10 / week", label: "Outreach contacts" },
        { value: "30 min", label: "Weekly time investment" },
        { value: "20 to 40%", label: "Response rate" },
        { value: "1 to 3", label: "Calls per week" }
      ]},
      { kind: "p", body: "Websites charge $500 to $2,000 as a one-time. Website plus ads is $1,500 to $3,000/month. The free website is the door-opener for the recurring ads contract." },
      { kind: "section", num: "07", title: "Key Takeaways", id: "key-takeaways" },
      { kind: "list", items: [
        "Set up your operator. Five minutes on a folder and CLAUDE.md improves every output afterward",
        "Website creation is now a 30-second job. Single prompt, professional result",
        "Free mockups outperform cold pitches. Higher response rates, every time",
        "Websites are anchors. Valuable alone, but they exist to unlock the monthly ad management contract"
      ]}
    ]
  },
  {
    id: "m5-15-ai-agents-live",
    category: "module-5",
    title: "AI Agents Livestream",
    lede: "Four installable agents for Claude Code that handle lead scraping, web design, copywriting, and reporting. Functional skill files with slash commands, designed to run in a real marketing workflow.",
    readTimeMin: 60,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/5.15-ai-agents-live.html" },
    body: [
      { kind: "learnPanel", items: [
        "What each of the four agents does and where they slot into the workflow",
        "How the Lead Scraper scores and filters businesses",
        "How the Web Designer doubles as an outreach weapon",
        "How the Copywriter builds a voice profile before writing"
      ]},
      { kind: "section", num: "01", title: "The Four Agents", id: "four-agents" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Lead Scraper", desc: "Finds 50 qualified local businesses in any niche/city in under 10 minutes." },
        { num: "02", title: "Web Designer", desc: "Builds complete responsive client websites in under 2 minutes." },
        { num: "03", title: "Copywriter", desc: "Writes ads, emails, hooks, and scripts in a client's exact voice." },
        { num: "04", title: "Data Analyst", desc: "Turns raw ad data into client reports in 2 minutes." }
      ]},
      { kind: "p", body: "Installation is a copy job: unzip, drop the folders into ~/.claude/skills/, restart Claude Code." },
      { kind: "section", num: "02", title: "Agent 1: The Lead Scraper", id: "lead-scraper" },
      { kind: "p", body: "Searches Google, pulls business information, and scores each lead by how likely they are to need advertising services. No API key required. You paste a prompt, fill in niche and city, and let it run." },
      { kind: "h3", text: "What You Get" },
      { kind: "list", items: [
        "Business name, phone, website, Google rating, qualification score"
      ]},
      { kind: "h3", text: "Scoring System" },
      { kind: "list", items: [
        "5: Has a website, running ads, but poor quality",
        "4: Has a website, decent ads, room to improve",
        "3: Has a website, no ads (untapped)",
        "2: No website but good reviews (harder sell)",
        "1: No online presence (skip)"
      ]},
      { kind: "p", body: "Filtering: businesses must have 4.0+ stars and 20+ reviews. Results sorted by score, then by review count." },
      { kind: "h3", text: "Best Niches to Start With" },
      { kind: "list", items: [
        "Dentists, gyms, med spas, HVAC, plumbers",
        "Chiropractors, restaurants, auto detailing",
        "Real estate agents, cleaning companies"
      ]},
      { kind: "h3", text: "Bonus: Outreach Prompt" },
      { kind: "p", body: "After getting the leads, generate personalized DMs (2 to 3 sentences max) that reference something specific about the business, point out a marketing gap, and include a soft CTA. Output is a table with business name, platform, and message." },
      { kind: "section", num: "03", title: "Agent 2: The Web Design Agent", id: "web-designer" },
      { kind: "p", body: "Builds complete client websites from scratch in under 2 minutes. Inputs: client name, niche, city, anything else you have. Output: a complete responsive landing page (hero, services, about, testimonials, contact)." },
      { kind: "h3", text: "Two Usage Models" },
      { kind: "list", items: [
        "Outreach Weapon: build a mockup of a prospect's site for free and DM it. 'Hey, I rebuilt your site, want to see it?' reportedly gets 10x more responses than regular outreach",
        "Paid Deliverable: charge $500 to $2,000. 2 minutes to generate, 30 minutes to polish and deploy. Huge margin"
      ]},
      { kind: "h3", text: "Design Requirements" },
      { kind: "list", items: [
        "Dark modern aesthetic (#0a0a0a or similar)",
        "Primary accent color matched to the niche",
        "Mobile responsive (flexbox/grid)",
        "Clean Inter or Poppins from Google Fonts",
        "Subtle scroll animations if possible",
        "Professional, not corporate"
      ]},
      { kind: "h3", text: "Required Sections" },
      { kind: "list", items: [
        "Hero: outcome-focused headline, subheadline, primary CTA, gradient or dark overlay",
        "Services: 3-4 cards with icons, descriptions, benefits",
        "Trust: 3 trust signals (years, clients, guarantees)",
        "Testimonials: 3 realistic placeholders with names, ratings, specific outcomes",
        "About: first-person 2 to 3 sentences",
        "Contact: form (name, email, phone, message), phone, address, Maps placeholder",
        "Footer: business name, quick links, social icons, copyright"
      ]},
      { kind: "p", body: "Revamp Option: for existing sites, scrape their current content, then rebuild from scratch with real data instead of placeholders. Pro tip: take before/after screenshots side-by-side and DM the comparison. The contrast does the selling for you." },
      { kind: "section", num: "04", title: "Agent 3: The Copywriter Agent", id: "copywriter" },
      { kind: "h3", text: "Step 1: Build the Voice Profile" },
      { kind: "p", body: "Feed the agent existing content (social captions, website copy, reviews). It analyzes and documents: tone (formal, casual, friendly, authoritative), vocabulary level and common phrases, how they talk about customers, what they emphasize (price, quality, speed, trust), repeated phrases, what they avoid. Output is a Voice Profile document for future reference." },
      { kind: "h3", text: "Step 2: Write Ad Scripts" },
      { kind: "p", body: "Generate 5 Facebook/Instagram ad scripts as talking-head video scripts. Each one has a scroll-stopping hook in the first 3 seconds, runs 45 to 90 seconds when spoken naturally, names a specific result (not features), has a clear CTA, sounds like a real person, and uses specific numbers ($, %, timeframes). Each script gets a hook strength score 1-10." },
      { kind: "list", items: [
        "Problem-focused hook",
        "Result/transformation hook",
        "Curiosity/question hook",
        "Bold claim hook",
        "Story hook"
      ]},
      { kind: "h3", text: "Step 3: Write a 5-Email Sequence" },
      { kind: "list", items: [
        "Email 1 (immediately): confirmation, what to expect, one value piece",
        "Email 2 (24 hours before): reminder, social proof, anticipation",
        "Email 3 (1 hour before): final reminder, quick-win tip",
        "Email 4 (same day if no-show): empathetic reschedule request",
        "Email 5 (48 hours after no-show): last chance, what they are missing"
      ]},
      { kind: "p", body: "Subject lines designed to get opened (not generic reminders), short paragraphs, mobile-scannable, genuine value, personal tone, matches the voice profile exactly. Output format: Subject Line, Preview Text, Email Body." },
      { kind: "takeaway", text: "More real content examples means better output. Gather at least 10 from Google reviews, Instagram captions, website about pages." },
      { kind: "section", num: "05", title: "Bonus: The Reporting Agent", id: "reporting-agent" },
      { kind: "p", body: "Turns raw ad data into clean client reports in 2 minutes. Workflow: export ad data as CSV from Meta Ads Manager (campaign selected, Export Table Data, CSV), save it in the Claude Code workspace, paste the provided prompt referencing the filename." },
      { kind: "h3", text: "Analysis Output" },
      { kind: "list", items: [
        "Top 3 performing ads (by cost per result)",
        "Bottom 3 to pause or kill",
        "Best performing audience or placement",
        "Overall campaign health (good / needs attention / critical)",
        "One key insight the client should know",
        "Recommended next action"
      ]},
      { kind: "h3", text: "Report Format" },
      { kind: "list", items: [
        "Executive summary (3 sentences, non-technical)",
        "Key metrics snapshot table: spend, impressions, clicks, CTR, cost per result, ROAS",
        "What's working",
        "What to fix",
        "Recommended next steps"
      ]},
      { kind: "takeaway", text: "Tone is professional but friendly. No jargon. Always review the report before sending. AI can misread data. Verify numbers before client delivery." },
      { kind: "section", num: "06", title: "The Full System: Integration", id: "full-system" },
      { kind: "list", items: [
        "Lead Scraper: find 30 qualified businesses, filter to top 10 with outdated sites or no ads",
        "Web Design: pick 3 ugliest sites, revamp each in 2 minutes, screenshot before/after",
        "Copywriter (Outreach): personalized DMs for each, attach the before/after, send",
        "Copywriter (Delivery): once a client lands, build the voice profile and generate ad scripts, email sequences, social content",
        "Reporting: monthly export of ad data into clean client reports"
      ]},
      { kind: "heroStats", stats: [
        { value: "20 / day", label: "Outreach target" },
        { value: "30 min", label: "Total daily time" },
        { value: "20 to 40%", label: "Expected response rate" }
      ]},
      { kind: "section", num: "07", title: "Bonus: Belief Excavation Prompt", id: "belief-excavation" },
      { kind: "p", body: "Uncover the sponsoring thought driving an unwanted pattern, then flip it. Four steps: describe the recurring frustration; the agent digs with recursive 'why does that keep happening?' and 'what does that mean about you?' questions until it lands on the single belief that would guarantee the bad outcome; the agent names that limiting thought clearly ('Most things do not work,' 'I only ever scrape by'); then it restates the empowering opposite as an identity statement for daily practice." },
      { kind: "quote", body: "I am the Midas touch. Everything I create turns to gold." },
      { kind: "p", body: "Paste the prompt into any Claude chat, answer honestly, expect 10 to 20 minutes. Write down both the sponsoring thought and its flip for future reference." },
      { kind: "section", num: "08", title: "Key Takeaways", id: "key-takeaways" },
      { kind: "list", items: [
        "Four installable agents eliminate repetitive marketing work",
        "Lead Scraper reduces qualification research from hours to minutes",
        "Web Designer doubles as outreach weapon and paid deliverable",
        "Copywriter learns the client's voice first, then writes",
        "Reporting Agent collapses 2-hour analysis into 2 minutes",
        "Integration creates a complete sales-and-delivery system",
        "Belief excavation addresses limiting thoughts blocking growth"
      ]}
    ]
  }
];
