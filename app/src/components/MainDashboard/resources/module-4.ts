import type { Article } from "./types";

export const MODULE_4_ARTICLES: Article[] = [
  {
    id: "m4-1-managing-multiple-clients",
    category: "module-4",
    title: "Managing Multiple Clients",
    lede: "Your daily system for running 5-7 client accounts in 3-4 hours. Batching, calendar blocks, and the 1-hour-per-client rule that keeps you from burning out.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/4.1-managing-multiple-clients.html" },
    body: [
      { kind: "learnPanel", items: [
        "How simple math gets you from 1 client to $10K/month",
        "A morning and afternoon block that finishes work by 3 PM",
        "The 1-hour-per-client daily maximum (and what to do when you blow past it)",
        "Task batching across all clients so you stop context-switching"
      ]},
      { kind: "section", num: "01", title: "The Client Stack, Simple Math", id: "client-stack-math" },
      { kind: "p", body: "Revenue scales through client acquisition, not hours worked. The math is straightforward and you can see your way to $10K from any starting point." },
      { kind: "list", items: [
        "3 clients x $1,500/month = $4,500/month",
        "5 clients x $1,500/month = $7,500/month",
        "7 clients x $1,500/month = $10,500/month"
      ]},
      { kind: "quote", body: "Going from 1 client to 5 clients does NOT take 5x the work. Most of what you do is the same, you just repeat it." },
      { kind: "section", num: "02", title: "The Daily Routine (5 Clients)", id: "daily-routine" },
      { kind: "p", body: "Total daily work sits at 3-4 hours when you stick to the structure." },
      { kind: "h3", text: "Morning Block (9:00 AM to 10:15 AM)" },
      { kind: "list", items: [
        "Dashboard check: 15 minutes per client across all accounts",
        "Review spend, CPA/CPL, frequency",
        "Identify issues without optimizing yet",
        "Document action items"
      ]},
      { kind: "h3", text: "Afternoon Block (1:00 PM to 2:30 PM)" },
      { kind: "list", items: [
        "Execute all optimizations simultaneously",
        "Batch creative refreshes (copy, images, uploads)",
        "Reply to accumulated client messages in one session",
        "Set response expectation at 4-6 hours"
      ]},
      { kind: "p", body: "Completion: done by 3:00 PM." },
      { kind: "section", num: "03", title: "The 1-Hour Rule", id: "one-hour-rule" },
      { kind: "p", lead: "Maximum 1 hour per client daily.", body: "If you exceed 2+ hours, you're either over-servicing or missing systems." },
      { kind: "h3", text: "Normal Day (15-30 minutes per client)" },
      { kind: "list", items: [
        "Dashboard check: 10 min",
        "Small tweaks: 10 min",
        "Client reply: 5 min"
      ]},
      { kind: "h3", text: "Heavy Day (45-60 minutes per client)" },
      { kind: "list", items: [
        "Dashboard check: 10 min",
        "New creative batch: 25 min",
        "Campaign restructure: 15 min"
      ]},
      { kind: "section", num: "04", title: "Tools That Keep You Organized", id: "tools" },
      { kind: "table", headers: ["Tool", "Purpose", "Cost"], rows: [
        ["Google Calendar", "Block work sessions; color-code by client", "Free"],
        ["Google Sheets", "Client tracker (name, retainer, dates, status)", "Free"],
        ["Google Drive", "Organized folders per client with subfolders", "Free"],
        ["Slack/WhatsApp", "One channel per client; batch replies 1-2x daily", "Free"]
      ]},
      { kind: "section", num: "05", title: "The Power of Batching", id: "batching" },
      { kind: "h3", text: "Wrong Approach (Context Switching)" },
      { kind: "p", body: "Sequential task completion per client. 6+ hours and exhausting." },
      { kind: "h3", text: "Right Approach (Task Batching)" },
      { kind: "list", items: [
        "Check all dashboards (75 min)",
        "Write all ad copy (30 min)",
        "Generate all images (20 min)",
        "Upload all creatives (15 min)",
        "Reply all messages (15 min)"
      ]},
      { kind: "takeaway", text: "Batched workflow: 2.5 hours total, and you finish energized instead of fried." },
      { kind: "section", num: "06", title: "Your Weekly Rhythm", id: "weekly-rhythm" },
      { kind: "table", headers: ["Day", "Focus"], rows: [
        ["Monday", "Dashboard checks + weekly planning"],
        ["Tuesday", "Optimizations + creative refreshes"],
        ["Wednesday", "Dashboard checks + client calls"],
        ["Thursday", "Client calls + batch weekly reports"],
        ["Friday", "Light checks + prospecting"],
        ["Sat/Sun", "Off (ads run autonomously)"]
      ]},
      { kind: "section", num: "07", title: "Lesson Checklist", id: "checklist" },
      { kind: "list", items: [
        "Calculate target client stack and income goal",
        "Set recurring calendar blocks for Morning and Afternoon work",
        "Commit to 1-hour daily maximum per client",
        "Practice task batching across all accounts",
        "Create Google Sheets client tracker"
      ]}
    ]
  },
  {
    id: "m4-2-advanced-reporting",
    category: "module-4",
    title: "Advanced Reporting",
    lede: "Monthly strategy calls that make clients feel like they have a CMO on their team. This is how you retain clients for 12+ months and upsell them.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/4.2-advanced-reporting.html" },
    body: [
      { kind: "learnPanel", items: [
        "A monthly report template that tells the story of the month",
        "The 30-minute strategy call structure (10/10/10)",
        "A word-for-word script for owning bad months",
        "How to translate ROAS into ROI clients actually understand",
        "Five natural upsell paths from a monthly call"
      ]},
      { kind: "p", body: "You already know how to send weekly reports (lesson 3.11). Now it's time to level up: monthly strategy calls that make clients feel like they have a CMO on their team." },
      { kind: "section", num: "01", title: "The Monthly Report (Goes Deeper Than Weekly)", id: "monthly-report" },
      { kind: "p", body: "Your weekly report is a quick snapshot. The monthly report tells the story of the month: what happened, why it happened, and what you're doing next. Send it 1 day before the monthly call." },
      { kind: "h3", text: "Header" },
      { kind: "p", body: "MONTHLY PERFORMANCE REPORT, [Month Year], [Business Name]. Prepared by [Your Name]." },
      { kind: "h3", text: "The Big Numbers" },
      { kind: "list", items: [
        "Total Ad Spend: $[X]",
        "Total Leads Generated: [X]",
        "Cost Per Lead: $[X]",
        "Estimated Revenue from Ads: $[X]",
        "Return on Ad Spend (ROAS): [X]x"
      ]},
      { kind: "h3", text: "Month-Over-Month Comparison" },
      { kind: "table", headers: ["Metric", "This Month", "Last Month", "Change"], rows: [
        ["Spend", "$[X]", "$[X]", "[+/-X%]"],
        ["Leads", "[X]", "[X]", "[+/-X%]"],
        ["CPL", "$[X]", "$[X]", "[+/-X%]"],
        ["Revenue", "$[X]", "$[X]", "[+/-X%]"]
      ]},
      { kind: "h3", text: "Wins This Month" },
      { kind: "list", items: [
        "Best performing ad/angle and why",
        "Any record days or weeks",
        "New audience or creative that worked"
      ]},
      { kind: "h3", text: "Challenges" },
      { kind: "list", items: [
        "What didn't work and what you learned",
        "Any external factors: seasonality, competition"
      ]},
      { kind: "h3", text: "Next Month Plan" },
      { kind: "list", items: [
        "3 specific things you'll do differently",
        "New creative angles to test",
        "Budget recommendation"
      ]},
      { kind: "h3", text: "Recommendation" },
      { kind: "p", body: "One clear recommendation: increase budget, add a service, test a new platform, etc." },
      { kind: "section", num: "02", title: "The 30-Minute Monthly Strategy Call", id: "strategy-call" },
      { kind: "p", body: "This call is the single most important thing for client retention. It's where you go from vendor to partner." },
      { kind: "h3", text: "Minutes 1-10: The Numbers" },
      { kind: "p", body: "Walk through the monthly report. Spend, leads, CPL, revenue. Compare to last month. Keep it simple, don't bury them in data. Lead with the number THEY care about (usually leads or revenue, never impressions)." },
      { kind: "h3", text: "Minutes 10-20: The Learnings" },
      { kind: "p", body: "What worked, what didn't, what you learned. Show your top performing ad and explain WHY it worked. This is where you demonstrate expertise." },
      { kind: "quote", body: "The family angle outperformed the discount angle 3:1. Your customers respond more to emotion than price." },
      { kind: "h3", text: "Minutes 20-30: Next Month Plan" },
      { kind: "p", body: "3 specific things you'll do next month. New creative angles, budget changes, new offers to test. Ask for their input: Any promotions coming up? Seasonal events? New menu items? This makes them feel heard and gives you content ideas." },
      { kind: "section", num: "03", title: "How to Present Bad Months", id: "bad-months" },
      { kind: "p", body: "Bad months happen. CPL spikes, leads drop, a campaign tanks. How you handle it determines whether the client stays or leaves." },
      { kind: "h3", text: "Never Do This" },
      { kind: "list", items: [
        "The algorithm was being weird this month",
        "Facebook is just really competitive right now",
        "I'm not sure what happened",
        "Hiding or spinning the numbers"
      ]},
      { kind: "h3", text: "The Formula: Own It, Explain Why, Show the Plan" },
      { kind: "quote", body: "Hey Tony, I want to be upfront: this month wasn't as strong as last month. CPL went from $12 to $18. Here's what happened: our top 3 creatives hit creative fatigue around week 3, and I didn't refresh them fast enough. That's on me. Here's what I'm doing about it: I've already built 10 new ad variations, and I'm testing a completely new angle, customer testimonial videos. Based on what I'm seeing in the first 48 hours, next month should bounce back. I'll have an update for you by next Friday." },
      { kind: "takeaway", text: "Clients don't expect perfection. They expect honesty and a plan. That script keeps them." },
      { kind: "section", num: "04", title: "The ROI Calculator (Speak Their Language)", id: "roi-calculator" },
      { kind: "p", body: "Most clients don't understand ROAS or CPL. They understand: I put in X dollars and got Y dollars back. Show them that math every month." },
      { kind: "h3", text: "Example: Tony's Pizza, January" },
      { kind: "table", headers: ["Line Item", "Amount"], rows: [
        ["Ad Spend", "-$1,500"],
        ["Your Management Fee", "-$1,500"],
        ["Total Investment", "-$3,000"],
        ["Leads Generated", "125 leads"],
        ["Avg Order Value", "$35"],
        ["Close Rate (est. 40%)", "50 new customers"],
        ["Revenue from Ads", "+$1,750"],
        ["Repeat Customer Revenue (est. 3x/year)", "+$5,250"],
        ["Total Customer Value (Year 1)", "+$7,000"],
        ["ROI", "133%. For every $1 spent, Tony gets $2.33 back."]
      ]},
      { kind: "takeaway", text: "Always include the repeat customer math. First-time orders undervalue your work. When Tony sees that 50 new customers = $7K+ in yearly revenue for a $3K investment, he'll never cancel." },
      { kind: "section", num: "05", title: "Upsell Opportunities During Monthly Calls", id: "upsells" },
      { kind: "p", body: "Monthly calls are the best time to grow your revenue per client. Don't sell, just make natural suggestions based on results." },
      { kind: "h3", text: "Budget Increase" },
      { kind: "quote", body: "We're getting leads at $12 each. If we increase budget from $1.5K to $2.5K, we could get 80 more leads next month. Want to test it?" },
      { kind: "h3", text: "Add Instagram" },
      { kind: "quote", body: "Your Facebook ads are crushing it. I think we could get even better results on Instagram with video content. Want me to add that for an extra $500/mo?" },
      { kind: "h3", text: "Retargeting Campaign" },
      { kind: "quote", body: "We have 2,000 website visitors from ads now. I can run a retargeting campaign to bring back the ones who didn't convert. Usually $300-500/mo extra." },
      { kind: "h3", text: "Google Ads" },
      { kind: "quote", body: "People are searching for 'pizza near me' 5,000 times a month in your area. We could add Google Ads to catch those. Extra $1K/mo management." },
      { kind: "p", body: "Only upsell when results are GOOD. Never try to upsell during a bad month. Wait until you have wins to build on." },
      { kind: "section", num: "06", title: "Lesson Checklist", id: "checklist" },
      { kind: "list", items: [
        "Save the monthly report template, copy it, customize it for each client, send 1 day before your monthly call",
        "Know the 30-minute call structure: 10 min numbers, 10 min learnings, 10 min next month plan. Never wing it.",
        "Practice the bad month script: Own it, Explain why, Show the plan",
        "Build an ROI calculator for your client using real numbers, including repeat customer value",
        "Identify one upsell opportunity for your current client"
      ]}
    ]
  },
  {
    id: "m4-3-raising-your-prices",
    category: "module-4",
    title: "Raising Your Prices",
    lede: "The $1.5K to $5K ladder. When to raise, who to raise on, and the word-for-word script that gets clients to stay at the new rate.",
    readTimeMin: 10,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/4.3-raising-your-prices.html" },
    body: [
      { kind: "learnPanel", items: [
        "Three triggers that mean you've earned a price raise",
        "The Starter to Premium pricing ladder",
        "A word-for-word script with two options for existing clients",
        "How to win the value argument with simple ROI math"
      ]},
      { kind: "section", num: "01", title: "When to Raise Your Prices", id: "when-to-raise" },
      { kind: "p", body: "Raise prices only when you've earned the right to do so. Three triggers tell you it's time." },
      { kind: "h3", text: "Trigger 1: 3+ Months of Results" },
      { kind: "p", body: "You've delivered consistent results for 3 months with DATA supporting your value. This is the most common time to raise." },
      { kind: "h3", text: "Trigger 2: Referral Clients" },
      { kind: "p", body: "When clients refer others, it signals real value delivery. Referral clients should always start at your higher price point." },
      { kind: "h3", text: "Trigger 3: You're at Capacity" },
      { kind: "p", body: "With 5+ clients and limited availability, raising prices filters for better-fit clients while increasing your hourly value." },
      { kind: "section", num: "02", title: "The Price Ladder", id: "price-ladder" },
      { kind: "machineGrid", items: [
        { num: "$1,500", title: "Starter", desc: "For your first 1-3 clients. You're building portfolio and case studies. No stigma at this entry point." },
        { num: "$2,500-3,000", title: "Established", desc: "After 3-6 months with proven results. Case studies, testimonials, and systems in place. New clients enter here." },
        { num: "$5,000+", title: "Premium", desc: "6-12 months in, full portfolio. Managing $10K+ monthly ad spend, multi-platform, with operational support. A real agency." }
      ]},
      { kind: "section", num: "03", title: "The Conversation (Word-for-Word Script)", id: "the-script" },
      { kind: "p", body: "Timing matters: have this discussion at the end of a strong monthly call, never via text." },
      { kind: "quote", body: "Hey [name], I wanted to bring something up. We've been working together for [X] months now, and the results have been really strong, [specific result, e.g., 'we generated 340 leads at $11 each last quarter']. I'm adjusting my pricing for new clients to $[new price]/month starting next month. I wanted to give you a heads up because you've been with me from early on. I have two options for you: Option A: I can keep you at your current rate of $[current price] for the next 3 months as a thank you for being an early client. After that, it moves to the new rate. Option B: We can move to the new rate now, and I'll add [bonus, extra creative refresh per month, priority support, etc.] as part of the upgraded package. Either way works for me. What feels right for you?" },
      { kind: "takeaway", text: "You're informing, not requesting permission. Two options give the client control without offering indefinite discounting. Most pick Option A, then move to the new rate within three months anyway." },
      { kind: "section", num: "04", title: "The Value Argument", id: "value-argument" },
      { kind: "p", body: "When clients resist, demonstrate ROI rather than defending your price. If ads generate $20,000/month in revenue and you charge $3,000/month, that's a 6.7x return on investment." },
      { kind: "quote", body: "Would you pay $3,000 to make $20,000? That's what we're doing every month." },
      { kind: "p", body: "Clarity on value makes pricing discussions secondary." },
      { kind: "section", num: "05", title: "Existing Clients vs. New Clients", id: "existing-vs-new" },
      { kind: "h3", text: "Existing Clients" },
      { kind: "list", items: [
        "Grandfather pricing for a maximum of 3 months",
        "Provide early notice",
        "Add value to justify the increase",
        "Accept that departing clients weren't ideal fits",
        "Most will remain after value is demonstrated"
      ]},
      { kind: "h3", text: "New Clients" },
      { kind: "list", items: [
        "Always enter at the new price point",
        "Never discount to match legacy rates",
        "Use case studies to justify pricing",
        "Higher pricing attracts higher-quality clients"
      ]},
      { kind: "quote", body: "$3K clients are easier than $1.5K clients." },
      { kind: "section", num: "06", title: "Lesson Checklist", id: "checklist" },
      { kind: "list", items: [
        "Identify your price raise trigger (3+ months, referrals, or capacity)",
        "Decide your next price point on the ladder",
        "Save and practice the price raise script aloud",
        "Calculate your client's ROI and master the value argument"
      ]}
    ]
  },
  {
    id: "m4-4-hiring-your-first-va",
    category: "module-4",
    title: "Hiring Your First VA",
    lede: "At 4-5 clients you'll hit a wall, spending 5+ hours a day on repetitive tasks. A VA at $5-8/hour can handle 60% of that work. Here's who to hire, what to delegate, and how to train them in one weekend.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/4.4-hiring-your-first-va.html" },
    body: [
      { kind: "learnPanel", items: [
        "The five signals that mean it's time to hire",
        "What to delegate on day one (and what to never delegate)",
        "Where to find VAs and what to pay them",
        "A weekend training playbook with Loom + SOPs",
        "A first-week schedule that gets your VA productive fast"
      ]},
      { kind: "section", num: "01", title: "When to Hire", id: "when-to-hire" },
      { kind: "h3", text: "Signs You Need a VA" },
      { kind: "list", items: [
        "You have 4+ clients",
        "You're spending 5+ hours/day on client work",
        "You're turning down new business because of time",
        "You're doing tasks that don't require YOUR brain (uploading, formatting, screenshots)",
        "You're making $6K+/month (you can afford the $800-1,200/mo cost)"
      ]},
      { kind: "h3", text: "The Math That Makes It Obvious" },
      { kind: "table", headers: ["Metric", "Without VA", "With VA ($1,000/mo)"], rows: [
        ["Revenue", "5 clients x $1,500 = $7,500/mo", "7 clients x $1,500 = $10,500/mo"],
        ["Hours/day", "5-6 hours/day", "2-3 hours/day"],
        ["Capacity", "No time for new clients", "VA handles 15+ hours/week"],
        ["Net", "Stuck at $7,500", "$9,500/mo (and growing)"]
      ]},
      { kind: "section", num: "02", title: "What to Delegate (and What Not To)", id: "delegate" },
      { kind: "h3", text: "Delegate (Day 1)" },
      { kind: "list", items: [
        "Screenshot collection from Ads Manager",
        "Report formatting (fill in the template)",
        "Creative uploads to Ads Manager",
        "Scheduling client calls",
        "Organizing Google Drive files",
        "Competitor research (save ads to folder)",
        "Basic email follow-ups (from templates)"
      ]},
      { kind: "h3", text: "Never Delegate" },
      { kind: "list", items: [
        "Client communication (calls, strategy)",
        "Campaign strategy decisions",
        "Optimization decisions (kill/scale)",
        "Budget changes",
        "Sales calls with prospects",
        "Monthly strategy calls",
        "Writing ad copy (you + AI do this)"
      ]},
      { kind: "quote", body: "If a task requires judgment, keep it. If it's repetitive and can be taught with a Loom video, delegate it. Your VA handles the HANDS. You keep the BRAIN." },
      { kind: "section", num: "03", title: "Where to Find Your VA", id: "where-to-find" },
      { kind: "h3", text: "OnlineJobs.ph (Recommended)" },
      { kind: "list", items: [
        "Philippines-based VAs. English speakers, strong work ethic, most affordable",
        "Cost: $5-8/hr ($800-1,280/mo full-time)",
        "Best for: long-term, dedicated VA",
        "Tip: look for VAs with social media or marketing experience"
      ]},
      { kind: "h3", text: "Upwork (Alternative)" },
      { kind: "list", items: [
        "Global freelancers. Easy to test multiple people. Slightly more expensive",
        "Cost: $8-15/hr",
        "Best for: project-based or part-time work",
        "Tip: start with a small paid test task before committing"
      ]},
      { kind: "section", num: "04", title: "How to Train Your VA (One Weekend)", id: "training" },
      { kind: "p", body: "Training is simple: record yourself doing the task, then let them copy you." },
      { kind: "h3", text: "Step 1: Record Loom videos for every task" },
      { kind: "p", body: "Screen record yourself doing the task from start to finish. Narrate what you're doing and WHY. 5-10 min per video." },
      { kind: "h3", text: "Step 2: Write a simple SOP doc" },
      { kind: "p", body: "Google Doc with numbered steps + Loom link. Nothing fancy. Just: Step 1: Open Ads Manager. Step 2: Click on [client name]. Step 3: Screenshot the dashboard." },
      { kind: "h3", text: "Step 3: Have them do the task while you watch" },
      { kind: "p", body: "First time: they share their screen and do it live. You correct mistakes in real-time. Takes 30 min." },
      { kind: "h3", text: "Step 4: Review for 2 weeks, then trust the process" },
      { kind: "p", body: "Check their output daily for the first 2 weeks. After that, spot-check weekly. Good VAs become autonomous fast." },
      { kind: "section", num: "05", title: "Your VA's First Week", id: "first-week" },
      { kind: "table", headers: ["Day", "Task"], rows: [
        ["Day 1", "Watch all Loom videos. Read all SOPs. Take notes. Ask questions."],
        ["Day 2", "Screenshot all client dashboards (you review). Organize one client's Drive folder."],
        ["Day 3", "Format one weekly report using your template (you review before sending)."],
        ["Day 4", "Upload creatives to Ads Manager for one client (you review before publishing)."],
        ["Day 5", "Full workflow: screenshots, report, uploads for ALL clients. You review everything."]
      ]},
      { kind: "section", num: "06", title: "Lesson Checklist", id: "checklist" },
      { kind: "list", items: [
        "Decide if you're ready for a VA: 4+ clients, 5+ hours/day on repetitive tasks, $6K+/mo revenue",
        "List your delegatable tasks (every task that doesn't require your brain)",
        "Create a Loom account and record your first training video",
        "Post a job on OnlineJobs.ph or Upwork. Title: Virtual Assistant for Digital Marketing Agency. Start part-time (20 hrs/week).",
        "Write your first SOP document: How to take Ads Manager screenshots. Numbered steps + Loom link."
      ]}
    ]
  },
  {
    id: "m4-5-building-systems",
    category: "module-4",
    title: "Building Systems",
    lede: "Systems are what turn a freelancer into a business owner. The 80/15/5 split, the five SOPs you need, and a folder structure that makes new client setup take 5 minutes.",
    readTimeMin: 20,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/4.5-building-systems.html" },
    body: [
      { kind: "learnPanel", items: [
        "The 80/15/5 rule that splits work between AI, VA, and you",
        "Five SOPs every agency owner needs",
        "A Google Drive folder template that scales to 20+ clients",
        "An Operations Hub spreadsheet with three core tabs",
        "What a real, systemized creative refresh looks like end-to-end"
      ]},
      { kind: "section", num: "01", title: "The 80/15 Rule", id: "the-80-15-rule" },
      { kind: "p", body: "The core principle distinguishing business owners from freelancers is systematic processes. Work distribution should follow this model." },
      { kind: "list", items: [
        "80% AI does this: ad copy, creative concepts, audience research, report drafts, optimization suggestions",
        "15% VA does this: uploads, formatting, screenshots, scheduling, file organization, data entry",
        "5% You do this: strategy decisions, client calls, approvals, quality control, new business"
      ]},
      { kind: "takeaway", text: "Your 5% is the highest-value work: decisions, client communication, and quality control. Everything else runs without you. That's how 7 clients fits into 2-3 hours a day." },
      { kind: "section", num: "02", title: "The 5 SOPs You Need", id: "five-sops" },
      { kind: "p", body: "Standard Operating Procedures (SOPs) document how specific tasks get done. Five core SOPs are required." },
      { kind: "h3", text: "SOP 1: Client Onboarding (30 min to build)" },
      { kind: "p", body: "New client signs, get business info, set up Business Manager access, install pixel, create campaign structure, launch first ads, send welcome email with expectations." },
      { kind: "h3", text: "SOP 2: Campaign Launch (20 min to build)" },
      { kind: "p", body: "AI generates ad copy, AI generates creatives, VA uploads to Ads Manager, you review, set targeting, set budget, launch, monitor first 48 hours." },
      { kind: "h3", text: "SOP 3: Weekly Optimization (20 min to build)" },
      { kind: "p", body: "VA takes screenshots, you review metrics, kill underperforming ads, duplicate winners with new audiences, increase budget on winners by 20% max, note changes in tracker." },
      { kind: "h3", text: "SOP 4: Weekly and Monthly Reporting (15 min to build)" },
      { kind: "p", body: "VA fills report template with numbers, you add insights and recommendations, VA formats and sends. Monthly includes detailed strategy call prep." },
      { kind: "h3", text: "SOP 5: Creative Refresh (20 min to build)" },
      { kind: "p", body: "Identify fatigued creatives, AI generates 5-10 new copy variations and images, VA uploads, you review and launch, test for 3-5 days." },
      { kind: "section", num: "03", title: "Google Drive Folder Structure", id: "drive-structure" },
      { kind: "p", body: "Every client gets an identical folder structure, duplicated from a template rather than recreated." },
      { kind: "list", items: [
        "Agency (root folder)",
        "Agency / SOPs: all 5 SOP documents",
        "Agency / Templates: report templates, proposal templates",
        "Agency / _CLIENT TEMPLATE: 01-Onboarding, 02-Creatives, 03-Reports, 04-Assets, 05-Notes",
        "Agency / Tony's Pizza (duplicated from template)",
        "Agency / Bright Smile Dental (duplicated from template)",
        "Agency / FitZone Gym (duplicated from template)"
      ]},
      { kind: "quote", body: "Templates, Duplicate, Don't Recreate. New client setup takes 5 minutes." },
      { kind: "section", num: "04", title: "Your Operations Hub (Google Sheets)", id: "ops-hub" },
      { kind: "p", body: "A single centralized Google Sheet consolidates all operational visibility. Three tabs." },
      { kind: "h3", text: "Tab 1: Client Dashboard" },
      { kind: "p", body: "Columns: Client Name, Retainer, Start Date, Ad Spend, Next Report Due, Next Call, Status, Notes." },
      { kind: "h3", text: "Tab 2: Task Tracker" },
      { kind: "p", body: "Columns: Task, Client, Assigned To (You/VA), Due Date, Status (To Do / In Progress / Done)." },
      { kind: "h3", text: "Tab 3: Revenue Tracker" },
      { kind: "p", body: "Columns: Month, Revenue, Expenses (VA, tools, ads), Net Profit, # of Clients, Revenue Per Client." },
      { kind: "section", num: "05", title: "A Real Workflow: Creative Refresh", id: "real-workflow" },
      { kind: "list", items: [
        "YOU: notice CTR dropping, decide new creatives are needed (2 minutes)",
        "AI: generate 10 new copy variations + 5 image concepts (10 minutes)",
        "YOU: review and select best 5 copy + 3 images (5 minutes)",
        "VA: upload to Ads Manager, set up variations, save to Drive (15 minutes)",
        "YOU: final review and publish (3 minutes)"
      ]},
      { kind: "takeaway", text: "Total time: 35 minutes. Your involvement: 10 minutes. Without systems this is a 2+ hour personal task." },
      { kind: "section", num: "06", title: "Lesson Checklist", id: "checklist" },
      { kind: "list", items: [
        "Understand the 80/15/5 rule. If you're doing more than 5%, your systems aren't complete.",
        "Create 5 SOP documents using Google Docs with Loom links",
        "Set up Google Drive folder structure with _CLIENT TEMPLATE and 5 subfolders",
        "Build Operations Hub spreadsheet with 3 tabs",
        "Execute one complete workflow end-to-end, targeting under 10 minutes of personal involvement"
      ]}
    ]
  },
  {
    id: "m4-6-troubleshooting",
    category: "module-4",
    title: "Troubleshooting",
    lede: "Disabled accounts, policy violations, stuck campaigns, broken lead forms. The technical playbook so problems don't become panic.",
    readTimeMin: 10,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/4.6-troubleshooting.html" },
    body: [
      { kind: "learnPanel", items: [
        "How to recover a disabled ad account (and prevent the next one)",
        "Five policy violations that catch beginners and what to say instead",
        "When to wait through Learning phase vs. when to reset",
        "A four-step diagnosis for sudden CPM spikes",
        "A monthly lead-form QA checklist"
      ]},
      { kind: "p", body: "This lesson addresses technical problems that arise in ad management: disabled accounts, policy violations, stuck campaigns, and broken lead forms. It builds on Lesson 3.13 (client communication) by focusing on the technical issues themselves." },
      { kind: "section", num: "01", title: "Ad Account Disabled", id: "account-disabled" },
      { kind: "h3", text: "Step 1: Don't Panic" },
      { kind: "p", body: "Account disablement happens frequently and is often reversible, even when Meta's automated systems incorrectly flag accounts." },
      { kind: "h3", text: "Step 2: Check the Email" },
      { kind: "p", body: "Meta provides notification emails explaining the reason for disablement. Common causes include suspicious payment activity, policy violations, or account quality issues." },
      { kind: "h3", text: "Step 3: Request a Review" },
      { kind: "p", body: "Go to facebook.com/accountquality, locate the disabled account, and select Request Review. Submit a professional appeal explaining your business and policy compliance. Expect a response within 24-48 hours." },
      { kind: "h3", text: "Step 4: Contact Support (If Needed)" },
      { kind: "p", body: "If the review is denied, access live chat support through Business Manager, Help, Contact Support. Business verification strengthens your case. As a last resort, create a new ad account within the existing Business Manager." },
      { kind: "h3", text: "Prevention Strategy" },
      { kind: "p", body: "Verify the business in Business Manager, use legitimate payment methods, avoid dramatic budget fluctuations, and follow advertising policies. These steps reduce disable risk by approximately 90%." },
      { kind: "section", num: "02", title: "Common Policy Violations", id: "policy-violations" },
      { kind: "p", body: "Most policy violations are unintentional. These five catch beginners most often." },
      { kind: "table", headers: ["Violation", "What to Do Instead"], rows: [
        ["Before/after photos (health, fitness, beauty)", "Show the process, not the transformation. Use 'See our approach' instead of 'Look at these results.'"],
        ["Income/earnings claims", "Never promise specific dollar amounts. Say 'grow your business' rather than 'make $10K/month.'"],
        ["Misleading claims", "Avoid exaggeration. 'Best pizza in town' is fine; 'Scientifically proven to cure hunger' is not."],
        ["Personal attributes ('Are you overweight?')", "Don't call out personal characteristics directly. Rephrase as 'Want to feel more confident?'"],
        ["Missing Special Ad Category", "Housing, credit, employment, and social issues/politics ads must be tagged as Special Ad Category, or accounts risk suspension."]
      ]},
      { kind: "section", num: "03", title: "Campaign Stuck in Learning", id: "learning-phase" },
      { kind: "p", body: "Meta requires roughly 50 conversions per week to exit the Learning phase. Use this framework to decide whether to wait or reset." },
      { kind: "h3", text: "Wait If" },
      { kind: "list", items: [
        "Less than 7 days have passed",
        "The campaign is generating some conversions",
        "Cost per conversion remains acceptable",
        "No major changes have been made"
      ]},
      { kind: "p", body: "Action: allow time to accumulate data without making adjustments." },
      { kind: "h3", text: "Reset If" },
      { kind: "list", items: [
        "10+ days have elapsed with no progress",
        "Zero or near-zero conversions are occurring",
        "Cost per conversion exceeds target by 3x or more",
        "Multiple edits have restarted the learning process"
      ]},
      { kind: "p", body: "Action: duplicate the ad set and pause the original to start fresh." },
      { kind: "takeaway", text: "Significant edits (budget changes exceeding 20%, new creative, audience modifications) restart Learning. Batch optimizations together to minimize restarts." },
      { kind: "section", num: "04", title: "CPM Suddenly Spikes, Diagnosis Framework", id: "cpm-spike" },
      { kind: "p", body: "When CPM (cost per 1,000 impressions) increases, all campaign costs rise. Use this diagnostic sequence." },
      { kind: "h3", text: "1. Creative Fatigue?" },
      { kind: "p", body: "Check frequency. If it reaches 3 or higher, the audience has seen the ads too many times. Solution: launch new creative." },
      { kind: "h3", text: "2. Audience Saturation?" },
      { kind: "p", body: "Assess audience size vs. campaign scope. Local businesses with narrow geographic targeting can exhaust the pool. Solution: gradually expand the geographic radius." },
      { kind: "h3", text: "3. Competition?" },
      { kind: "p", body: "More active advertisers in the auction means more bidding pressure. Solution: build higher-performing creative that wins more auctions through better CTR." },
      { kind: "h3", text: "4. Seasonality?" },
      { kind: "p", body: "Q4 CPMs typically spike 30-50% due to holiday advertising volume. Prices normalize in January. Solution: set client expectations about seasonal variation in advance." },
      { kind: "section", num: "05", title: "Lead Form Not Working, Testing Checklist", id: "lead-form-test" },
      { kind: "list", items: [
        "Click your own ad: verify the form opens correctly; sometimes forms disconnect from ads",
        "Submit a test lead: input fictional data and complete submission; confirm successful processing",
        "Check the leads center: Business Manager, Leads Center; confirm leads appear",
        "Check CRM integration: if connected to a CRM, verify leads transfer through; review connection status",
        "Check email notifications: confirm the client receives email alerts for new leads; configure in Page Settings if needed",
        "Test on mobile AND desktop: forms can break on one device while working on another",
        "Check form questions: too many fields cause abandonment; keep 3-4 fields max (name, phone, email, optional question)"
      ]},
      { kind: "section", num: "06", title: "Lesson Checklist", id: "checklist" },
      { kind: "list", items: [
        "Bookmark facebook.com/accountquality for appealing disabled accounts",
        "Memorize the five common policy violations: before/after imagery, income claims, misleading statements, personal attributes, missing Special Ad Category tags",
        "Apply the wait vs. reset framework for Learning phase",
        "Identify four CPM spike causes in order: creative fatigue, audience saturation, competitive bidding, seasonality",
        "Test lead forms monthly: click ads, submit test leads, verify delivery for every client account"
      ]}
    ]
  },
  {
    id: "m4-7-ten-k-milestone",
    category: "module-4",
    title: "The $10K/Month Milestone",
    lede: "What $10K/month actually looks like: 5-7 clients at $1,500-$2,000 each, 2-3 hours of daily work, and 90%+ profit margins. Then the decision: stay comfortable or scale.",
    readTimeMin: 10,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/4.7-ten-k-milestone.html" },
    body: [
      { kind: "learnPanel", items: [
        "The exact client math behind $10K/month",
        "What your daily routine looks like at this scale",
        "True take-home after VA, software, and other costs",
        "The decision: stay at $10K or push to $30K"
      ]},
      { kind: "p", body: "This lesson shows what hitting $10,000 monthly actually entails. It's an attainable goal built on straightforward math: 5-7 clients at $1,500-$2,000 each." },
      { kind: "section", num: "01", title: "The Simple Math", id: "the-math" },
      { kind: "table", headers: ["Scenario", "Clients", "Monthly Rate", "Monthly Total"], rows: [
        ["Conservative", "5", "$1,500", "$7,500"],
        ["Sweet Spot", "6", "$1,750", "$10,500"],
        ["Aggressive", "7", "$2,000", "$14,000"]
      ]},
      { kind: "p", body: "Annual range across these scenarios: $90K to $168K." },
      { kind: "section", num: "02", title: "Your Daily Routine at $10K/Month", id: "daily-routine" },
      { kind: "list", items: [
        "8:00 AM: dashboard review (90 minutes, 15 min per 6 clients)",
        "9:30 AM: execute optimizations across accounts (45 minutes)",
        "10:15 AM: create/refresh ad creatives as needed (30 minutes)",
        "10:45 AM: work complete for the day"
      ]},
      { kind: "p", body: "Mondays include weekly reporting and monthly calls, adding about an hour. With a VA handling uploads and formatting, workload drops to roughly two hours daily. The rest of your day is yours." },
      { kind: "section", num: "03", title: "Your Actual Take-Home", id: "take-home" },
      { kind: "h3", text: "Monthly Breakdown (6 clients x $1,750)" },
      { kind: "table", headers: ["Line Item", "Amount"], rows: [
        ["Gross Revenue", "$10,500"],
        ["VA costs (20 hrs/week)", "-$600"],
        ["Software (Canva Pro, CapCut, Claude)", "-$80"],
        ["Personal advertising / lead generation", "-$300"],
        ["Miscellaneous (Zoom, Google Workspace)", "-$50"],
        ["Net Profit", "$9,470/month"]
      ]},
      { kind: "heroStats", stats: [
        { value: "90%+", label: "Profit Margin" },
        { value: "~$113K", label: "Net Income / Year" },
        { value: "2 hrs", label: "Daily Workload" }
      ]},
      { kind: "p", body: "No inventory, no office space, no full-time staff. That's roughly $113,000 annually in net income." },
      { kind: "section", num: "04", title: "The Decision: Comfortable or Scale?", id: "decision" },
      { kind: "h3", text: "Option A: Stay at $10K" },
      { kind: "list", items: [
        "Maintain 5-7 clients",
        "Work 3 hours daily",
        "Prioritize time freedom over growth"
      ]},
      { kind: "h3", text: "Option B: Push to $30K" },
      { kind: "list", items: [
        "Raise rates and add clients",
        "Hire additional VA support",
        "Build toward an agency model",
        "Covered in Module 5"
      ]},
      { kind: "quote", body: "Either way, you did it. 8 weeks ago you started this course. Now you have a real business, real clients, real income." },
      { kind: "section", num: "05", title: "Module 4 Complete", id: "module-complete" },
      { kind: "list", items: [
        "Multi-client management",
        "Advanced reporting and monthly calls",
        "Price increases",
        "VA hiring",
        "Systems and SOPs development",
        "Troubleshooting",
        "$10K milestone achievement"
      ]},
      { kind: "p", body: "Next step: Module 5 covers advanced AI tools and scaling to $30K/month." },
      { kind: "section", num: "06", title: "Lesson Checklist", id: "checklist" },
      { kind: "list", items: [
        "Calculate your specific $10K target (client count x rate)",
        "Map your daily routine with current/target client load",
        "Choose Option A (comfortable) or Option B (scale to $30K)"
      ]}
    ]
  }
];
