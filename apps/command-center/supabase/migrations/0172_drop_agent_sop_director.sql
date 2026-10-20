-- 0172: the agency Director is retired (Jake, 2026-10-20: "no need to keep the
-- agency wide director page"; docs/build-plans/client-fulfillment-and-director.md).
--
-- Agents now take their SOP from their map on the SOPs tab (src/lib/sopPrompt.ts),
-- so nothing reads these tables. Exported before the drop: no Off boxes, no
-- added tasks, no draft steps existed, so nothing Jake wrote is lost.
-- Tasks first, they reference stages.

drop table if exists public.agent_sop_tasks;
drop table if exists public.agent_sop_stages;
