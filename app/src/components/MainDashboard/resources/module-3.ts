import type { Article } from "./types";

export const MODULE_3_ARTICLES: Article[] = [
  {
    id: "m3-1-fulfillment-overview",
    category: "module-3",
    title: "Fulfillment Overview",
    lede: "The client just said yes. Now what? This lesson maps the complete pipeline from signed deal to first ad live, and gives you a checklist you'll use for every single client you onboard.",
    readTimeMin: 5,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.1-fulfillment-overview.html" },
    body: [
      { kind: "learnPanel", items: [
        "The 7-day pipeline from signed deal to ads live",
        "Why fulfillment quality decides client lifetime value",
        "Your job versus the agents' job",
        "A six-phase checklist for every new client"
      ]},
      { kind: "section", num: "01", title: "The 7-Day Launch Pipeline", id: "seven-day-pipeline" },
      { kind: "p", body: "A systematic approach structured across seven consecutive days. Each day has a clear outcome." },
      { kind: "h3", text: "Day 0, Close" },
      { kind: "list", items: [
        "Client signs contract and pays first invoice",
        "Send contract via DocuSign or PandaDoc",
        "Collect payment through Stripe",
        "Send welcome email containing onboarding form"
      ]},
      { kind: "h3", text: "Day 1, Onboarding Call" },
      { kind: "list", items: [
        "30-minute kickoff call with access collection",
        "Introduce yourself professionally",
        "Review onboarding form together",
        "Collect access credentials (Meta Business Manager, website, Google Analytics)",
        "Communicate expectation: ads live within 7 days"
      ]},
      { kind: "h3", text: "Day 2, Research and Setup" },
      { kind: "list", items: [
        "Set up or audit Meta ad account",
        "Install pixel on client website",
        "Research competitors, audience, and local market using AI agents"
      ]},
      { kind: "h3", text: "Day 3 to 4, Creative Production" },
      { kind: "list", items: [
        "Use AI Ad Copy Agent for 10+ variations",
        "Use AI Creative Agent for image and video concepts",
        "Use AI Audience Agent for targeting research",
        "Send creative list to client for approval"
      ]},
      { kind: "h3", text: "Day 5 to 6, Campaign Build" },
      { kind: "list", items: [
        "Structure campaigns using CBO or ABO based on budget",
        "Upload all creatives",
        "Set budgets and verify targeting, placements, pixel events",
        "Complete QA checklist before launching"
      ]},
      { kind: "h3", text: "Day 7, Launch" },
      { kind: "list", items: [
        "Publish all campaigns",
        "Send client notification that ads are live",
        "Set up AI Optimizer for monitoring"
      ]},
      { kind: "section", num: "02", title: "Why Fulfillment Makes or Breaks You", id: "why-fulfillment-matters" },
      { kind: "heroStats", stats: [
        { value: "5 to 10x", label: "Cheaper to keep a client than find a new one" },
        { value: "6 to 12 mo", label: "Average lifetime with good fulfillment" },
        { value: "1 mo", label: "Average lifetime with bad fulfillment" }
      ]},
      { kind: "p", body: "A client paying $2K monthly for 12 months generates $24K revenue. That same client churning after month one represents only $2K plus a negative review. Fulfillment quality directly determines client longevity." },
      { kind: "section", num: "03", title: "Your Job vs. The Agents' Job", id: "you-vs-agents" },
      { kind: "h3", text: "You Handle" },
      { kind: "list", items: [
        "Client communication and relationship management",
        "Onboarding call and access collection",
        "Approving AI-generated creatives",
        "Sending weekly reports",
        "Monthly strategy calls",
        "Upselling and renewals"
      ]},
      { kind: "h3", text: "AI Agents Handle" },
      { kind: "list", items: [
        "Ad copy generation (10+ variations)",
        "Creative concepts by niche",
        "Audience research and targeting",
        "Campaign uploads and technical execution",
        "Performance monitoring",
        "Killing underperformers automatically"
      ]},
      { kind: "quote", body: "You are the face. The agents are the engine. The client never needs to know how the sausage is made, they just need results and communication." },
      { kind: "section", num: "04", title: "New Client Onboarding Checklist", id: "onboarding-checklist" },
      { kind: "h3", text: "Phase 1, Close the Deal" },
      { kind: "list", items: [
        "Send contract via DocuSign or PandaDoc (scope, monthly fee, payment terms, 30-day cancellation clause)",
        "Collect first payment via Stripe or direct bank transfer (no work begins until payment clears)",
        "Send welcome email with onboarding form, timeline expectations, and calendar link"
      ]},
      { kind: "h3", text: "Phase 2, Onboarding Call (Day 1)" },
      { kind: "list", items: [
        "Conduct 30-minute onboarding call with form walkthrough",
        "Understand their business, target customer, current marketing, and goals",
        "Record the call with permission for future reference",
        "Collect Meta Business Manager access as Partner",
        "Collect website access for pixel installation",
        "Collect Google Analytics access as Viewer",
        "Request brand assets via shared Google Drive",
        "Define primary offer and CTA clearly",
        "Set clear expectations: ads live within 7 days, real data after 5 to 7 days, weekly updates Monday, monthly call on the first"
      ]},
      { kind: "h3", text: "Phase 3, Technical Setup (Day 2)" },
      { kind: "list", items: [
        "Set up or audit Meta Business Manager",
        "Install Meta Pixel on website via GTM or directly",
        "Verify pixel firing with Meta Pixel Helper and Test Events",
        "Set up payment method on ad account",
        "Research competitors using AI Audience Agent"
      ]},
      { kind: "h3", text: "Phase 4, Creative Production (Days 3 to 4)" },
      { kind: "list", items: [
        "Generate 10+ ad copy variations across PAS, AIDA, BAB frameworks",
        "Generate creative concepts (image: product shots, testimonials, comparisons; video: shot lists)",
        "Build audiences with interest targeting, lookalikes, location radius, demographics",
        "Send creatives to client for written approval"
      ]},
      { kind: "h3", text: "Phase 5, Campaign Build and QA (Days 5 to 6)" },
      { kind: "list", items: [
        "Build campaign structure (CBO for budgets over $50/day, ABO for smaller tests)",
        "Use naming convention: [Client]_[Objective]_[Audience]_[Date]",
        "Upload creatives as individual ads with Advantage Creative toggles OFF",
        "Complete QA: correct pixel, conversion event, linked page, CTA, no typos, correct URL, audiences, budget, schedule"
      ]},
      { kind: "h3", text: "Phase 6, Launch and Monitor (Day 7)" },
      { kind: "list", items: [
        "Publish all campaigns and wait for Meta review (1 to 24 hours)",
        "Notify client: ads are live, 48-hour learning phase, real data after 3 to 5 days",
        "Set up AI Campaign Optimizer with auto-pause rules",
        "Schedule daily 15-minute check-ins",
        "Schedule first weekly report for Monday"
      ]},
      { kind: "takeaway", text: "Run every client through the same six-phase pipeline. Consistency is what lets one person fulfill ten clients without dropping balls." }
    ]
  },
  {
    id: "m3-2-setting-ad-budgets",
    category: "module-3",
    title: "How Online Advertising Actually Works",
    lede: "Drop your preconceptions about advertising. One pizza shop analogy explains the whole machine, so you can pitch any business owner in 60 seconds and run the napkin math before you ever pick up the phone.",
    readTimeMin: 10,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.2-how-online-advertising-works.html" },
    body: [
      { kind: "learnPanel", items: [
        "The pizza shop analogy that explains the entire ad funnel",
        "Where every dollar of ad budget actually goes",
        "Real campaign numbers you can show on sales calls",
        "A 60-second explanation any business owner will understand"
      ]},
      { kind: "section", num: "01", title: "The Pizza Shop, One Analogy to Rule Them All", id: "pizza-analogy" },
      { kind: "p", body: "Meet Tony's Pizza in Tampa. Fifteen years in business with nothing more than a storefront sign and old Yelp reviews. We use Tony to explain every part of the machine." },
      { kind: "machineGrid", items: [
        { num: "01", title: "Ad Spend / Budget", desc: "Paying for flyers on doors. Tony spends $10/day. More spend, more doors, but Meta picks specific doors, not random." },
        { num: "02", title: "Targeting / Audience", desc: "Choosing WHICH doors. 5-mile radius around Tony's, ages 25 to 55, food delivery users, Italian food lovers." },
        { num: "03", title: "Creative / Ad", desc: "The flyer itself. Pizza photo, headline ('Family Deal: 2 Large Pizzas, $24.99'), coupon. Good flyer wins. Bad flyer gets thrown out." },
        { num: "04", title: "Click / Engagement", desc: "Someone picks up the flyer. 3 to 5% of viewers tap (15 to 25 out of 500). They explore Tony's website or page." },
        { num: "05", title: "Conversion / Lead", desc: "Someone calls and orders. Of 15 to 25 clicks, 3 to 5 turn into calls, online orders, or forms. Real revenue." },
        { num: "06", title: "ROAS", desc: "Did Tony make more than he spent? $10 in, $80 out equals 8x ROAS. This is the number that keeps the client paying." }
      ]},
      { kind: "section", num: "02", title: "Where Tony's $10 Actually Goes", id: "budget-breakdown" },
      { kind: "list", items: [
        "$10: Tony's daily budget sent to Meta",
        "~$3: Meta keeps about 30% as profit",
        "500 to 1,000: Impressions (ad views in feeds)",
        "15 to 25: Clicks (interested taps)",
        "3 to 5: Conversions (calls, orders, forms)",
        "$80+: Revenue generated for Tony"
      ]},
      { kind: "p", body: "Most viewers won't click and most clickers won't convert. That's normal. Success depends on structuring campaigns so Tony's revenue exceeds his spend." },
      { kind: "section", num: "03", title: "Real Numbers From a Real Campaign", id: "real-campaign" },
      { kind: "p", body: "A 30-day local service business campaign:" },
      { kind: "satelliteGrid", stats: [
        { value: "$312", label: "Total ad spend" },
        { value: "31,400", label: "Impressions" },
        { value: "847", label: "Clicks" },
        { value: "47", label: "Leads" },
        { value: "31", label: "Booked jobs" },
        { value: "$4,200", label: "Revenue generated" },
        { value: "$6.64", label: "Cost per lead" },
        { value: "$10.06", label: "Cost per booked job" },
        { value: "13.5x", label: "ROAS" }
      ]},
      { kind: "p", body: "That's $13.50 back for every dollar spent. Compelling sales material." },
      { kind: "section", num: "04", title: "Napkin Math Calculator", id: "napkin-math" },
      { kind: "p", body: "Run quick profitability math before pitching a niche. Inputs: average customer value, daily ad budget, estimated CPL, lead-to-customer conversion rate, monthly fee." },
      { kind: "quote", body: "Mr. Tony, your average pizza order is $27 and you get about 3 orders per customer over time, so each customer is worth about $80. If I can get you customers for $10 each, would you pay me $2,000/month for that?", attribution: "Sales call script" },
      { kind: "section", num: "05", title: "The 60-Second Explanation", id: "sixty-second" },
      { kind: "quote", body: "Here's how it works in simple terms. I put an ad for your business on Facebook and Instagram. That ad shows up on the phone of people in your area who are already looking for what you sell. When they see it, they tap on it and either call you, book online, or fill out a form. You get the customer, you make money. My job is to make sure you're getting way more back than you're spending on the ads. Most of our clients see a 5 to 10x return, meaning for every dollar they put in, they get five to ten dollars back. And I handle everything. You just answer the phone." },
      { kind: "section", num: "06", title: "Jargon to English Cheat Sheet", id: "jargon-cheat-sheet" },
      { kind: "table", headers: ["Term", "What It Means"], rows: [
        ["Impression", "Someone viewed the ad (scrolled past)"],
        ["CTR", "Click-Through Rate. % who tapped. 2 to 5% is normal."],
        ["CPM", "Cost per 1,000 views. $5 to $15 typical for local."],
        ["CPC", "Cost Per Click. $0.50 to $3 normal for local."],
        ["CPL", "Cost Per Lead. $5 to $25 for local."],
        ["CPA", "Cost Per Acquisition. The number that matters most."],
        ["ROAS", "Return On Ad Spend. Above 3x is good for local."],
        ["Pixel", "Website tracking code that tells Meta when conversions happen."],
        ["Learning Phase", "First 3 to 7 days while Meta optimizes. Results are variable."]
      ]},
      { kind: "section", num: "07", title: "Lesson Checklist", id: "checklist" },
      { kind: "list", items: [
        "Explain online ads using the pizza shop analogy out loud",
        "Understand the funnel: impressions to clicks to leads to customers",
        "Run napkin math for your niche",
        "Memorize the 60-second explanation",
        "Master ten jargon terms in plain English",
        "Know ROAS thresholds: 3x keeps clients, 5x keeps them long-term, below 2x means optimize or churn"
      ]}
    ]
  },
  {
    id: "m3-3-business-manager-setup",
    category: "module-3",
    title: "The Ad Platforms, Where Ads Run",
    lede: "Think of platforms like weapons in a video game. Master one before unlocking the next. Meta is your starter weapon, versatile and easy to learn. Google, TikTok, and YouTube come later.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.3-ad-platforms.html" },
    body: [
      { kind: "learnPanel", items: [
        "Why Meta is the starter weapon for every new client",
        "When to add Google, TikTok, or YouTube",
        "Which platform fits each niche best",
        "The one rule: master one platform first"
      ]},
      { kind: "section", num: "01", title: "Platform Unlock Order", id: "unlock-order" },
      { kind: "funnel", tiers: [
        { num: "01", label: "Meta", desc: "Starter weapon. Unlock Day 1." },
        { num: "02", label: "Google", desc: "Precision sniper. Unlock at client #3+." },
        { num: "03", label: "TikTok", desc: "Viral grenade. Right niche only." },
        { num: "04", label: "YouTube", desc: "Long-range cannon. Advanced only." }
      ]},
      { kind: "section", num: "02", title: "The Four Platforms Explained", id: "four-platforms" },
      { kind: "h3", text: "Meta (Facebook + Instagram)" },
      { kind: "p", lead: "Your #1 platform.", body: "Start here. Stay here for most clients. Easiest to learn, lowest cost to start, works for every niche, best for local." },
      { kind: "p", body: "Create an ad with image or video, target by location/age/interests, Meta serves it in Facebook and Instagram feeds. Users scroll, tap, take action (call, book, fill form)." },
      { kind: "satelliteGrid", stats: [
        { value: "$5 to $15", label: "Cost per lead (local)" },
        { value: "$10/day", label: "Minimum budget" },
        { value: "3B+", label: "Monthly users" }
      ]},
      { kind: "h3", text: "Google Ads (Search + Maps)" },
      { kind: "p", lead: "The sniper.", body: "Catches people actively searching for what your client sells. Higher quality, harder to learn, more expensive per click. Best for service businesses." },
      { kind: "p", body: "Add after Meta is profitable. Google leads convert at 2 to 3x the rate. Ideal for plumbers, dentists, lawyers, roofers, HVAC." },
      { kind: "satelliteGrid", stats: [
        { value: "$15 to $50", label: "Cost per lead (local)" },
        { value: "$20/day", label: "Minimum budget" },
        { value: "8.5B", label: "Daily searches" }
      ]},
      { kind: "h3", text: "TikTok Ads" },
      { kind: "p", lead: "The viral grenade.", body: "Massive reach for cheap, but only works for the right niches. Younger audience (18 to 34). Needs strong video creative that feels native, not polished." },
      { kind: "p", body: "Best for restaurants, bars, beauty salons, fitness studios, med spas, ecommerce. Skip for plumbers, lawyers, B2B. Only add when the client can produce video every 1 to 2 weeks." },
      { kind: "satelliteGrid", stats: [
        { value: "$3 to $12", label: "Cost per lead" },
        { value: "$20/day", label: "Minimum budget" },
        { value: "1.5B+", label: "Monthly users" }
      ]},
      { kind: "h3", text: "YouTube Ads" },
      { kind: "p", lead: "The long-range cannon.", body: "Great for retargeting and longer sales cycles. Slower results, needs video production. Ads appear before videos: 6-second bumpers or 15 to 30 second skippable." },
      { kind: "p", body: "Best use case is retargeting visitors who didn't convert. Don't attempt until you have 1,000+ visitors/month and you're stable on Meta with 3+ clients." },
      { kind: "satelliteGrid", stats: [
        { value: "$0.10 to $0.30", label: "Cost per view" },
        { value: "$15/day", label: "Minimum budget" },
        { value: "2.5B+", label: "Monthly users" }
      ]},
      { kind: "section", num: "03", title: "Side-by-Side Comparison", id: "comparison-table" },
      { kind: "table", headers: ["Aspect", "Meta", "Google", "TikTok", "YouTube"], rows: [
        ["Ease of Learning", "Easiest", "Hard", "Medium", "Hard"],
        ["Cost to Start", "$10/day", "$20/day", "$20/day", "$15/day"],
        ["Lead Quality", "Medium", "Highest", "Medium", "Medium"],
        ["Lead Volume", "Highest", "Medium", "Highest", "Medium"],
        ["Creative Effort", "Image/Video", "Text (search)", "Video required", "Video required"],
        ["Best for", "All local", "Service businesses", "Visual/young", "Retargeting"],
        ["When to Add", "Day 1", "Client #3+", "Right niche only", "Advanced"]
      ]},
      { kind: "section", num: "04", title: "Best Platform by Niche", id: "niche-picker" },
      { kind: "h3", text: "Restaurant" },
      { kind: "p", body: "Primary: Meta. 5 to 10 mile radius, food lovers, delivery app users. CPL $8 to $15. Secondary: TikTok for video content. Skip: Google (too expensive, Maps does it free). Budget: $10 to $20/day Meta." },
      { kind: "h3", text: "Plumber / HVAC" },
      { kind: "p", body: "Primary: Meta. Homeowners, 15 to 20 miles, seasonal offers. CPL $12 to $25. Secondary: Google for emergency search ($25 to $60 CPL but 40 to 60% conversion). Skip: TikTok. Budget: $15/day Meta + $20/day Google." },
      { kind: "h3", text: "Dentist" },
      { kind: "p", body: "Primary: Meta. Families within 10 miles, new patient specials, before/after for cosmetic. CPL $15 to $30. Secondary: Google for high-intent searches ($30 to $70 CPL, $2,000+ lifetime value). Budget: $15 to $25/day Meta." },
      { kind: "h3", text: "Real Estate Agent" },
      { kind: "p", body: "Primary: Meta. Carousel listings, target by location/income/life events. CPL $10 to $25. Secondary: Google (expensive, $50+/day budgets). Optional: YouTube for luxury markets. Budget: $20 to $30/day Meta." },
      { kind: "h3", text: "Med Spa / Beauty" },
      { kind: "p", body: "Primary: Meta (Instagram-heavy). Women 25 to 55, before/after photos. CPL $12 to $25. Secondary: TikTok for viral treatment videos. Skip: Google. Budget: $15 to $25/day Meta + $10 to $15/day TikTok." },
      { kind: "h3", text: "Gym / Fitness Studio" },
      { kind: "p", body: "Primary: Meta. 5 to 8 mile radius, free trial/$1 first month, transformation photos. CPL $8 to $18. Secondary: TikTok for workout clips. Skip: Google. Budget: $10 to $20/day Meta." },
      { kind: "h3", text: "Lawyer" },
      { kind: "p", body: "Primary: Google. Only niche where Google beats Meta as starter. CPL $50 to $150 but cases are $5K to $50K+. Secondary: Meta for retargeting. Skip: TikTok. Budget: $30 to $50/day Google minimum." },
      { kind: "h3", text: "Ecommerce" },
      { kind: "p", body: "Primary: Meta with Advantage+ Shopping and dynamic retargeting. CPA $10 to $30. Secondary: TikTok for sub-$50 products. Third: Google Shopping. Budget: $20 to $50/day Meta, scale to $100+." },
      { kind: "h3", text: "Roofing / Contractor" },
      { kind: "p", body: "Primary: Meta. 20 to 30 mile radius, seasonal angles, before/after photos. CPL $20 to $40. Secondary: Google for emergency searches ($30 to $80 CPL, $5K to $15K jobs). Budget: $15 to $25/day Meta + $25/day Google." },
      { kind: "section", num: "05", title: "The One Rule", id: "one-rule" },
      { kind: "quote", body: "Master Meta first. Get your client results on Meta. Make them profitable on Meta. THEN talk about adding Google or TikTok." },
      { kind: "takeaway", text: "Running three platforms poorly is worse than one platform done well. First three clients run Meta only. Lessons 3.4 onward focus exclusively on Meta." }
    ]
  },
  {
    id: "m3-4-ad-account-setup",
    category: "module-3",
    title: "Setting Up Meta Business Manager",
    lede: "Build your own Business Manager with a working ad account, then learn how to invite clients. Precision matters here. Wrong setup means restrictions and bans.",
    readTimeMin: 20,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.4-meta-business-manager.html" },
    body: [
      { kind: "learnPanel", items: [
        "Create your Business Manager and pass verification",
        "Set up your first ad account without bricking the currency",
        "Connect Facebook and Instagram pages",
        "Invite or get invited to a client account safely"
      ]},
      { kind: "section", num: "01", title: "Before You Start", id: "before-you-start" },
      { kind: "list", items: [
        "Personal Facebook account (real, for Meta verification, not exposed to clients)",
        "Business email address (agency email, not personal Gmail)",
        "Agency name (from lesson 0.2)",
        "Credit or debit card for the learning account"
      ]},
      { kind: "quote", body: "Never use a fake name or fake business on your BM. Meta will ban you permanently. Use your real info. They verify it." },
      { kind: "section", num: "02", title: "Create Your Business Manager", id: "create-bm" },
      { kind: "list", items: [
        "Go to business.facebook.com and click Create Account",
        "Enter business name (e.g. 'Brez Media'), your full legal name, business email",
        "Confirm via email verification link",
        "Bookmark business.facebook.com/latest/home as your dashboard",
        "Start business verification immediately: Business Settings, Security Center, Start Verification"
      ]},
      { kind: "p", body: "Upload LLC paperwork, EIN letter, or utility bill with business name. Processing takes 1 to 5 business days. Without verification your ad accounts have lower spending limits and are more likely to get restricted. Do it on day 1." },
      { kind: "section", num: "03", title: "Create Your Ad Account", id: "create-ad-account" },
      { kind: "list", items: [
        "Business Settings, Accounts, Ad Accounts, Add, Create a New Ad Account",
        "Account name: '[Your Agency] - Learning' for personal, '[Agency] - [Client]' for client work",
        "Time zone: match client location (affects daily budget reset)",
        "Currency: USD or relevant currency. Cannot be changed after creation.",
        "Owner: 'My business ([Agency Name])'. Toggle all admin permissions ON for yourself."
      ]},
      { kind: "quote", body: "Always give yourself full admin access. If something breaks at 11pm, you don't want to be locked out of your own ad account." },
      { kind: "section", num: "04", title: "Add Payment Method", id: "payment-method" },
      { kind: "h3", text: "Scenario A: Client Pays Meta Directly (Recommended)" },
      { kind: "p", body: "Client adds their card to their ad account. Agency manages ads, client pays Meta. Separate invoice for monthly agency fee via Stripe. This is the standard setup." },
      { kind: "h3", text: "Scenario B: Agency Fronts Spend" },
      { kind: "p", body: "Agency places their card on client account and invoices for spend plus fees. Higher risk. Start with Scenario A so you're not chasing clients for ad spend money early on." },
      { kind: "section", num: "05", title: "Connect a Facebook Page", id: "connect-page" },
      { kind: "p", body: "Every ad runs under a Facebook Page. No page, no ads." },
      { kind: "list", items: [
        "Business Settings, Accounts, Pages, Add",
        "Add a Page (own existing page)",
        "Request Access to a Page (most common, client approves)",
        "Create a New Page (if client lacks one)",
        "Optional: Business Settings, Accounts, Instagram Accounts, Add"
      ]},
      { kind: "section", num: "06", title: "Get Access to a Client's Ad Account", id: "client-access" },
      { kind: "h3", text: "Simple Method (Recommended)" },
      { kind: "list", items: [
        "Client goes to Business Settings, People, Add",
        "Client enters your agency email",
        "Client grants access to Ad Account (Manage Campaigns) and Page",
        "You accept the email invitation",
        "Their ad account appears in your Ads Manager"
      ]},
      { kind: "quote", body: "Hey! To get started on your ads, I need access to your Facebook ad account. Go to business.facebook.com, Business Settings, People, Add, type my email: [YOUR EMAIL]. Then give me access to your ad account and your Facebook page. Takes 2 minutes.", attribution: "Client script" },
      { kind: "h3", text: "Scaling Note" },
      { kind: "p", body: "At 10 to 15+ clients, switching between Business Managers gets tedious. Create your own agency BM and have clients add it as a Partner (Business Settings, Partners, Add, your BM ID). Don't worry about this until you're at scale." },
      { kind: "section", num: "07", title: "Common Mistakes That Get You Banned", id: "mistakes-to-avoid" },
      { kind: "list", items: [
        "Using a fake personal account to create Business Manager (permanent ban)",
        "Creating multiple BMs to circumvent bans (Meta links via IP, device, payment)",
        "Setting wrong timezone or currency (currency can't be changed)",
        "Failing to enable 2FA on all users",
        "Granting clients full Business Manager admin access (limit to their ad account and page)"
      ]},
      { kind: "p", body: "Best practice: add a second admin (trusted partner or second email you own) so you can recover if your main account is locked out." },
      { kind: "section", num: "08", title: "Navigation Cheat Sheet", id: "navigation-cheat-sheet" },
      { kind: "table", headers: ["Task", "Navigation Path"], rows: [
        ["Create or manage ads", "Ads Manager (ads.facebook.com)"],
        ["Add/manage ad accounts", "Business Settings, Accounts, Ad Accounts"],
        ["Add/manage pages", "Business Settings, Accounts, Pages"],
        ["Set up or check the pixel", "Events Manager (facebook.com/events_manager)"],
        ["Add a partner/client", "Business Settings, Partners, Add"],
        ["Add payment method", "Business Settings, Payments"],
        ["Find your Business Manager ID", "Business Settings, Business Info"],
        ["Turn on 2FA / security", "Business Settings, Security Center"]
      ]},
      { kind: "section", num: "09", title: "Do-It-With-Me Checklist", id: "do-it-checklist" },
      { kind: "list", items: [
        "Created Business Manager with real name, agency name, business email; verified",
        "Started business verification (LLC docs, EIN letter, or utility bill)",
        "Enabled 2FA in Security Center for all users",
        "Created first ad account '[Agency] - Learning' with correct timezone and currency",
        "Added payment method to learning ad account",
        "Connected or created Facebook Page",
        "Bookmarked business.facebook.com and ads.facebook.com",
        "Saved Business Manager ID from Business Info",
        "Added a backup admin for account recovery"
      ]}
    ]
  },
  {
    id: "m3-4b-client-meta-setup",
    category: "module-3",
    title: "Client-Side Meta Setup",
    lede: "Your Business Manager is built. Now you need access to the client's. This lesson covers what the client must do so you can manage their ads, in three common scenarios.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.4b-client-meta-setup.html" },
    body: [
      { kind: "learnPanel", items: [
        "The three client setup scenarios you'll encounter",
        "Exactly what the client clicks to grant access",
        "A copy-paste message to send your client",
        "The four questions every client will ask"
      ]},
      { kind: "section", num: "01", title: "What You Should Already Have", id: "prerequisites" },
      { kind: "list", items: [
        "Your own Business Manager (business.facebook.com)",
        "Your own ad account within your BM",
        "Business verification submitted",
        "Payment method added to your ad account"
      ]},
      { kind: "p", body: "If lesson 3.4 isn't done, stop here. You need your own BM before you can receive client access." },
      { kind: "section", num: "02", title: "Three Scenarios You'll Run Into", id: "three-scenarios" },
      { kind: "machineGrid", items: [
        { num: "A", title: "Client Has Nothing Set Up", desc: "Most common. Small business owners unfamiliar with Business Manager. You guide them through complete setup." },
        { num: "B", title: "Client Has BM + Ad Account", desc: "They've run ads before or worked with another agency. Skip setup, go straight to access invitation." },
        { num: "C", title: "Client Has Page But No BM", desc: "They post organically but never used the ads platform. Create their BM, then claim their existing page inside it." }
      ]},
      { kind: "p", body: "Most clients fall into Scenario A. Offer to complete setup together via Zoom or send a recorded walkthrough." },
      { kind: "section", num: "03", title: "Setting Up the Client's Side (Scenario A)", id: "scenario-a-setup" },
      { kind: "h3", text: "Client Creates Their Business Manager" },
      { kind: "list", items: [
        "business.facebook.com, Create Account",
        "Business name (actual, e.g. 'Tony's Pizza')",
        "Client's real full name",
        "Client's business email",
        "Confirm via Meta verification email"
      ]},
      { kind: "h3", text: "Client Creates an Ad Account" },
      { kind: "list", items: [
        "Business Settings, Accounts, Ad Accounts, Add, Create New",
        "Account name (their business name)",
        "Time zone (match client location)",
        "Currency (USD or relevant) cannot be changed afterwards, verify before submitting"
      ]},
      { kind: "h3", text: "Client Adds Their Payment Method" },
      { kind: "p", body: "Business Settings, Payment Methods, Add Payment Method. The client adds their own card. This funds ad spend, not your management fee. Never add your own card to a client account unless absolutely necessary with explicit trust." },
      { kind: "section", num: "04", title: "How the Client Gives You Access", id: "grant-access" },
      { kind: "h3", text: "What the Client Does" },
      { kind: "list", items: [
        "Open Business Settings (gear icon, bottom left at business.facebook.com)",
        "Go to People in the left sidebar",
        "Add People, type your business email",
        "Ad Account: toggle ON, select their ad account, Full Control",
        "Page: toggle ON, select their Facebook page, Full Control",
        "Send Invitation"
      ]},
      { kind: "p", body: "Always request Full Control. Partial access blocks campaign creation, audience editing, and budget adjustments." },
      { kind: "h3", text: "What YOU Do After" },
      { kind: "p", body: "Your Business Manager, Notifications/Settings, Requests. Accept the Meta email invitation. Their ad account and Facebook page now appear in your BM dashboard." },
      { kind: "section", num: "05", title: "Message to Send Your Client", id: "client-message" },
      { kind: "quote", body: "Hey [name], to get started I need access to your Meta ad account and Facebook page. Here's what to do:\n\n1. Go to business.facebook.com and log in\n2. Click Settings (gear icon, bottom left)\n3. Click People, Add People\n4. Type in my email: [your email]\n5. Give me Full Control on your ad account and your page\n6. Hit send\n\nThat's it! Once I accept on my end we're good to go. Let me know if you need help." },
      { kind: "p", body: "Pro tip: offer a 5-minute Zoom for less tech-savvy clients. Beats extended back-and-forth messaging." },
      { kind: "section", num: "06", title: "Questions Your Client Will Ask", id: "client-questions" },
      { kind: "h3", text: "Do you need my Facebook password?" },
      { kind: "p", body: "No. Business Manager handles invitations separately. Password access is never necessary." },
      { kind: "h3", text: "Can you see my personal Facebook?" },
      { kind: "p", body: "No. Business Manager is isolated from personal profiles. Only their business page and ad account are visible." },
      { kind: "h3", text: "Who pays for the ads?" },
      { kind: "p", body: "Their credit card funds ad spend directly to Meta. Your management fee is separate." },
      { kind: "h3", text: "What if I already boost posts?" },
      { kind: "p", body: "Boosting is different from Business Manager campaigns. Proper ad account setup gives you real control over targeting, budgets, and optimization." },
      { kind: "section", num: "07", title: "Final Checklist", id: "final-checklist" },
      { kind: "list", items: [
        "Client has Business Manager created",
        "Client has ad account with correct timezone and currency",
        "Client's payment method added (their card)",
        "Client sent invitation with Full Control on ad account AND page",
        "You accepted invitation in your BM",
        "Client's ad account visible in your BM dashboard",
        "Client's Facebook page visible in your BM dashboard"
      ]}
    ]
  },
  {
    id: "m3-5-the-pixel",
    category: "module-3",
    title: "The Pixel",
    lede: "The Meta Pixel is the invisible tracker that turns your ads from guesswork into a measurable machine. No pixel means no tracking, no optimization, and money down the drain.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.5-the-pixel.html" },
    body: [
      { kind: "learnPanel", items: [
        "What the pixel is and the three jobs it does",
        "The Google Tag Manager method for clean installs",
        "How to verify the pixel is actually firing",
        "When clients don't need a pixel at all"
      ]},
      { kind: "section", num: "01", title: "What Is the Pixel?", id: "what-is-pixel" },
      { kind: "p", body: "Imagine Tony hands out flyers at a mall but has no way to track results. The Meta Pixel is an invisible camera that recognizes everyone who got a flyer. He can see foot traffic, orders, and customer quality." },
      { kind: "p", body: "Technically it's a tiny piece of JavaScript on the client's website that tells Meta what happens after someone clicks an ad. You don't need to code. You copy and paste." },
      { kind: "section", num: "02", title: "Why the Pixel Is Non-Negotiable", id: "why-pixel" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Tracks Conversions", desc: "Measures leads, calls, and purchases generated by your ads." },
        { num: "02", title: "Feeds the Algorithm", desc: "Teaches Meta's AI who your ideal customer is. More data, cheaper leads." },
        { num: "03", title: "Enables Retargeting", desc: "Remembers visitors who didn't convert so you can follow up." }
      ]},
      { kind: "quote", body: "No pixel = no tracking = no optimization = wasting money." },
      { kind: "section", num: "03", title: "Pixel Events", id: "pixel-events" },
      { kind: "table", headers: ["Event", "Definition"], rows: [
        ["PageView", "Someone landed on any page (fires automatically)"],
        ["Lead", "Someone submitted a form (primary event for local)"],
        ["Contact", "Someone clicked phone number or contact button"],
        ["Schedule", "Someone booked an appointment"],
        ["Purchase", "Someone made a purchase (ecommerce only)"],
        ["ViewContent", "Someone viewed a specific page"]
      ]},
      { kind: "p", body: "Most local business clients need only PageView and Lead. Don't overcomplicate setup." },
      { kind: "section", num: "04", title: "Installing the Pixel", id: "install-pixel" },
      { kind: "p", body: "Does the client have a website? No website: use Meta Lead Forms (no pixel needed). Has website: install via Google Tag Manager." },
      { kind: "h3", text: "Why GTM" },
      { kind: "p", body: "GTM is the universal remote for tracking. One-time setup, no future website code edits." },
      { kind: "h3", text: "Step 1: Create a GTM Account" },
      { kind: "list", items: [
        "Visit tagmanager.google.com (free Google account required)",
        "Create one container per client website, named after the business"
      ]},
      { kind: "h3", text: "Step 2: Install GTM on Website (One-Time)" },
      { kind: "p", body: "GTM provides two snippets, one in <head> and one after <body>. For Shopify, Wix, Squarespace, WordPress, clients can self-install via Custom Code or Header Scripts sections." },
      { kind: "h3", text: "Step 3: Create Meta Pixel in Events Manager" },
      { kind: "list", items: [
        "Events Manager, Connect Data Sources, Web, Meta Pixel, Connect",
        "Name the pixel after the client",
        "Choose 'Install code manually'",
        "Copy the Pixel ID"
      ]},
      { kind: "h3", text: "Step 4: Add Meta Pixel to GTM" },
      { kind: "list", items: [
        "GTM Dashboard, Tags, New, Custom HTML",
        "Paste Meta Pixel base code, trigger: All Pages, save as 'Meta Pixel - Base'",
        "For Lead event: new tag, Custom HTML, paste the fbq track Lead script",
        "Trigger: Page View, Page URL contains /thank-you",
        "Save as 'Meta Pixel - Lead Event'"
      ]},
      { kind: "h3", text: "Step 5: Publish GTM Container" },
      { kind: "p", body: "Submit, Publish. Tracking begins immediately. Adding Google Ads or TikTok pixel later just means new tags in GTM, no developer needed." },
      { kind: "h3", text: "Alternative: Direct Integration" },
      { kind: "p", body: "Meta offers direct partner integrations for Shopify, WordPress (WooCommerce), and Squarespace. 60-second install when only Meta tracking is needed." },
      { kind: "section", num: "05", title: "Verify the Pixel Is Working", id: "verify-pixel" },
      { kind: "list", items: [
        "Install the Meta Pixel Helper Chrome extension",
        "Icon turns green on client's website if pixel is firing",
        "Events Manager, Data Sources, Test Events: enter site URL and submit a test form",
        "Verify PageView and Lead events appear in real time"
      ]},
      { kind: "h3", text: "Troubleshooting" },
      { kind: "list", items: [
        "Clear browser cache or try incognito",
        "Verify code in the head section, not body",
        "Confirm pixel ID matches between Events Manager and code",
        "Disable ad blockers",
        "Re-paste fresh code from Events Manager"
      ]},
      { kind: "section", num: "06", title: "What If the Client Doesn't Have a Website?", id: "no-website" },
      { kind: "h3", text: "Meta Lead Forms" },
      { kind: "list", items: [
        "No pixel required",
        "Higher conversion rates due to lower friction",
        "Auto-fills user data from Facebook profile",
        "Ideal for restaurants, salons, home services"
      ]},
      { kind: "h3", text: "Website Landing Page" },
      { kind: "list", items: [
        "Pixel required",
        "Higher-quality leads (friction filters out tire kickers)",
        "Better for high-ticket services ($500+)",
        "Enables retargeting and lookalike audiences"
      ]},
      { kind: "takeaway", text: "Start most local clients on Meta Lead Forms. Move to landing page + pixel when retargeting and lookalikes matter." }
    ]
  },
  {
    id: "m3-6-campaign-structure",
    category: "module-3",
    title: "Campaign Structure",
    lede: "Campaign, Ad Set, Ad. Three levels, one direction: top down. Get the hierarchy right and the rest of media buying clicks into place.",
    readTimeMin: 12,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.6-campaign-structure.html" },
    body: [
      { kind: "learnPanel", items: [
        "The three levels and how they nest",
        "CBO vs ABO and when to use each",
        "A naming convention that saves you at 2am",
        "The testing framework: launch, wait, kill, scale, repeat"
      ]},
      { kind: "section", num: "01", title: "The Three Levels", id: "three-levels" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Campaign", desc: "The goal. One objective per campaign (Leads, Traffic, or Sales). For local, use Leads." },
        { num: "02", title: "Ad Set", desc: "Targeting and budget. Audience experiments, who sees ads and at what spend." },
        { num: "03", title: "Ad", desc: "The creative, image or video, text, headline, CTA button. What users actually see." }
      ]},
      { kind: "p", body: "One campaign supports multiple ad sets. Each ad set supports multiple ads. Meta tests all variations and pushes budget to winners." },
      { kind: "quote", body: "You can't create an ad without an ad set. You can't create an ad set without a campaign. Always build top-down." },
      { kind: "section", num: "02", title: "Where Does the Budget Go? CBO vs ABO", id: "cbo-vs-abo" },
      { kind: "h3", text: "CBO, Campaign Budget Optimization" },
      { kind: "p", body: "Meta distributes one campaign-level budget across ad sets automatically. Use when you have proven audiences and want automation. Avoid when testing new audiences (Meta may starve unproven sets too early)." },
      { kind: "h3", text: "ABO, Ad Set Budget Optimization" },
      { kind: "p", body: "You control individual ad set budgets. Use when testing new audiences and creatives. Avoid when scaling (manual management gets heavy)." },
      { kind: "p", body: "Simple rule: testing means ABO. Scaling means CBO. Start every new client on ABO. Move winning ad sets into a CBO campaign once you know what works." },
      { kind: "section", num: "03", title: "Naming Your Campaigns", id: "naming-convention" },
      { kind: "list", items: [
        "Campaign: [Client] - [Goal] - [Type]. e.g. Tony's Pizza - Leads - ABO Testing",
        "Ad Set: [Audience] - [Location] - [Age]. e.g. Pizza Lovers - Tampa 5mi - 25-55",
        "Ad: [Format] - [Hook/Angle] - [Version]. e.g. Image - Family Deal $19.99 - V1"
      ]},
      { kind: "quote", body: "Future you will thank present you. At 2am when a client texts 'why did my ad stop?' you need to find the right campaign in 5 seconds." },
      { kind: "section", num: "04", title: "Budget Simulator", id: "budget-simulator" },
      { kind: "p", body: "Plug in daily budget, CPL, close rate, and average job value to see leads/month, customers, revenue, spend, and ROAS." },
      { kind: "satelliteGrid", stats: [
        { value: "$15/day", label: "Daily budget input" },
        { value: "$12", label: "Cost per lead" },
        { value: "20%", label: "Close rate" },
        { value: "$300", label: "Avg job value" },
        { value: "37", label: "Leads/month" },
        { value: "7", label: "New customers" },
        { value: "$2,100", label: "Revenue" },
        { value: "4.7x", label: "ROAS" }
      ]},
      { kind: "section", num: "05", title: "The Testing Framework", id: "testing-framework" },
      { kind: "list", items: [
        "Launch 3 to 5 different ads to the same audience (different images, headlines, angles)",
        "Wait for data: let each ad spend 2 to 3x target CPL before deciding (3 to 5 days typical)",
        "Kill losers that spent 3x target CPL with zero or minimal leads",
        "Scale winners slowly: +20 to 30% every 2 to 3 days",
        "Repeat. Winners fatigue, then you launch new creatives."
      ]},
      { kind: "quote", body: "The #1 beginner mistake: changing things too fast. You launch an ad, see no leads after 24 hours, and panic-edit the targeting. Meta needs 3 to 5 days to learn." },
      { kind: "section", num: "06", title: "The Learning Phase", id: "learning-phase" },
      { kind: "p", body: "When you launch new ad sets, Meta enters a learning phase while it figures out audience targeting. Performance is inconsistent. That's normal." },
      { kind: "list", items: [
        "Duration: 3 to 7 days, or ~50 conversion events, whichever comes first",
        "What resets it: editing targeting, changing budget more than 20%, pausing for long",
        "Safe edits: ad creative (adding new ads), bid caps, small budget increases (under 20%)"
      ]},
      { kind: "quote", body: "The first week might look rough. That's normal. Meta is learning. Don't freak out. By week 2, we'll have real data.", attribution: "Client communication script" },
      { kind: "section", num: "07", title: "Your First Campaign Structure", id: "first-structure" },
      { kind: "p", lead: "Campaign", body: "[Client Name] - Leads - ABO Testing. Objective: Leads. Budget: ABO." },
      { kind: "list", items: [
        "Ad Set 1: Broad - [City] 10mi - 25-55. $10 to $15/day. Targeting: Broad. 3 ads (Image angle A, Image angle B, Video testimonial/BTS).",
        "Ad Set 2: Interest - [Relevant Interest] - 25-55. $10 to $15/day. Same 3 ads (tests audiences, not creatives).",
        "Daily total: $20 to $30. Monthly: $600 to $900."
      ]},
      { kind: "takeaway", text: "Don't let clients start below $10/day. Meta doesn't have enough budget to learn at that level." }
    ]
  },
  {
    id: "m3-7-ai-arbitrage-system",
    category: "module-3",
    title: "The AI Arbitrage System",
    lede: "Same prices to clients, same results, one quarter of the work. AI agents handle 80% of the media buying workflow so you can run 10 to 15 clients instead of 3 to 5.",
    readTimeMin: 25,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.7-ai-arbitrage-system.html" },
    body: [
      { kind: "learnPanel", items: [
        "The arbitrage: 4x less work for the same client outcome",
        "The five agents and what each one does",
        "The 7-day launch pipeline mapped to specific agents",
        "How to diagnose campaign problems when they appear"
      ]},
      { kind: "section", num: "01", title: "The Arbitrage", id: "the-arbitrage" },
      { kind: "h3", text: "Traditional Agency Workflow" },
      { kind: "list", items: [
        "2 hrs: Manual niche research",
        "3 hrs: Ad copy (5 to 10 variations)",
        "4 hrs: Creative design in Photoshop",
        "2 hrs: Campaign structure",
        "1 hr: Launch and verification",
        "3 hrs: Weekly optimization and reporting",
        "Total: 15 to 20 hrs/client. Max capacity 3 to 5. Ceiling $6K to $10K/month."
      ]},
      { kind: "h3", text: "AI Agent Arbitrage Workflow" },
      { kind: "list", items: [
        "15 min: Nexus researches niche and competitors",
        "10 min: Aurelius writes 50+ ad variations",
        "20 min: Vortex reviews creative structure",
        "30 min: Build campaign and upload",
        "5 min: Nexus verifies launch",
        "15 min: Zenith and Stratos handle weekly ops",
        "Total: 3 to 5 hrs/client. Capacity 10 to 15. Potential $20K to $30K/month."
      ]},
      { kind: "takeaway", text: "Same pricing to clients, same results, 4x less work." },
      { kind: "section", num: "02", title: "Real Performance Example", id: "real-performance" },
      { kind: "heroStats", stats: [
        { value: "1,561", label: "Purchases across 9 campaigns in 2 weeks" },
        { value: "$135.19", label: "Average cost per purchase" },
        { value: "$75.47", label: "Average cost per checkout" },
        { value: "66.73%", label: "Average landing page rate" }
      ]},
      { kind: "section", num: "03", title: "The Agent Pipeline", id: "agent-pipeline" },
      { kind: "funnel", tiers: [
        { num: "01", label: "Aurelius", desc: "Launches new campaigns" },
        { num: "02", label: "Vortex", desc: "Reviews creative structure" },
        { num: "03", label: "Nexus", desc: "Verifies ads are live" },
        { num: "04", label: "Zenith", desc: "Tracks performance" },
        { num: "05", label: "Stratos", desc: "Optimizes for results" }
      ]},
      { kind: "section", num: "04", title: "Meet Your Agents", id: "meet-agents" },
      { kind: "h3", text: "Aurelius, Launches New Campaigns" },
      { kind: "p", body: "Builds entire campaigns from business info, offer, and target audience. Generates 50+ ad copy variations across PAS, AIDA, BAB, and Story frameworks." },
      { kind: "p", body: "Example Tony's Pizza outputs include a health angle ('Tired of pizza that sits like a brick?'), family angle ('Friday nights just got better'), and value angle ('You're paying $35 for delivery pizza?'). Products need distinct angles, not repetitive messaging." },
      { kind: "h3", text: "Vortex, Reviews Creative Structure" },
      { kind: "p", body: "Audits creative diversity before launch. Checks for format variety (image, carousel, video, UGC), angle diversity, duplicate or overly similar ads, and minimum target of 15 to 25 unique creatives." },
      { kind: "p", body: "Example output: 18 unique creatives across 4 formats and 7 angles, with a flag for a missing testimonial-style creative and a note that ads 5 and 8 are too similar." },
      { kind: "quote", body: "Creative IS the new targeting. The algorithm needs variety to identify buyers." },
      { kind: "h3", text: "Nexus, Verifies Ads Are Live" },
      { kind: "p", body: "Quality assurance and pre-launch research. Checks all ads approved, pixel firing, placements correct, Audience Network excluded, no policy violations, budget delivering. Pre-launch, analyzes competitor ads via Ad Library." },
      { kind: "p", body: "Ad Library insight: ads running 60+ days are proven winners. Study their angles, not their creative execution." },
      { kind: "h3", text: "Zenith, Tracks Ad Performance" },
      { kind: "p", body: "Monitors campaigns and produces client-ready weekly reports in 2 minutes." },
      { kind: "table", headers: ["Metric", "Value", "Trend"], rows: [
        ["Spent", "$210 ($30/day avg)", "baseline"],
        ["Impressions", "18.4K", "+12% vs week 1"],
        ["CPM", "$11.41", "-8% vs week 1"],
        ["CTR", "3.2%", "above 2%"],
        ["Leads", "23", "+44% vs week 1"],
        ["CPL", "$9.13", "Target: $15"]
      ]},
      { kind: "p", body: "Top performers: 'Friday Night Deal' at $6.20 CPL, 'Half the Price' at $7.80, 'Real Italian Dough' at $8.50. Bottom to kill: 'Healthy Choice' at $28, 'Gourmet at Home' at $22.50, 'New in Town' at $19." },
      { kind: "h3", text: "Stratos, Optimizes for Results" },
      { kind: "p", body: "Diagnoses problems and recommends data-driven actions. Example: CPM up 15% means normal fluctuation. Ad Set 2 CTR at 0.8% means creative fatigue, add 5 new creatives. Ad 3 at $6.20 CPL versus $12 target means scale 20%. Ad Set 1 exited learning phase, safe to optimize." },
      { kind: "section", num: "05", title: "The 7-Day Client Launch", id: "seven-day-launch" },
      { kind: "p", body: "Total time investment: 4 to 5 hours across 7 days." },
      { kind: "h3", text: "Day 1, Onboarding + Setup (90 min)" },
      { kind: "list", items: [
        "Onboarding checklist, business info, BM access",
        "Ad account setup, GTM and pixel if applicable",
        "Gather assets: logo, photos, testimonials",
        "Agents: none, manual"
      ]},
      { kind: "h3", text: "Day 2, Research + Copy (60 min)" },
      { kind: "list", items: [
        "Nexus analyzes competitor ads, extracts winning angles, generates 15 to 20 reasons to buy",
        "Aurelius writes 20+ ad copy variations across 4 frameworks",
        "Agents: Nexus, Aurelius"
      ]},
      { kind: "h3", text: "Day 3, Creative + Review (60 min)" },
      { kind: "list", items: [
        "Aurelius generates 15 to 25 creatives (images, carousels, video concepts)",
        "Vortex reviews mix for diversity",
        "Agents: Aurelius, Vortex"
      ]},
      { kind: "h3", text: "Day 4, Campaign Build (45 min)" },
      { kind: "list", items: [
        "Build campaign per 3.6 structure, upload creatives, set broad targeting and budget",
        "Nexus runs audit checklist",
        "Do not publish yet",
        "Agents: Nexus"
      ]},
      { kind: "h3", text: "Day 5, Review + Client Approval (30 min)" },
      { kind: "list", items: [
        "Review all elements, send 3 to 5 top ads for client sign-off",
        "Fix client-requested changes, confirm budget and start date",
        "Agents: none"
      ]},
      { kind: "h3", text: "Day 6, Launch (10 min)" },
      { kind: "list", items: [
        "Publish campaign",
        "Nexus verifies live: approved, pixel firing, budget delivering",
        "Text client: 'Your ads are live! I will check in with data in 3 days.'",
        "Agents: Nexus"
      ]},
      { kind: "h3", text: "Day 7, First Check (15 min)" },
      { kind: "list", items: [
        "Zenith shows initial data",
        "Stratos diagnoses if action needed",
        "Typical output: 'Learning phase active. Normal volatility. Wait.'",
        "First real optimization around Day 10",
        "Agents: Zenith, Stratos"
      ]},
      { kind: "section", num: "06", title: "When Things Go Wrong", id: "diagnostics" },
      { kind: "h3", text: "High CPM + Low CTR" },
      { kind: "p", lead: "Diagnosis: Creative problem.", body: "Ads aren't compelling enough to stop scrolling. Action: add 20+ diverse creatives. Completely different angles, not variations on the same theme." },
      { kind: "h3", text: "Good CTR + No Conversions" },
      { kind: "p", lead: "Diagnosis: Landing page problem.", body: "Ads work, page kills conversion. Slow load, confusing form, mismatched messaging, too many steps. Action: fix the landing page." },
      { kind: "h3", text: "Good Leads + No Shows" },
      { kind: "p", lead: "Diagnosis: Follow-up problem.", body: "Ads and page work, nurture sequence fails. Action: faster follow-up (text within 5 minutes), reminders, confirmations." },
      { kind: "h3", text: "Good Shows + No Close" },
      { kind: "p", lead: "Diagnosis: Sales problem.", body: "Everything upstream works. Not an ads problem. Action: document that leads are qualified, hand back to client. Sales training is on them." },
      { kind: "h3", text: "Sudden High CPMs" },
      { kind: "p", lead: "Diagnosis: Creative fatigue or algorithm reset.", body: "Action: add 20 new diverse creatives. If CPMs don't normalize in 72 hours, it's fatigue." },
      { kind: "quote", body: "When in doubt, add more diverse creatives. 90% of performance problems are creative issues, not targeting, budget, or placement." },
      { kind: "section", num: "07", title: "Why This Works Now", id: "andromeda" },
      { kind: "p", body: "In December 2024, Meta launched Andromeda, an AI system that fundamentally changed ad buying." },
      { kind: "table", headers: ["Metric", "Change"], rows: [
        ["Ad candidates available", "10,000x more"],
        ["ROAS with Advantage+", "+22%"],
        ["Processing speed", "100x faster"]
      ]},
      { kind: "h3", text: "Old Way (Dead)" },
      { kind: "list", items: [
        "5+ campaigns, complex structure",
        "Micro-segmented audiences",
        "3 to 6 creatives per ad set",
        "Manual interest/lookalike targeting",
        "Duplicate and relaunch"
      ]},
      { kind: "h3", text: "New Way (Andromeda)" },
      { kind: "list", items: [
        "1 to 2 campaigns max",
        "Broad or no targeting",
        "15 to 25+ diverse creatives per ad set",
        "Trust the algorithm",
        "Creative IS the targeting"
      ]},
      { kind: "section", num: "08", title: "How to Explain This to Prospects", id: "talk-track" },
      { kind: "quote", body: "We use AI-powered tools that let us test way more ad variations than a traditional agency. Most agencies test 5 to 10 ads. We test 50+. That means we find what works faster, lower your cost per lead faster, and scale faster. You get the quality of a big agency without the big agency overhead." },
      { kind: "takeaway", text: "Never say 'AI does everything.' Do say 'I use AI tools to do MORE for you, FASTER.' Clients want a human managing their money." },
      { kind: "section", num: "09", title: "Daily 15-Minute Routine (Per Client)", id: "daily-routine" },
      { kind: "list", items: [
        "5 min: check campaign data",
        "5 min: run Zenith + Stratos diagnosis",
        "5 min: execute recommended changes",
        "At 10 clients: 2.5 hours per day total"
      ]}
    ]
  },
  {
    id: "m3-8-ai-ad-copy-generator",
    category: "module-3",
    title: "AI Ad Copy Generator",
    lede: "Aurelius writes 12+ high-converting ad variations in under five minutes. The trick: one ad equals one reason to buy. Twelve angles, not twelve rewrites of the same headline.",
    readTimeMin: 20,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.8-ai-ad-copy-generator.html" },
    body: [
      { kind: "learnPanel", items: [
        "The one rule that changes ad copy forever",
        "Four copywriting frameworks and when to use each",
        "Six AI writing patterns to spot and kill",
        "How to build a swipe file that compounds"
      ]},
      { kind: "section", num: "01", title: "The One Rule That Changes Everything", id: "one-rule" },
      { kind: "quote", body: "ONE AD = ONE REASON TO BUY." },
      { kind: "p", body: "Each ad targets a different motivation. A distinct fear, desire, or angle. Not the same headline rewritten twelve times." },
      { kind: "h3", text: "Tony's Pizza, 12 Reasons to Order" },
      { kind: "list", items: [
        "Too Tired to Cook (pain)",
        "Family Friday (desire)",
        "Half the Price (logic)",
        "Real Italian (quality)",
        "20-Min Delivery (convenience)",
        "400+ 5-Star Reviews (social proof)",
        "New in the Area (discovery)",
        "Party Catering (occasion)",
        "Healthy Option (health)",
        "Easy Ordering (simplicity)",
        "Late Night (timing)",
        "Limited Special (urgency)"
      ]},
      { kind: "p", body: "12 angles equal 12 completely different ads. That's how you feed the algorithm." },
      { kind: "section", num: "02", title: "The 4 Ad Copy Frameworks", id: "frameworks" },
      { kind: "machineGrid", items: [
        { num: "01", title: "PAS", desc: "Problem-Agitate-Solution. Best for pain-aware audiences. 'It is 7pm. You just walked in the door. The kids are hungry.'" },
        { num: "02", title: "AIDA", desc: "Attention-Interest-Desire-Action. Best for offers and time-limited deals. 'The best pizza in Curitiba just dropped a new deal.'" },
        { num: "03", title: "BAB", desc: "Before-After-Bridge. Best for transformation stories: services, fitness, coaching. 'Before: It is Tuesday night. You are staring at the fridge.'" },
        { num: "04", title: "Story", desc: "Character-Conflict-Resolution. Best for emotional connection and UGC. 'My friend Maria works two jobs.'" }
      ]},
      { kind: "section", num: "03", title: "The Mega Prompt Builder", id: "mega-prompt" },
      { kind: "p", body: "Fill in client info, generate a ready-to-paste prompt for Claude. Fields: business name, what they sell, target customer, USP, current offer, tone (casual/professional/urgent/luxury/playful/local), platform (FB+IG / Google / TikTok). Output: 12 ads organized by framework, angle, length, word count." },
      { kind: "section", num: "04", title: "What the Output Looks Like", id: "example-output" },
      { kind: "h3", text: "Short Copy (Under 50 Words)" },
      { kind: "p", lead: "PAS pain angle (38 words):", body: "Staring at an empty fridge again? Skip the grocery run. Tony's hand-tossed pizza, delivered hot in 20 minutes. Real Italian dough. Real ingredients. $12.99. Tap below." },
      { kind: "p", lead: "BAB value angle (32 words):", body: "Before: $40 delivery pizza that arrives cold. After: $12.99 hand-tossed pizza at your door in 20 min, still steaming. Tony's Pizza. The upgrade your Tuesday needs." },
      { kind: "p", lead: "AIDA social proof (29 words):", body: "417 five-star reviews. Curitiba's favorite pizza since 2011. This week: 2 large + 4 drinks = $19.99. First-timers get free garlic bread. Order now." },
      { kind: "h3", text: "Medium Copy (50 to 100 Words)" },
      { kind: "p", body: "PAS Family Angle (78 words) opens 'Friday night. Kids are screaming. You promised pizza.' Walks through grocery, slow delivery, cold leftovers, presents Tony's as the solution." },
      { kind: "p", body: "Story UGC (85 words) is first-person: 'I was the guy who thought all delivery pizza was the same... Then my neighbor told me about Tony's... The pizza showed up in 18 minutes. Still bubbling.'" },
      { kind: "h3", text: "Long Copy (100+ Words)" },
      { kind: "p", body: "Story Origin (124 words) opens with Tony's 2011 founding story ('$3,000 and a recipe from his grandmother in Napoli'), details the bootstrapping (driving to São Paulo for cheese, mixing dough at 5am), closes with 15-year evolution and modern delivery." },
      { kind: "section", num: "05", title: "Spot the AI, Anti-Pattern Detector", id: "anti-patterns" },
      { kind: "h3", text: "1. The 'Not X, It's Y' Contrast" },
      { kind: "p", lead: "AI:", body: "This isn't just pizza, it's an experience. It's not delivery, it's a revolution in your kitchen." },
      { kind: "p", lead: "Human:", body: "Real Italian dough. 20-minute delivery. $12.99. Tony's Pizza, order now." },
      { kind: "h3", text: "2. The Triple Structure" },
      { kind: "p", lead: "AI:", body: "Fresh ingredients. Fast delivery. Unbeatable prices. That's the Tony's difference." },
      { kind: "p", lead: "Human:", body: "Our dough is made at 5am with imported Italian flour. Your pizza's at the door in 20 minutes. Oh and it's $12.99." },
      { kind: "h3", text: "3. The 'Imagine This' Opener" },
      { kind: "p", lead: "AI:", body: "Imagine biting into a slice of perfectly crispy, hand-tossed pizza..." },
      { kind: "p", lead: "Human:", body: "I took one bite and said out loud, 'this is $12.99?'" },
      { kind: "h3", text: "4. Filler Power Words" },
      { kind: "p", lead: "AI:", body: "Elevate your dinner experience with our game-changing pizza that transforms ordinary nights into extraordinary moments." },
      { kind: "p", lead: "Human:", body: "My kids stopped fighting for 10 whole minutes. All it took was a Tony's pepperoni pizza." },
      { kind: "h3", text: "5. The Question-Then-Answer" },
      { kind: "p", lead: "AI:", body: "Tired of cold delivery pizza? Looking for something better? Want real Italian quality without the restaurant price? Tony's Pizza has the answer." },
      { kind: "p", lead: "Human:", body: "I used to think $35 for delivery pizza was normal. Then I found Tony's. $12.99 and it's actually better." },
      { kind: "h3", text: "6. The Perfect Grammar Robot" },
      { kind: "p", lead: "AI:", body: "We are proud to offer Curitiba's finest artisanal pizza, crafted with imported ingredients and delivered to your doorstep within 20 minutes of your order." },
      { kind: "p", lead: "Human:", body: "We've been making pizza in Curitiba for 15 years. Imported Italian flour, San Marzano tomatoes, mozzarella that actually stretches. At your door in 20 min." },
      { kind: "quote", body: "Read every AI-generated ad out loud. If you'd cringe hearing a real person say it in conversation, rewrite it." },
      { kind: "section", num: "06", title: "Build Your Swipe File", id: "swipe-file" },
      { kind: "h3", text: "What Goes in Your Swipe File" },
      { kind: "list", items: [
        "Ad formats: screenshots of ads that stopped your scroll (single image, carousel, video, UGC, before/after, meme, testimonial)",
        "Hooks that worked: first lines that grabbed attention",
        "Competitor ads running 60+ days from Meta Ad Library",
        "Video styles: TikToks, Reels, YouTube ads that held attention past 3 seconds"
      ]},
      { kind: "h3", text: "Meta Ad Library Strategy" },
      { kind: "p", body: "Search competitor niches by location. Filter by longest-running ads. An ad running 5+ months is proven. Study angle, format, copy, not creative execution. Save to swipe file." },
      { kind: "h3", text: "Where to Collect" },
      { kind: "list", items: [
        "Instagram feed: screenshot every ad that stops your scroll into a 'Swipe File' phone album",
        "Meta Ad Library: search client niche weekly",
        "TikTok and YouTube: save video ads that hold attention past 3 seconds"
      ]},
      { kind: "quote", body: "Start today. Never stop. Six months from now, you'll have hundreds of ideas ready to go. This is your unfair advantage." },
      { kind: "section", num: "07", title: "The 60-Second Edit Process", id: "edit-process" },
      { kind: "list", items: [
        "Read aloud: would you say this to a friend?",
        "Check hook: does the first line stop scrolling?",
        "Kill AI words: 'elevate', 'transform', 'seamless', etc.",
        "Add specifics: '$12.99' beats 'affordable'",
        "Match voice: sound like the brand, not AI"
      ]},
      { kind: "p", body: "12 ads x 60 seconds = 12 minutes total. Traditional copywriters charge $50 to $100 per ad. This method is free in under 15 minutes." }
    ]
  },
  {
    id: "m3-9-ai-creative-builder",
    category: "module-3",
    title: "AI Creative Builder",
    lede: "If they can't get it in 2 seconds, they scroll. This lesson covers the six ad formats every client needs and the 45-minute creative build that produces 15 to 25 ready-to-upload ads.",
    readTimeMin: 20,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.9-ai-creative-builder.html" },
    body: [
      { kind: "learnPanel", items: [
        "The 2-second rule and what makes thumbs stop",
        "The six ad formats Vortex checks for",
        "Niche creative templates for restaurant, dental, gym, real estate, home services",
        "The 45-minute build that produces 15+ ads"
      ]},
      { kind: "section", num: "01", title: "Screens to Open", id: "tools" },
      { kind: "list", items: [
        "Canva (free plan available), main creative tool",
        "Claude, image descriptions, video scripts, creative concepts",
        "CapCut, free video editor for quick video and UGC",
        "Google AI Studio (Nano Banana 2), sketch-to-design and AI image generation"
      ]},
      { kind: "section", num: "02", title: "The 2-Second Rule", id: "two-second-rule" },
      { kind: "quote", body: "IF THEY CAN'T GET IT IN 2 SECONDS, THEY SCROLL." },
      { kind: "h3", text: "Scroll Stoppers" },
      { kind: "list", items: [
        "Human faces, especially eyes looking at camera",
        "Bold contrast (dark bg + bright text)",
        "One clear message, not 5 things",
        "Real photos beat stock photos",
        "Numbers in the image ('$12.99', '20 min')",
        "Before/after visuals",
        "Movement (video over static)"
      ]},
      { kind: "h3", text: "Scroll Past" },
      { kind: "list", items: [
        "Generic stock photos (handshake guy, pointing lady)",
        "Too much text crammed in",
        "Low contrast (grey on grey)",
        "No focal point",
        "Business logo taking up 30% of the ad",
        "Fancy fonts nobody can read",
        "Looking like an ad"
      ]},
      { kind: "section", num: "03", title: "The 6 Ad Formats You Need", id: "six-formats" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Single Image", desc: "One strong image + text overlay. Workhorse of Facebook ads. Quick to make, easy to test." },
        { num: "02", title: "Carousel", desc: "2 to 10 swipeable cards. Tells a story or shows multiple products. Higher engagement." },
        { num: "03", title: "Video (15-30s)", desc: "Outperforms static 9 out of 10 times. Hook in first 2 seconds. Show product. End with CTA." },
        { num: "04", title: "UGC-Style", desc: "Looks like a real person filmed it on their phone. Not polished, that's the point." },
        { num: "05", title: "Before/After", desc: "Split-screen or swipe comparison. Extremely powerful for services." },
        { num: "06", title: "Meme/Relatable", desc: "Humor + relatability equals shares + saves. Doesn't look like an ad." }
      ]},
      { kind: "p", body: "Every client needs at least 4 of these 6 formats. Not 15 single images. Not 10 videos. A MIX." },
      { kind: "section", num: "04", title: "Dimensions Cheat Sheet", id: "dimensions" },
      { kind: "table", headers: ["Dimension", "Aspect Ratio", "Use Case"], rows: [
        ["1080 x 1080", "Square (1:1)", "Feed posts (FB Feed, IG Feed)"],
        ["1080 x 1920", "Vertical (9:16)", "Stories and Reels"]
      ]},
      { kind: "p", body: "Every ad exported in both sizes. Always. No exceptions. Two sizes equals maximum reach." },
      { kind: "section", num: "05", title: "Your Tool Stack", id: "tool-stack" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Canva", desc: "Build the final ad. Templates, drag-and-drop, brand kits. 80% of creatives finish here. Free plan works, Pro is $13/mo." },
        { num: "02", title: "CapCut", desc: "Free video editor. Auto-captions, transitions, templates. Turn stock footage + text into scroll-stopping video. Free." },
        { num: "03", title: "Claude", desc: "Generate image descriptions, video scripts, carousel storylines, creative concepts. Feed it angles from 3.8." },
        { num: "04", title: "Nano Banana 2", desc: "Google's Gemini 3.1 Flash Image. Sketch on paper, photo it, get a professional design. Free via AI Studio." }
      ]},
      { kind: "section", num: "06", title: "Niche Creative Templates", id: "niche-templates" },
      { kind: "h3", text: "Restaurant / Food" },
      { kind: "list", items: [
        "Shoot: close-up food (cheese pull, steam), real kitchen, delivery moment, happy customers, the chef",
        "Style: warm colors, dark backgrounds, big price/deal text, food first not logo, natural lighting",
        "Top formats: food-being-made UGC video, menu carousel, single image with deal overlay, before/after empty table to full pizza spread"
      ]},
      { kind: "h3", text: "Dental" },
      { kind: "list", items: [
        "Shoot: before/after smiles (with permission), clean office, friendly staff, patient testimonials, dentist explaining plainly",
        "Style: clean whites and blues, warm not clinical, real people, big clear offer text",
        "Top formats: before/after smile carousel, patient video testimonial, '$99 new patient' single image, doctor explainer video"
      ]},
      { kind: "h3", text: "Gym / Fitness" },
      { kind: "list", items: [
        "Shoot: real members (not models), transformations, community moments, clean facility, trainer in action",
        "Style: bold high energy, dark backgrounds with bright accents, action shots, strong typography",
        "Top formats: transformation video with story, workout UGC, 'first week free' image, member testimonial carousel"
      ]},
      { kind: "h3", text: "Real Estate" },
      { kind: "list", items: [
        "Shoot: property walkthroughs, neighborhood highlights, just listed/sold graphics, agent on camera, drone shots",
        "Style: aspirational but attainable, bright clean photos, lifestyle not just house, price and location front and center",
        "Top formats: 15-30s walkthrough, 'just listed' room carousel, market update image, lead ad for 'homes under $X in [area]'"
      ]},
      { kind: "h3", text: "Home Services" },
      { kind: "list", items: [
        "Shoot: before/after transformations (#1 format), time-lapse work, satisfying pressure washing, homeowner reactions, truck/team arriving",
        "Style: raw beats polished, phone footage beats pro shoots, split-screen before/after, price + service area bold, real mess on the 'before'",
        "Top formats: before/after side-by-side, satisfying time-lapse, '$99 first clean' image, homeowner reaction UGC"
      ]},
      { kind: "section", num: "07", title: "The 45-Minute Creative Build", id: "build-process" },
      { kind: "list", items: [
        "Pull angles from 3.8 (5 min): open Aurelius output, 12 angles become 12 creative concepts",
        "Check swipe file (5 min): find formats matching niche, adapt don't reinvent",
        "Build 8 to 10 statics in Canva (20 min): templates, swap text, client photos or stock, export both sizes. Mix: 4 single, 2 carousel, 2 before/after",
        "Build 3 to 5 videos (15 min): Claude writes 15s scripts (hook, body, CTA), CapCut edit, captions and music",
        "Run through Vortex (5 min): diversity checker confirms format and angle variety"
      ]},
      { kind: "p", body: "Total ~45 minutes equals 15 to 25 ready-to-upload creatives. A design agency would charge $1,000 to $2,000 for this. Free with AI + Canva." },
      { kind: "section", num: "08", title: "Vortex Diversity Checker", id: "diversity-check" },
      { kind: "p", body: "Before launch, enter counts for each format (single images, carousels, videos, UGC, before/after, meme/relatable). Green means launch. Red means add more variety." },
      { kind: "takeaway", text: "Pass Vortex with 15+ creatives across 4+ formats. Anything less and Andromeda doesn't have enough material to find your buyer." }
    ]
  },
  {
    id: "m3-9b-ai-ad-creative-design",
    category: "module-3",
    title: "AI Ad Creative Design",
    lede: "Creative is the primary lever under Andromeda. Two tools, one workflow, ten minutes to a professional ad: Google Stitch designs, Canva polishes.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.9b-ai-ad-design.html" },
    body: [
      { kind: "learnPanel", items: [
        "The two-tool workflow: Stitch designs, Canva polishes",
        "Five ad angles that work for every local business",
        "Copy-paste Stitch prompts for the most common niches",
        "What NOT to do when generating AI creative"
      ]},
      { kind: "section", num: "01", title: "Why This Matters", id: "why" },
      { kind: "p", body: "Under Meta's Andromeda system, targeting has diminished and creative now does the work. For local businesses, visuals must look authentic, like neighborhood photography, not corporate imagery. AI tools get you there in about 60 seconds." },
      { kind: "section", num: "02", title: "Your Two Tools", id: "two-tools" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Google Stitch", desc: "Describe ads in plain language. Iterate with text or voice. Export as image. Free via Google Labs at stitch.withgoogle.com." },
        { num: "02", title: "Canva", desc: "Add client logos, adjust colors, polish final ad. Templates for every format. Drag-and-drop. Free tier works." }
      ]},
      { kind: "quote", body: "Stitch designs it, Canva polishes it. Two tools, one workflow, every client." },
      { kind: "section", num: "03", title: "The Workflow: 10-Minute Ad", id: "workflow" },
      { kind: "h3", text: "Step 1: Know What You're Making" },
      { kind: "list", items: [
        "What does the client do? (roofing, dental, HVAC, etc.)",
        "What's the offer? (free inspection, 20% off, free consultation)",
        "Who's seeing this? (homeowners 30-55 in Dallas)",
        "Grab the client's logo and brand color from their website (~30 seconds)"
      ]},
      { kind: "h3", text: "Step 2: Generate in Stitch" },
      { kind: "quote", body: "Design a Facebook ad image for a roofing company in Dallas. Show a clean, modern house with a new roof. Bright lighting, professional look. Include text that says 'Free Roof Inspection' in bold at the top. Use dark blue as the primary color. Add a 'Call Now' button at the bottom. 1080x1080 format." },
      { kind: "p", body: "Iterate with simple direction: 'Make the text bigger', 'Add a before-and-after split', 'Use warmer colors', 'Make it more professional'. Export when satisfied." },
      { kind: "h3", text: "Step 3: Polish in Canva (2 min)" },
      { kind: "list", items: [
        "Upload the Stitch export",
        "Insert the client's actual logo",
        "Refine any text",
        "Preview at phone size (95% of users view on mobile)",
        "Download as PNG"
      ]},
      { kind: "section", num: "04", title: "5 Ad Angles That Work Everywhere", id: "five-angles" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Direct Offer", desc: "Service result + offer prominent. 'Free Roof Inspection, Book Today.' Works for every niche." },
        { num: "02", title: "Before / After", desc: "Split-screen problem to solution. Roofing, dental, landscaping, cleaning, renovation, salon." },
        { num: "03", title: "Social Proof", desc: "Stars + review quote + image. '4,200+ Dallas Homeowners Trust Us.' Any business with reviews." },
        { num: "04", title: "Problem Call-Out", desc: "Image shows problem, copy presents solution. 'Your AC Bill Doesn't Have to Be This High.' HVAC, plumbing, auto, pest." },
        { num: "05", title: "Urgency / Seasonal", desc: "Time-limited + seasonal. 'Spring Special, 20% Off Before April 15.' Every niche, align with season." }
      ]},
      { kind: "p", body: "Pro tip: create one image for each of these 5 angles and let Meta figure out which wins. Don't guess, test." },
      { kind: "section", num: "05", title: "Copy-Paste Stitch Prompts by Niche", id: "niche-prompts" },
      { kind: "h3", text: "Roofing" },
      { kind: "quote", body: "Design a Facebook ad for a roofing company in [CITY]. Show a beautiful home with a brand new roof, bright natural lighting, suburban neighborhood. Text says 'Free Roof Inspection' in bold white letters. Dark blue brand color. Professional, clean, trustworthy feel. 1080x1080." },
      { kind: "h3", text: "Dental" },
      { kind: "quote", body: "Design a Facebook ad for a dental clinic in [CITY]. Show a bright, modern dental office with a patient smiling confidently. Text says 'When Was Your Last Cleaning?' in clean white font. Light teal brand color. Warm, welcoming, professional. 1080x1080." },
      { kind: "h3", text: "HVAC" },
      { kind: "quote", body: "Design a Facebook ad for an HVAC company in [CITY]. Show a comfortable family relaxing at home on a hot day, cool and happy. Text says '$49 AC Tune-Up, Stay Cool This Summer' in bold. Brand color: [COLOR]. Clean, modern layout. 1080x1080." },
      { kind: "h3", text: "Plumbing" },
      { kind: "quote", body: "Design a Facebook ad for a plumbing company in [CITY]. Show a clean, modern kitchen with no water damage. Text says 'Don't Wait for the Flood, Call Now' in bold. Brand color: [COLOR]. Professional and urgent. 1080x1080." },
      { kind: "h3", text: "Gym / Fitness" },
      { kind: "quote", body: "Design a Facebook ad for a local gym in [CITY]. Show an energetic group fitness class with diverse people working out, bright lighting, positive energy. Text says 'First Week Free, No Catch' in bold white. Brand color: [COLOR]. Motivating and welcoming. 1080x1080." },
      { kind: "h3", text: "Restaurant" },
      { kind: "quote", body: "Design a Facebook ad for a restaurant in [CITY]. Show a beautifully plated dish, close-up food photography, warm ambient lighting. Text says 'Tonight's Special Won't Last' in elegant white font. Brand color: [COLOR]. Premium and appetizing. 1080x1080." },
      { kind: "h3", text: "Salon / Barber" },
      { kind: "quote", body: "Design a Facebook ad for a hair salon in [CITY]. Show a stylish, modern salon interior with a client looking confident after a fresh cut. Text says 'Walk In Good. Walk Out Great.' in bold. Brand color: [COLOR]. Trendy and inviting. 1080x1080." },
      { kind: "h3", text: "Landscaping" },
      { kind: "quote", body: "Design a Facebook ad for a landscaping company in [CITY]. Show a beautiful, manicured front yard with green grass and flowers. Before-and-after split layout. Text says 'Your Yard Could Look Like This' in bold. Brand color: [COLOR]. 1080x1080." },
      { kind: "section", num: "06", title: "Quick Reference by Niche", id: "quick-ref" },
      { kind: "table", headers: ["Niche", "Visual", "Hook"], rows: [
        ["Roofing", "New roof, aerial shot, before/after", "Your neighbors already called us"],
        ["Dental", "Bright smile, clean office, team", "When was your last cleaning?"],
        ["HVAC", "Comfortable family, thermostat, seasonal", "Your AC bill doesn't have to be this high"],
        ["Plumbing", "Clean kitchen, no damage, emergency", "Don't wait for the flood"],
        ["Gym", "Group class, energy, transformation", "First week free, no catch"],
        ["Restaurant", "Food close-up, warm lighting", "Tonight's special won't last"],
        ["Salon", "Fresh cut, modern interior", "Walk in good. Walk out great."],
        ["Landscaping", "Before/after yard, green grass", "Your yard could look like this"],
        ["Auto Repair", "Clean shop, diagnostic, under hood", "Check engine light? We'll check it free."],
        ["Real Estate", "Property tour, aerial, staging", "Just listed in [neighborhood]"]
      ]},
      { kind: "section", num: "07", title: "What NOT to Do", id: "dont" },
      { kind: "list", items: [
        "Don't use stock photos that look fake",
        "Don't put more than 5 to 8 words of text on the image, rest goes in ad description",
        "Don't skip the client's brand: grab logo and color from their website first",
        "Don't forget mobile preview: 95% of users on phones",
        "Don't use before/after health claims without 'Results may vary' disclaimer (dental, weight loss, skincare trigger Meta's filters)"
      ]},
      { kind: "section", num: "08", title: "Homework", id: "homework" },
      { kind: "list", items: [
        "Pick a local business (real client or practice niche)",
        "Grab their logo and brand color from their website",
        "Create 3 ad images in Google Stitch using 3 different angles",
        "Polish each in Canva (logo, mobile preview)",
        "Download all 3 as PNG and upload to your test campaign"
      ]}
    ]
  },
  {
    id: "m3-10-targeting-andromeda-era",
    category: "module-3",
    title: "Targeting in the Andromeda Era",
    lede: "This lesson is short on purpose. Andromeda changed everything about targeting. The old way is dead. Stop spending hours building complex audiences.",
    readTimeMin: 10,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.10-ai-audience-finder.html" },
    body: [
      { kind: "learnPanel", items: [
        "Why interest targeting is obsolete under Andromeda",
        "The only targeting that still matters for local: location",
        "The one exception worth setting up, retargeting",
        "How to research audiences for copy, not for targeting"
      ]},
      { kind: "section", num: "01", title: "The Old Way Is Dead", id: "old-way-dead" },
      { kind: "p", body: "Before December 2024, media buyers spent hours on audience construction. Meta's Andromeda launch made about 90% of those tactics obsolete." },
      { kind: "h3", text: "Old Way (Pre-Andromeda)" },
      { kind: "list", items: [
        "5+ interest groups per ad set",
        "Lookalike audiences at 1%, 3%, 5%",
        "Behavior + interest stacking",
        "Exclusion of existing customers",
        "Separate ad sets per audience segment",
        "Hours of audience research per client",
        "Minimal performance impact"
      ]},
      { kind: "h3", text: "New Way (Andromeda)" },
      { kind: "list", items: [
        "Broad targeting (no interests)",
        "Location radius only for local",
        "Age range if relevant (25 to 65 acceptable)",
        "Algorithm finds buyers through creative diversity",
        "5 minutes per client setup",
        "Better performance"
      ]},
      { kind: "section", num: "02", title: "Why Broad Targeting Wins", id: "why-broad" },
      { kind: "heroStats", stats: [
        { value: "10,000x", label: "More ad candidates Andromeda evaluates per auction" },
        { value: "3.1B", label: "Daily active users Meta can search through" },
        { value: "+22%", label: "ROAS improvement with Advantage+ broad targeting" }
      ]},
      { kind: "quote", body: "Your creatives ARE the targeting. A pizza ad showing a family dinner targets families. The same pizza ad about late-night munchies targets college students." },
      { kind: "section", num: "03", title: "The Only Targeting That Matters: Location", id: "location-targeting" },
      { kind: "list", items: [
        "Drop pin or enter address. 'People living in or recently in this location.'",
        "Set radius based on business type (see below)",
        "Age range optional (only when applicable, e.g. bars need 21+)",
        "No interests, behaviors, or lookalikes. 15 to 25 diverse creatives do the targeting."
      ]},
      { kind: "table", headers: ["Business Type", "Radius", "Rationale"], rows: [
        ["Restaurant/Café", "5 to 10 miles", "Consumers won't travel far for food"],
        ["Dentist/Doctor", "10 to 15 miles", "Healthcare justifies longer travel"],
        ["Gym/Studio", "5 to 8 miles", "Proximity to commute or home essential"],
        ["Real Estate", "15 to 25 miles", "Buyers search metro areas broadly"],
        ["Home Services", "10 to 20 miles", "Depends on travel time"],
        ["E-commerce/Online", "Entire country", "No physical location"],
        ["Coaching/Services", "Entire country", "Virtual delivery enables nationwide reach"]
      ]},
      { kind: "section", num: "04", title: "The One Exception: Retargeting", id: "retargeting" },
      { kind: "h3", text: "Worth Setting Up" },
      { kind: "list", items: [
        "Website visitors (last 30 to 90 days)",
        "Video viewers (watched 50%+)",
        "Customer email lists",
        "Instagram/Facebook engagers (last 30 days)",
        "Lead form openers who didn't submit"
      ]},
      { kind: "h3", text: "Don't Bother" },
      { kind: "list", items: [
        "Interest-based audiences",
        "Lookalike audiences",
        "Behavior stacking",
        "Detailed targeting expansion",
        "Saved audiences from 2023"
      ]},
      { kind: "p", body: "Day 1 is broad + location. Retargeting layers in after Week 2+ as traffic accumulates." },
      { kind: "section", num: "05", title: "Research the Audience, Don't Target Them", id: "research" },
      { kind: "p", body: "Research informs creative messaging, not Ads Manager settings. Nexus reveals audience motivations, objections, and language preferences." },
      { kind: "h3", text: "Nexus Audience Research Prompt" },
      { kind: "list", items: [
        "Inputs: business name, product/service, location, price range",
        "Outputs: top 10 reasons to buy (emotional, not features)",
        "Top 5 purchase objections",
        "Top 5 trigger moments",
        "Audience language/slang",
        "Competitive alternatives",
        "Relevant daily routine details"
      ]},
      { kind: "p", body: "Research becomes ad angles. Each 'reason to buy' is an angle for Aurelius. Each 'objection' is a BAB or PAS ad." },
      { kind: "section", num: "06", title: "Quick Decision Framework", id: "decision-framework" },
      { kind: "h3", text: "Local Business" },
      { kind: "list", items: [
        "Location: business address + radius",
        "Age: only if necessary",
        "Interests: NONE",
        "Retargeting: add after Week 2+",
        "Strategy: 15 to 25 diverse creatives handle targeting"
      ]},
      { kind: "h3", text: "Online Business" },
      { kind: "list", items: [
        "Location: entire country",
        "Age: only if necessary",
        "Interests: NONE",
        "Retargeting: add after Week 2+",
        "Strategy: Advantage+ Shopping or broad CBO"
      ]}
    ]
  },
  {
    id: "m3-11-campaign-optimization",
    category: "module-3",
    title: "Campaign Optimization",
    lede: "Once campaigns are live, your job shifts from building to maintaining. A 15-minute daily routine driven by data, not intuition.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.11-ai-campaign-optimizer.html" },
    body: [
      { kind: "learnPanel", items: [
        "The four-phase daily routine: Scan, Decide, Execute, Log",
        "The four metrics that actually matter",
        "The four decision rules: Kill, Watch, Scale, Refresh",
        "The five optimization killers to avoid"
      ]},
      { kind: "section", num: "01", title: "The 15-Minute Daily Routine", id: "daily-routine" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Scan (0:00 to 3:00)", desc: "Review yesterday's metrics. Observe without adjusting." },
        { num: "02", title: "Decide (3:00 to 7:00)", desc: "Evaluate each ad against rules. Label: KILL, WATCH, SCALE, or REFRESH." },
        { num: "03", title: "Execute (7:00 to 12:00)", desc: "Implement only the decided changes. Increase winning budgets by 20%." },
        { num: "04", title: "Log (12:00 to 15:00)", desc: "Document changes with dates and reasoning for reports." }
      ]},
      { kind: "quote", body: "The most common beginner error is over-optimizing and causing harm. Learning phases need ~50 conversions weekly to stabilize. Frequent changes reset progress." },
      { kind: "section", num: "02", title: "The 4 Metrics That Matter", id: "four-metrics" },
      { kind: "table", headers: ["Metric", "Full Name", "Purpose"], rows: [
        ["CPL", "Cost Per Lead", "Primary performance indicator"],
        ["CTR", "Click-Through Rate", "Creative quality measure"],
        ["CPM", "Cost Per 1,000 Impressions", "Delivery efficiency"],
        ["FREQ", "Frequency", "Audience fatigue indicator"]
      ]},
      { kind: "h3", text: "Example: Tony's Pizza Day 7 Check" },
      { kind: "table", headers: ["Ad", "Spend", "CPL", "CTR", "CPM", "Freq", "Decision"], rows: [
        ["Family Dinner - Video", "$42", "$7", "3.2%", "$8", "1.4", "SCALE"],
        ["Late Night Deal - Static", "$38", "$9.50", "1.8%", "$11", "1.8", "SCALE"],
        ["Lunch Special - Carousel", "$35", "$17.50", "1.1%", "$14", "2.1", "WATCH"],
        ["Party Catering - Video", "$45", "$45", "0.4%", "$22", "1.6", "KILL"],
        ["Grand Opening - Static", "$52", "$10.40", "1.6%", "$9", "3.2", "REFRESH"]
      ]},
      { kind: "p", body: "Target CPL $10. Family Dinner at $7 warrants scale. Party Catering at $45 (4.5x target) is an immediate kill. Grand Opening is efficient but frequency 3.2 demands refresh." },
      { kind: "section", num: "03", title: "The 4 Decision Rules", id: "decision-rules" },
      { kind: "machineGrid", items: [
        { num: "01", title: "KILL", desc: "CPA at 3x+ target. Drains resources with no improvement expected. Wait for 2 to 3x target CPA in spend before judging. Target $10, kill at $30+." },
        { num: "02", title: "WATCH", desc: "CPA 1.5x to 3x target. Give 2 to 3 more days. Kill if unchanged, scale if improving. Target $10, watch at $15 to $30." },
        { num: "03", title: "SCALE", desc: "CPA at or below target. Increase budget 20 to 30%. Gradual prevents learning phase reset. Target $10, scale at target or below." },
        { num: "04", title: "REFRESH", desc: "Frequency 3.0+. Repeated exposure tanks performance. Add 3 to 5 new creatives, keep existing. Algorithm redistributes." }
      ]},
      { kind: "takeaway", text: "Print these rules and put them somewhere visible. When tempted to make a gut-based change, consult the rules. The algorithm beats intuition." },
      { kind: "section", num: "04", title: "Your Daily Tracking Sheet", id: "tracking-sheet" },
      { kind: "table", headers: ["Column", "Content"], rows: [
        ["Date", "Entry timestamp"],
        ["Spend + Leads", "Auto-calculated CPL"],
        ["CTR + CPM + Freq", "Health indicators"],
        ["Decision", "KILL/WATCH/SCALE/REFRESH label"],
        ["Notes", "Changes implemented"]
      ]},
      { kind: "section", num: "05", title: "The 5 Optimization Killers", id: "killers" },
      { kind: "list", items: [
        "Changing things during learning phase (resets ~50 weekly conversion progress)",
        "Doubling budget overnight (from $15 to $30 confuses the algorithm; scale $15 to $18 to $22 to $27)",
        "Panic-killing after 24 hours (need 2 to 3x target CPA in spend before killing)",
        "Editing the winning ad (performance dies on revision; test variations as separate ads)",
        "Optimizing based on feelings ('only the data decides what stays and what goes')"
      ]},
      { kind: "section", num: "06", title: "The Scaling Ladder", id: "scaling-ladder" },
      { kind: "p", body: "Winners (CPA at or below target for 3+ days) scale incrementally:" },
      { kind: "p", body: "$15 (start) to $18 (+20%) to $22 (+22%) to $27 (+23%) to $33 (+22%) to $40 (+21%). Allow 2 to 3 days between increments. Revert immediately if CPA spikes." },
      { kind: "section", num: "07", title: "The Weekly Client Report", id: "weekly-report" },
      { kind: "quote", body: "Hey [Client]! Here's your weekly ads update:\n\nTHIS WEEK'S NUMBERS\nTotal Spend: $___\nTotal Leads: ___\nCost Per Lead: $___\nBest Performing Ad: [name], $[CPL]\n\nWHAT'S WORKING\n[Top ad and reasoning]\n[Trends]\n\nWHAT WE CHANGED\nPaused [X] underperforming ads\nIncreased budget on [Y]\nAdded [Z] new creatives\n\nNEXT WEEK'S PLAN\n[Upcoming actions]\n\nQuestions? Let me know!" },
      { kind: "takeaway", text: "Clients care about lead volume and cost-per-lead. Not CTR or CPM. Clarity keeps clients paying." }
    ]
  },
  {
    id: "m3-12-niche-templates",
    category: "module-3",
    title: "Niche Templates",
    lede: "Copy-paste campaign blueprints for the five most common local niches. Budgets, radius, ad angles, sample copy, launch checklist, campaign live in under an hour.",
    readTimeMin: 15,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.12-niche-templates.html" },
    body: [
      { kind: "learnPanel", items: [
        "How templates work as starting points, not finished products",
        "Five copy-paste templates: restaurant, real estate, home services, med spa, gym",
        "The ad angles that win in each niche",
        "A quick reference table for budget, radius, target CPL"
      ]},
      { kind: "section", num: "01", title: "How Templates Work", id: "how-templates-work" },
      { kind: "funnel", tiers: [
        { num: "01", label: "Pick Template", desc: "Match the client's industry to one of the five blueprints." },
        { num: "02", label: "Customize", desc: "Name, location, offer specifics." },
        { num: "03", label: "Create Ads", desc: "Use the provided angles and formats." },
        { num: "04", label: "Launch", desc: "Under 1 hour from template to live." }
      ]},
      { kind: "quote", body: "Templates are starting points, not copy-paste. Customize by location, copy, creatives, and business specifics." },
      { kind: "section", num: "02", title: "Restaurant / Café / Bar", id: "restaurant" },
      { kind: "list", items: [
        "Daily budget: $15 to $30",
        "Radius: 5 to 10 miles",
        "Target CPL: $3 to $8",
        "Objective: Traffic / Leads"
      ]},
      { kind: "h3", text: "6 Ad Angles" },
      { kind: "list", items: [
        "The Hero Shot: close-up of best-selling dish (cheese pull, steam)",
        "The Deal: time-limited offer with specific pricing",
        "The Review: 5-star Google review screenshot + food image",
        "Behind the Kitchen: 30s unedited chef video",
        "The 'Did You Know': location-awareness, proximity",
        "Event/Season: game day, holidays, late-night"
      ]},
      { kind: "quote", body: "2 Large Pizzas. $24.99. This Week Only. Hand-tossed dough. Fresh mozzarella. 30+ toppings. Tony's Pizza, [Address]. Open until midnight. Order online or walk in. Tap 'Get Directions'", attribution: "The Deal example" },
      { kind: "p", body: "Format: single image (food close-up) or carousel (3 dishes). CTA: Get Directions. What wins: prep videos beat photos, close-ups beat wide shots, time-limited beats generic, 'Get Directions' beats 'Learn More', tight radius prevents waste." },
      { kind: "section", num: "03", title: "Real Estate", id: "real-estate" },
      { kind: "list", items: [
        "Daily budget: $20 to $50",
        "Radius: 15 to 25 miles",
        "Target CPL: $10 to $25",
        "Objective: Leads"
      ]},
      { kind: "h3", text: "6 Ad Angles" },
      { kind: "list", items: [
        "Just Listed: property photos + price + beds/baths + scarcity",
        "Home Valuation: free valuation lead magnet for sellers",
        "Market Update: agent as expert via data",
        "Video Walkthrough: 60s tour (phone footage okay)",
        "First-Time Buyer: affordability and price points",
        "Sold Testimonial: client proof + sale speed/premium"
      ]},
      { kind: "quote", body: "How Much Is Your Home Worth Right Now? The [City] market moved fast in 2025. Some homeowners are sitting on $50-100K+ in equity and don't even know it. Get your free home valuation, takes 30 seconds. No obligation. No pressure. Just data.", attribution: "Home Valuation example" },
      { kind: "p", body: "Format: lead form (name, email, address, timeframe). Image: aerial or property. CTA: Get Quote / Sign Up. What wins: lead forms beat landing pages, home valuation is the strongest magnet, carousels beat single images, video walkthroughs get 3x engagement, including price is critical." },
      { kind: "section", num: "04", title: "Home Services", id: "home-services" },
      { kind: "list", items: [
        "Daily budget: $20 to $40",
        "Radius: 10 to 20 miles",
        "Target CPL: $15 to $35",
        "Objective: Leads",
        "Categories: plumbing, HVAC, cleaning, landscaping, roofing, painting"
      ]},
      { kind: "h3", text: "6 Ad Angles" },
      { kind: "list", items: [
        "Before / After: side-by-side transformation (most powerful)",
        "Seasonal Urgency: weather/season-tied offers",
        "The Review Stack: aggregated Google reviews",
        "The Problem: cost uncertainty, fear of expensive repairs",
        "The Crew: professional team photos at job sites",
        "Free Estimate: licensing + transparency"
      ]},
      { kind: "quote", body: "This driveway hadn't been pressure washed in 8 years. 2 hours later, looks brand new. We serve [City] and surrounding areas. Licensed and insured. Free estimates. Same-week scheduling. Tap below for a free quote.", attribution: "Before/After example" },
      { kind: "p", body: "Format: carousel (before, after, after, team). CTA: Get Quote. Lead form: name, phone, service, address. What wins: before/after carousels beat everything, phone number field (expect a call), seasonal angles 2x CTR, 'licensed and insured' is the primary trust factor." },
      { kind: "section", num: "05", title: "Med Spa / Beauty", id: "med-spa" },
      { kind: "list", items: [
        "Daily budget: $25 to $50",
        "Radius: 10 to 15 miles",
        "Target CPL: $15 to $40",
        "Objective: Leads",
        "Services: Botox, fillers, facials, laser, body sculpting, lash"
      ]},
      { kind: "h3", text: "6 Ad Angles" },
      { kind: "list", items: [
        "Transformation: before/after with permission",
        "First-Time Offer: low-barrier intro pricing",
        "The Process Video: 15 to 30s treatment (ASMR-like)",
        "The Myth Buster: addresses fears and misconceptions",
        "Social Proof: 15s client testimonial videos",
        "Event/Season: wedding prep, summer glow, New Year"
      ]},
      { kind: "quote", body: "Your First HydraFacial, Just $49 (Usually $120). Deep cleanse. Exfoliation. Hydration. 30 minutes. Zero downtime. Walk out glowing. [Spa Name], [City]'s top-rated med spa. 4.9 stars, 300+ 5-star reviews. Limited spots this week. Book now.", attribution: "First-Time Offer example" },
      { kind: "p", body: "Format: treatment video or carousel (before/after/clinic). CTA: Book Now. Lead form: name, phone, service. What wins: process videos engage hardest, before/after converts best, first-time offers drive initial bookings, clean modern clinic imagery essential, age 25 to 55 typically sufficient." },
      { kind: "section", num: "06", title: "Gym / Fitness Studio", id: "gym" },
      { kind: "list", items: [
        "Daily budget: $15 to $35",
        "Radius: 5 to 8 miles",
        "Target CPL: $8 to $20",
        "Objective: Leads",
        "Types: CrossFit, yoga, boxing, personal training, group fitness"
      ]},
      { kind: "h3", text: "6 Ad Angles" },
      { kind: "list", items: [
        "Free Trial Class: zero-barrier entry",
        "Transformation Story: real member before/after",
        "Community Vibe: class-in-action video",
        "The 'No Gym' Person: alternative positioning",
        "New Year / Season: time-sensitive enrollment",
        "Coach Intro: 30s personal intro from head coach"
      ]},
      { kind: "quote", body: "Your First Class Is Free. Seriously. No contract. No pressure. No judgment. Just show up, work hard for 45 minutes, and see if it's for you. [Gym Name], [Address]. Classes at 6am, 12pm, and 6pm daily. Book your free class.", attribution: "Free Trial example" },
      { kind: "p", body: "Format: class energy video or carousel (facility/class/members). CTA: Sign Up / Book Now. Lead form: name, phone, preferred class time. What wins: class energy beats equipment shots, free trial gets highest conversions, tight 5 to 8 mile radius essential, real members beat stock, community beats features." },
      { kind: "section", num: "07", title: "Quick Reference Table", id: "reference-table" },
      { kind: "table", headers: ["Niche", "Budget/Day", "Radius", "Target CPL", "#1 Format", "#1 Angle", "Best CTA"], rows: [
        ["Restaurant", "$15-30", "5-10 mi", "$3-8", "Food video", "Hero shot / Deal", "Get Directions"],
        ["Real Estate", "$20-50", "15-25 mi", "$10-25", "Lead Form", "Home Valuation", "Get Quote"],
        ["Home Services", "$20-40", "10-20 mi", "$15-35", "Before/After", "Transformation", "Get Quote"],
        ["Med Spa", "$25-50", "10-15 mi", "$15-40", "Process video", "First-time offer", "Book Now"],
        ["Gym", "$15-35", "5-8 mi", "$8-20", "Class video", "Free trial", "Sign Up"]
      ]}
    ]
  },
  {
    id: "m3-13-client-communication",
    category: "module-3",
    title: "Client Communication and Retention",
    lede: "Clients churn from silence, not from bad performance. Set the communication rhythm on day one and you keep them paying for 12+ months.",
    readTimeMin: 10,
    updated: "2026-05-14",
    source: { label: "AI Advertiser Course", url: "https://ai-advertiser-course.vercel.app/classes/3.13-client-communication.html" },
    body: [
      { kind: "learnPanel", items: [
        "The weekly + monthly communication rhythm",
        "Scripts for the three tough conversations every agency owner faces",
        "Five retention rules that compound over time",
        "Why retention, not acquisition, is your income"
      ]},
      { kind: "section", num: "01", title: "The Communication Rhythm", id: "rhythm" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Weekly Update", desc: "Every Monday. 5 to 8 sentences via text or email. Use the report template from 3.11. Same day, same time, no exceptions." },
        { num: "02", title: "Monthly Call", desc: "30 minutes once monthly. 10 min review numbers, 10 min what's working, 10 min next month plan. Always close with 'any questions?'" },
        { num: "03", title: "As Needed", desc: "Share wins immediately. Report problems before clients discover them. Proactive beats reactive." }
      ]},
      { kind: "section", num: "02", title: "The 3 Tough Conversations", id: "tough-conversations" },
      { kind: "h3", text: "'Where are my results?' (Week 2-3)" },
      { kind: "quote", body: "Totally understand the impatience, I want results too. Here's what's happening: Meta's algorithm needs about 50 conversions to learn who your ideal customer is. We're at [X] right now. The data is actually looking good, our cost per lead is [$X] and our best performing ad is [name]. We're in the testing phase, which is exactly where we should be at week 2. By week 3-4, the algorithm will have enough data to really optimize. I'll keep you updated every Monday." },
      { kind: "p", body: "Approach: validate emotions, present data, explain learning phase, give timeline, reaffirm communication commitment." },
      { kind: "h3", text: "'The leads aren't good quality' (Month 2+)" },
      { kind: "quote", body: "Let's look at this together. How fast are you following up when a lead comes in? [Usually they say hours or next day.] That's the issue, leads go cold in minutes, not hours. The data shows our ads are generating leads at $[X] per lead, which is solid. I'd recommend calling within 5 minutes of the notification. Also, are you asking for their budget/timeline on the form? We can add qualifying questions to filter out tire-kickers." },
      { kind: "p", body: "Approach: avoid defensiveness, inquire about follow-up speed, refocus on lead velocity, suggest form optimization." },
      { kind: "h3", text: "'I want to cancel' (Any time)" },
      { kind: "quote", body: "I hear you. Before we do anything, can I ask, what specifically isn't working for you? [Listen. Don't interrupt.] I appreciate you telling me that. Here's what I'd like to do: give me 2 more weeks. I'll [specific action: new creatives, new angles, adjust budget]. If you don't see improvement by [date], I completely understand and we'll part ways. Fair?" },
      { kind: "p", body: "Approach: stay calm, listen fully, acknowledge concerns, propose a concrete plan with deadline, empower their decision." },
      { kind: "section", num: "03", title: "The 5 Rules That Keep Clients", id: "five-rules" },
      { kind: "machineGrid", items: [
        { num: "01", title: "Communicate before they ask", desc: "Weekly updates preempt questions. If they're asking, you're already failing." },
        { num: "02", title: "Set expectations day 1", desc: "Week 1-2 is testing. Week 3-4 the algorithm optimizes. Month 2+ we scale. Clear timelines prevent panic." },
        { num: "03", title: "Own bad news", desc: "Address problems first. 'CPL spiked this week. Here's why, here's the fix.' Transparency wins." },
        { num: "04", title: "Always have a plan", desc: "Never admit uncertainty. Frame challenges with action: 'We're testing 5 new angles and adding a qualifying question.'" },
        { num: "05", title: "Celebrate wins loud", desc: "Share high-performing days with proof. '$5 per lead today. Your best day yet.' Builds trust and commitment." }
      ]},
      { kind: "section", num: "04", title: "Why Retention = Your Income", id: "retention-math" },
      { kind: "heroStats", stats: [
        { value: "$1,500", label: "Client churns month 1 (plus a negative review)" },
        { value: "$18,000", label: "Client stays 12 months (plus referrals)" }
      ]},
      { kind: "takeaway", text: "The difference is communication quality, not ad performance consistency. Clients churn from silence, not from a bad CPL week." },
      { kind: "section", num: "05", title: "Module 3 Complete", id: "module-complete" },
      { kind: "list", items: [
        "Client onboarding pipeline",
        "Advertising mechanics",
        "Business Manager and ad account setup",
        "Pixel and tracking",
        "Campaign structure and budgets",
        "AI Arbitrage System (5 agents)",
        "Ad copy and Aurelius",
        "Creative building and Vortex",
        "Targeting in the Andromeda era",
        "Campaign optimization and daily routine",
        "Niche templates",
        "Client communication and retention"
      ]},
      { kind: "p", body: "You can now establish profitable ads for local businesses within 7 days and maintain those clients for 12+ months." }
    ]
  }
];
