### Task 4: Read endpoints, pipelines and board

**Files:**
- Create: `functions/api/admin/setter/pipelines.ts`
- Create: `functions/api/admin/setter/leads.ts`

**Interfaces:**
- Consumes: `getGhlContextForTenant` (Task 1), `fetchAllOpportunities` and `ghlJson` from `functions/lib/ghl.ts`
- Produces: `GET /api/admin/setter/pipelines?tenantId=` → `{ pipelines: [{ id, name, stages: [{ id, name, color, needsDialing }] }] }`
- Produces: `GET /api/admin/setter/leads?tenantId=&pipelineId=` → `{ leads: ApiSetterLead[], truncated: boolean }`

`ApiSetterLead = { id, contactId, name, phone, city, stageName, createdAt, attempts, firstDialedAt, contacted, lastOutcome }`

Note what is absent: **no `tags` field.** The list endpoint cannot supply it without an N+1 per card (`ghl.ts:108-110`). Tags come from the detail endpoint in Task 5.

- [ ] **Step 1: Implement pipelines.ts**

Fetch `/opportunities/pipelines?locationId=`, sort stages by `position`, and set `needsDialing: /needs dialing/i.test(stage.name)`. Return all 8, unfiltered: unlike the client `PipelinesContext`, the setter view hides nothing.

- [ ] **Step 2: Implement leads.ts**

Call `fetchAllOpportunities(gctx, { pipelineId })`. Set `truncated: true` when the page cap is hit so the UI can say so rather than silently lie. Then in one query fetch every `setter_dials` row for that tenant and those contact ids, run `rollUpByContact`, and merge.

- [ ] **Step 3: Verify against the live test account**

Run the dev server and curl both endpoints with a real admin session and the test account tenant id. Expected: 8 pipelines, and stage names matching section 1.2 of this document character for character, emoji included.

- [ ] **Step 4: Commit**

```bash
git add command-center/app/functions/api/admin/setter/
git commit -m "feat(setter): read endpoints for pipelines and board leads"
```

---

