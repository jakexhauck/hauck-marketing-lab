# Developer Integration Guide

Technical guide for integrating Traffic Command into your dashboard/software.

---

## Parsing Agent Files

Each agent file (`.md`) follows this structure:

```markdown
---
name: agent-name
description: When to use this agent
model: sonnet | opus | haiku
skills: skill1, skill2, skill3
allowed-tools: Tool1, Tool2
---

# Agent Title

## Identity
[Agent persona and role]

## Core Responsibilities
[What the agent does]

## Workflows
[Step-by-step processes]

## Decision Frameworks
[Logic for decisions]
```

### Extracting YAML Frontmatter

```javascript
const matter = require('gray-matter');

function parseAgent(markdownContent) {
  const { data, content } = matter(markdownContent);
  return {
    name: data.name,
    description: data.description,
    model: data.model,
    skills: data.skills?.split(', ') || [],
    allowedTools: data['allowed-tools']?.split(', ') || [],
    systemPrompt: content
  };
}
```

---

## Skill File Structure

Each skill in `skills/[category]/[skill-name]/SKILL.md`:

```markdown
---
name: skill-name
description: What this skill does
agent: which-agent-owns-this
triggers: keyword1, keyword2
---

# Skill Title

## When to Use
[Trigger conditions]

## Input Required
[What data is needed]

## Process
[Step-by-step execution]

## Output Format
[Expected response structure]
```

---

## Knowledge Chunk Structure

Each chunk in `knowledge/MKT-TFC-XXX.md`:

```markdown
---
id: TFC-0505
title: Chunk Title
tags: tag1, tag2, tag3
source: Source Name
related: TFC-0506, TFC-0507
---

# Title

## TL;DR
[Brief summary]

## Content
[Main content]

## Key Points
- Point 1
- Point 2
```

---

## Suggested Database Schema

### Agents Table
```sql
CREATE TABLE agents (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100),
  description TEXT,
  model VARCHAR(20),
  system_prompt TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Skills Table
```sql
CREATE TABLE skills (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100),
  category VARCHAR(50),
  agent_id VARCHAR(50) REFERENCES agents(id),
  description TEXT,
  triggers TEXT[],
  input_schema JSONB,
  output_schema JSONB,
  skill_content TEXT
);
```

### Knowledge Chunks Table
```sql
CREATE TABLE knowledge_chunks (
  id VARCHAR(20) PRIMARY KEY,
  title VARCHAR(200),
  tags TEXT[],
  source VARCHAR(100),
  related TEXT[],
  tldr TEXT,
  content TEXT,
  key_points TEXT[],
  embedding VECTOR(1536)  -- For semantic search
);
```

### Frameworks Table
```sql
CREATE TABLE frameworks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),
  expert VARCHAR(100),
  weight DECIMAL(3,2),
  category VARCHAR(50),
  description TEXT,
  content TEXT
);
```

---

## API Endpoints Suggestion

### Campaign Diagnosis
```
POST /api/diagnose
{
  "campaign_id": "abc123",
  "metrics": {
    "spend": 2500,
    "cpm": 45,
    "ctr": 0.6,
    "cvr": 2.1,
    "cpa": 75,
    "roas": 1.2
  }
}

Response:
{
  "diagnosis": {
    "bottleneck": "creative",
    "root_cause": "Low creative diversity",
    "confidence": 0.92
  },
  "recommendations": [...],
  "agent_used": "zenith"
}
```

### Generate Hooks
```
POST /api/hooks
{
  "product": "Example Product",
  "target_audience": "Agency owners",
  "pain_points": ["Can't scale", "Rising ad costs"],
  "count": 20
}

Response:
{
  "hooks": [
    {"category": "urgency", "hook": "Only 47 spots left..."},
    {"category": "social_proof", "hook": "2,847 agency owners already..."},
    ...
  ],
  "agent_used": "vortex"
}
```

### Scale Readiness Check
```
POST /api/scale-check
{
  "campaign_id": "abc123",
  "metrics": {...},
  "creative_count": 18,
  "tracking_status": "capi_active"
}

Response:
{
  "verdict": "SCALE_20_PERCENT",
  "pillars": {
    "metrics": "green",
    "creative": "green",
    "tracking": "green",
    "infrastructure": "yellow"
  },
  "blockers": ["Sales team capacity"],
  "agent_used": "stratos"
}
```

---

## LLM Integration

### Using with OpenAI/Anthropic API

```javascript
async function callAgent(agentName, userMessage, context) {
  const agent = await loadAgent(agentName);

  const response = await anthropic.messages.create({
    model: agent.model === 'opus' ? 'claude-3-opus' : 'claude-3-sonnet',
    max_tokens: 4096,
    system: agent.systemPrompt,
    messages: [
      { role: 'user', content: formatContext(context) + userMessage }
    ]
  });

  return response.content[0].text;
}
```

### Agent Routing Logic

```javascript
function routeToAgent(userQuery, metrics) {
  // Keywords trigger specific agents
  const routing = {
    zenith: ['cpm', 'ctr', 'cpa', 'roas', 'kill', 'scale', 'budget', 'diagnosis'],
    vortex: ['hook', 'creative', 'copy', 'brief', 'angle', 'ad', 'fatigue'],
    nexus: ['pixel', 'capi', 'tracking', 'event', 'emq', 'attribution'],
    stratos: ['funnel', 'economics', 'strategy', 'scaling', 'readiness']
  };

  const queryLower = userQuery.toLowerCase();

  for (const [agent, keywords] of Object.entries(routing)) {
    if (keywords.some(kw => queryLower.includes(kw))) {
      return agent;
    }
  }

  return 'aurelius'; // Default to lead agent
}
```

---

## Benchmarks Data

The `skills/data/benchmarks-brasil.yaml` contains:

```yaml
funnels:
  challenge:
    cpm: { min: 25, max: 45, ideal: 35 }
    ctr: { min: 1.2, max: 2.5, ideal: 1.8 }
    landing_cvr: { min: 25, max: 40, ideal: 32 }
    cpa: { min: 15, max: 35, ideal: 25 }

  webinar:
    cpm: { min: 20, max: 35, ideal: 28 }
    # ...

  high_ticket:
    cpm: { min: 35, max: 60, ideal: 45 }
    # ...
```

Use for:
- Metric comparison (actual vs benchmark)
- Severity scoring
- Alert thresholds

---

## UI Component Suggestions

### 1. Agent Selector Dropdown
```jsx
<AgentSelector
  agents={['aurelius', 'zenith', 'vortex', 'nexus', 'stratos']}
  onSelect={setActiveAgent}
  showDescription={true}
/>
```

### 2. Diagnosis Card
```jsx
<DiagnosisCard
  bottleneck={diagnosis.bottleneck}
  rootCause={diagnosis.root_cause}
  severity={diagnosis.severity}
  recommendations={diagnosis.recommendations}
/>
```

### 3. Kill/Scale Indicator
```jsx
<KillScaleIndicator
  status="scale" // kill | hold | scale
  percentage={20}
  conditions={['ROAS > 2x for 7 days', 'CTR stable']}
/>
```

### 4. Hook Generator Panel
```jsx
<HookGenerator
  categories={['urgency', 'social_proof', 'curiosity', ...]}
  onGenerate={handleGenerate}
  outputCount={20}
/>
```

### 5. 4-Pillar Scale Readiness
```jsx
<ScaleReadiness
  metrics={{ status: 'green', score: 92 }}
  creative={{ status: 'green', score: 88 }}
  tracking={{ status: 'yellow', score: 75 }}
  infrastructure={{ status: 'green', score: 90 }}
  verdict="SCALE_20_PERCENT"
/>
```

---

## File Import Script

```bash
#!/bin/bash
# import-traffic-command.sh

# Import agents
for agent in agents/*.md; do
  curl -X POST "$API_URL/agents" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$(cat $agent | jq -Rs .)\"}"
done

# Import skills
find skills -name "SKILL.md" | while read skill; do
  curl -X POST "$API_URL/skills" \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$skill\", \"content\": \"$(cat $skill | jq -Rs .)\"}"
done

# Import knowledge
for chunk in knowledge/MKT-*.md; do
  curl -X POST "$API_URL/knowledge" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$(cat $chunk | jq -Rs .)\"}"
done
```

---

## Testing Checklist

- [ ] All 5 agents parse correctly
- [ ] YAML frontmatter extracts properly
- [ ] 18 skills load with correct categories
- [ ] Knowledge chunks index correctly
- [ ] Benchmarks YAML parses to JSON
- [ ] Agent routing works for all keywords
- [ ] LLM calls return valid responses
- [ ] Diagnosis flow completes end-to-end
- [ ] Hook generation produces 20 variations
- [ ] Scale readiness shows 4 pillars

---

## Questions?

Contact the development team for integration support.
