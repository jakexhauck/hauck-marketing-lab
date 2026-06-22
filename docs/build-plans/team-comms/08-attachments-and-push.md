# Phase 08 - Attachments and Push (final)

**Read `00-INDEX.md` first.** Address Jake as **"Sir"**. **No em dashes.**

## Goal
Finish the comms panel: let people attach files (images + PDFs) to chat messages,
render them inline (images) or as download chips (everything else), and push an OS
notification when a new message lands and the recipient is not looking. Attachments
flow through the private `chat-attachments` Storage bucket via signed URLs minted by
Functions; nothing in the browser ever holds the service-role key. Push reuses the
existing Web Push infrastructure (`functions/lib/push.ts`, VAPID keys, the
`push_subscriptions` table), now targeted per individual participant using the
`participant_kind` / `participant_id` columns added in migration 0016.

This phase extends the send endpoint from Phase 03 and the admin send endpoint from
Phase 07, so both of those must be in place first.

## Files
- Create: `command-center/app/functions/api/chat/attachments/index.ts`
- Create: `command-center/app/functions/api/chat/attachments/[attachmentId].ts`
- Create: `command-center/app/functions/lib/chatPush.ts`
- Modify: `command-center/app/functions/api/push/subscribe.ts`
- Modify: `command-center/app/functions/api/chat/channels/[channelId]/messages.ts`
- Modify: `command-center/app/functions/api/admin/messages/[channelId]/send.ts`
- Modify: `command-center/app/src/lib/api.ts` (add attachment upload types)
- Modify: `command-center/app/src/hooks/useChat.ts` (add `useUploadAttachment` + `useAttachmentUrl`)
- Modify: `command-center/app/src/components/comms/Composer.tsx`
- Modify: `command-center/app/src/components/comms/Conversation.tsx`

## Work

### 1. POST /api/chat/attachments (upload-first)

Create `functions/api/chat/attachments/index.ts`. The browser cannot talk to Storage
with the service-role key, so the flow is: client asks this endpoint to register an
attachment, the endpoint validates, inserts a `chat_attachments` row with
`message_id` null, mints a signed upload URL, and returns it. The client PUTs the
bytes straight to that URL, then sends the message with the attachment id (Phase 03
links the row to the message).

Re-validate the type and size server-side. Do **not** import from `src/`; reimplement
the exact rule from `src/lib/chatLogic.validateAttachment` (same allowed mime set,
same 25MB ceiling). Keep these values identical to `chatLogic.ts`.

```ts
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import { resolveParticipant } from "../../../lib/participants";

// Mirror src/lib/chatLogic.ts exactly. Server cannot import from src/, so the
// allowed set and ceiling are duplicated here. Keep them in lockstep.
const ATTACH_MAX_BYTES = 25 * 1024 * 1024;
const ATTACH_ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

interface RegisterBody {
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const { participant, needsIndividualAccount } = await resolveParticipant(
    client,
    {
      isOwner: Boolean(ctx.data.isOwner),
      staff: ctx.data.staff ?? null,
      admin: ctx.data.admin ?? null,
      tenantSlug: ctx.data.tenant.slug,
    },
  );
  if (!participant) {
    return Response.json(
      { error: needsIndividualAccount ? "needs_individual_account" : "no_identity" },
      { status: 403 },
    );
  }

  let body: RegisterBody = {};
  try {
    body = (await ctx.request.json()) as RegisterBody;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const fileName = (body.fileName ?? "").trim();
  const mimeType = (body.mimeType ?? "").trim();
  const sizeBytes = Number(body.sizeBytes);
  if (!fileName || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return Response.json({ error: "invalid_attachment" }, { status: 400 });
  }
  if (!ATTACH_ALLOWED.has(mimeType)) {
    return Response.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (sizeBytes > ATTACH_MAX_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  // Admins (Jake) have no tenant; the row needs a tenant id, so admins resolve
  // it from the session slug they are acting under.
  const tenantId =
    participant.tenantId ?? (await resolveTenantId(client, ctx.data.tenant.slug));
  if (!tenantId) {
    return Response.json({ error: "tenant_not_found" }, { status: 500 });
  }

  const attachmentId = crypto.randomUUID();
  const storagePath = `${tenantId}/${attachmentId}/${fileName}`;

  const { error: insertErr } = await client.from("chat_attachments").insert({
    id: attachmentId,
    message_id: null,
    tenant_id: tenantId,
    uploader_kind: participant.kind,
    uploader_id: participant.id,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    storage_path: storagePath,
  });
  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  const { data: signed, error: signErr } = await client.storage
    .from("chat-attachments")
    .createSignedUploadUrl(storagePath);
  if (signErr || !signed) {
    // Roll back the orphan row so a failed upload does not leave dangling metadata.
    await client.from("chat_attachments").delete().eq("id", attachmentId);
    return Response.json(
      { error: signErr?.message ?? "sign_failed" },
      { status: 500 },
    );
  }

  return Response.json({
    attachmentId,
    uploadUrl: signed.signedUrl,
    path: signed.path,
    token: signed.token,
  });
};
```

### 2. GET /api/chat/attachments/[attachmentId] (signed download)

Create `functions/api/chat/attachments/[attachmentId].ts`. Mint a short-lived (300s)
signed download URL, but only for someone allowed to see the attachment. If the row
is linked to a message, the caller must be a member of that message's channel. If it
is still unlinked (`message_id` null, mid-upload), only the uploader may read it.

```ts
import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import { resolveParticipant, isChannelMember } from "../../../lib/participants";

interface AttachmentRow {
  id: string;
  message_id: string | null;
  uploader_kind: string;
  uploader_id: string;
  storage_path: string;
}

export const onRequestGet: PagesFunction<Env, "attachmentId", ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });
  if (!participant) {
    return Response.json({ error: "no_identity" }, { status: 403 });
  }

  const attachmentId = ctx.params.attachmentId as string;
  const { data: att } = await client
    .from("chat_attachments")
    .select("id, message_id, uploader_kind, uploader_id, storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  const row = att as AttachmentRow | null;
  if (!row) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let allowed = false;
  if (row.message_id) {
    const { data: msg } = await client
      .from("chat_messages")
      .select("channel_id")
      .eq("id", row.message_id)
      .maybeSingle();
    const channelId = (msg as { channel_id?: string } | null)?.channel_id;
    allowed = channelId
      ? await isChannelMember(client, channelId, participant)
      : false;
  } else {
    // Unlinked upload: only the uploader can read it back.
    allowed =
      row.uploader_kind === participant.kind &&
      row.uploader_id === participant.id;
  }
  if (!allowed) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: signed, error } = await client.storage
    .from("chat-attachments")
    .createSignedUrl(row.storage_path, 300);
  if (error || !signed) {
    return Response.json(
      { error: error?.message ?? "sign_failed" },
      { status: 500 },
    );
  }

  return Response.json({ url: signed.signedUrl });
};
```

### 3. `functions/lib/chatPush.ts` (per-participant fan-out)

Create `functions/lib/chatPush.ts`. This mirrors the send loop in
`functions/lib/push.ts` exactly (same `buildPushPayload` import, same `vapid` shape,
same dead-subscription pruning on 404/410), but selects subscriptions by
`(participant_kind, participant_id)` instead of tenant + GHL identity.

```ts
import {
  buildPushPayload,
  type PushSubscription,
} from "@block65/webcrypto-web-push";
import { getServiceClient } from "./supabase";
import type { Env } from "./env";

// One push_subscriptions row, keyed to an individual chat participant via the
// participant_kind / participant_id columns added in migration 0016.
interface ChatSubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ChatPushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Send a Web Push to every subscription belonging to the given chat recipients.
 * Recipients are individual participants ({ kind, id }), not a whole tenant.
 * Fully inert when VAPID keys are unset or Supabase is unconfigured. Mirrors the
 * fan-out in push.ts: reconstruct the PushSubscription from split columns, build
 * the payload, POST to the endpoint, prune dead subscriptions on 404 / 410.
 * Never throws into the caller; the message send must succeed even if push fails.
 */
export async function sendChatPush(
  env: Env,
  recipients: { kind: string; id: string }[],
  payload: ChatPushPayload,
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  if (recipients.length === 0) return;

  const client = getServiceClient(env);
  if (!client) return;

  // Load every subscription whose (participant_kind, participant_id) is in the
  // recipient set. Supabase has no tuple-IN, so query per (kind, id) and merge.
  const rowsByEndpoint = new Map<string, ChatSubRow>();
  await Promise.all(
    recipients.map(async (r) => {
      const { data } = await client
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("participant_kind", r.kind)
        .eq("participant_id", r.id);
      for (const row of (data as ChatSubRow[] | null) ?? []) {
        rowsByEndpoint.set(row.endpoint, row);
      }
    }),
  );
  const rows = [...rowsByEndpoint.values()];
  if (rows.length === 0) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });

  const vapid = {
    subject: "mailto:jake@hauckmarketing.com",
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  await Promise.all(
    rows.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        const built = await buildPushPayload(
          { data, options: { ttl: 60 } },
          subscription,
          vapid,
        );
        const res = await fetch(row.endpoint, built);
        if (res.status === 404 || res.status === 410) {
          await client.from("push_subscriptions").delete().eq("id", row.id);
        }
      } catch (err) {
        console.error("[chatPush] send failed for", row.id, err);
      }
    }),
  );
}

// Short notification body from a message. Strips newlines, caps the length so a
// long message does not blow out the OS notification.
export function chatPreview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "Sent an attachment";
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}
```

### 4. Tag push subscriptions with the participant (`subscribe.ts`)

Modify `functions/api/push/subscribe.ts`. It already resolves the device's GHL
identity and upserts onto `(tenant_id, endpoint)`. Resolve the chat participant the
same way the chat endpoints do and store `participant_kind` / `participant_id`
alongside `ghl_user_id`, so chat push can target this person.

Add the import near the existing imports:
```ts
import { resolveParticipant } from "../../lib/participants";
```

Then, right before the existing upsert (after `ghlUserId` is computed), resolve the
participant and include the two new columns in the upsert object:
```ts
  // Tag this subscription with the individual chat participant so chat pushes
  // (Phase 08) can target this person, not just the whole tenant. Best-effort:
  // a session with no individual identity (legacy shared owner) leaves them null
  // and simply receives no chat pushes.
  const { participant } = await resolveParticipant(client, {
    isOwner: Boolean(ctx.data.isOwner),
    staff: ctx.data.staff ?? null,
    admin: ctx.data.admin ?? null,
    tenantSlug: ctx.data.tenant.slug,
  });

  const { error } = await client.from("push_subscriptions").upsert(
    {
      tenant_id: tenantId,
      endpoint,
      p256dh,
      auth,
      ghl_user_id: ghlUserId,
      participant_kind: participant?.kind ?? null,
      participant_id: participant?.id ?? null,
    },
    { onConflict: "tenant_id,endpoint" },
  );
```
Replace the existing `const { error } = await client.from("push_subscriptions").upsert(...)`
block with the version above; leave the rest of the handler untouched.

### 5. Fire chat push from the client send endpoint (`messages.ts`)

Modify `functions/api/chat/channels/[channelId]/messages.ts` (the `onRequestPost`
send handler from Phase 03). After the existing
`ctx.waitUntil(notifyParticipants(...))`, also push to every other member.

Phase 03 already computes the channel's other members (the recipient list passed to
`notifyParticipants`) and knows the sender's display name. Reuse those exact values;
do not recompute. Add the import:
```ts
import { sendChatPush, chatPreview } from "../../../../lib/chatPush";
```
Then, immediately after the `notifyParticipants` waitUntil:
```ts
  // OS push to the same recipients. Best-effort: a push failure must never fail
  // the send, hence waitUntil + sendChatPush's internal try/catch.
  ctx.waitUntil(
    sendChatPush(ctx.env, otherMembers, {
      title: senderName,
      body: chatPreview(body),
      url: "/comms",
    }),
  );
```
`otherMembers` is the `{ kind, id }[]` recipient list already built for
`notifyParticipants`; `senderName` is the resolved participant's `name`; `body` is the
sent message text. If Phase 03 named these differently, use its names verbatim, do not
introduce new variables.

### 6. Fire chat push from the admin send endpoint (`send.ts`)

Modify `functions/api/admin/messages/[channelId]/send.ts` (Phase 07). When Jake (an
admin) replies on a Hauck line, push the client member on that channel. Add the same
import:
```ts
import { sendChatPush, chatPreview } from "../../../../lib/chatPush";
```
After the admin send writes the message and notifies the channel (Phase 07 already
loads the channel's non-admin members for `notifyParticipants`), add:
```ts
  ctx.waitUntil(
    sendChatPush(ctx.env, clientMembers, {
      title: "Hauck Marketing",
      body: chatPreview(body),
      url: "/comms",
    }),
  );
```
`clientMembers` is the Phase 07 recipient list (the staff member(s) on the Hauck
channel, excluding the admin). Use Phase 07's actual variable name. The reverse
direction (a client sends on the Hauck line, admins get pushed) is already covered by
step 5: the Hauck channel's admin members are in that channel's `otherMembers`, so the
client send endpoint pushes Jake automatically. No separate hauck-flow code is needed
beyond confirming admins are members of the hauck channel (they are, per Phase 07).

### Commit group A (backend)
```bash
git add command-center/app/functions/api/chat/attachments/index.ts \
  command-center/app/functions/api/chat/attachments/[attachmentId].ts \
  command-center/app/functions/lib/chatPush.ts \
  command-center/app/functions/api/push/subscribe.ts \
  command-center/app/functions/api/chat/channels/[channelId]/messages.ts \
  command-center/app/functions/api/admin/messages/[channelId]/send.ts
git commit -m "feat(comms): attachment upload/download endpoints + chat push fan-out"
```

### 7. Client types + hooks (`api.ts`, `useChat.ts`)

`src/lib/api.ts` already declares `ChatAttachment` and `ChatMessageDTO` (00-INDEX).
Add the upload response type used by the composer:
```ts
export interface AttachmentUpload {
  attachmentId: string;
  uploadUrl: string;
  path: string;
  token: string;
}
```

In `src/hooks/useChat.ts`, add an upload mutation and a signed-url query. Reuse the
project's `api<T>()` wrapper for the register call, and the browser Supabase client
from `src/lib/chatClient.ts` only is **not** used here: the signed upload URL is a
plain PUT, so use `fetch` directly for the byte upload (the URL is pre-signed, no auth
header needed). The download URL is fetched through `api<T>()` (cookie-authed).

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type AttachmentUpload, type ChatAttachment } from "../lib/api";
import { validateAttachment } from "../lib/chatLogic";

// Register an attachment, then PUT the bytes to the pre-signed Storage URL.
// Returns the attachmentId to attach to the outgoing message. Validates client
// side first (same rule the server re-checks) so we fail fast before the round trip.
export function useUploadAttachment() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const check = validateAttachment(file.type, file.size);
      if (!check.ok) {
        throw new Error(
          check.reason === "too_large"
            ? "File is over the 25MB limit"
            : "That file type is not supported",
        );
      }
      const reg = await api<AttachmentUpload>("/api/chat/attachments", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      // Supabase signed upload URL accepts a direct PUT of the raw bytes.
      const put = await fetch(reg.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });
      if (!put.ok) {
        throw new Error(`Upload failed (${put.status})`);
      }
      return reg.attachmentId;
    },
  });
}

// Resolve a signed download URL for one attachment. Cached just under the 5min
// server lifetime so the <img> / link does not expire mid-view; refetched after.
export function useAttachmentUrl(attachmentId: string | null) {
  return useQuery({
    queryKey: ["chat", "attachment", attachmentId],
    enabled: Boolean(attachmentId),
    staleTime: 4 * 60 * 1000,
    queryFn: () =>
      api<{ url: string }>(`/api/chat/attachments/${attachmentId}`),
  });
}

export type { ChatAttachment };
```
Keep the existing `useSendMessage` mutation from Phase 04. Phase 03 already accepts
`attachmentIds` on the send body, and the typed client (Phase 04) already forwards
them, so no change to `useSendMessage` is needed here.

### 8. Composer wiring (`Composer.tsx`)

Modify `src/components/comms/Composer.tsx` (Phase 05). Activate the attachment
button: a hidden `<input type="file">` triggered by the existing paperclip button.
On pick, upload each file via `useUploadAttachment`, show a pending thumbnail while it
uploads, collect the resolved attachment ids, and pass them to the existing
`useSendMessage` call as `attachmentIds`.

```tsx
import { useRef, useState } from "react";
import { useUploadAttachment } from "../../hooks/useChat";
import { validateAttachment } from "../../lib/chatLogic";

// One file the user picked, tracked through its upload lifecycle so we can show a
// thumbnail and block send until every upload settles.
interface PendingAttachment {
  localId: string;
  file: File;
  previewUrl: string | null; // object URL for images, null for PDFs
  status: "uploading" | "done" | "error";
  attachmentId: string | null;
  error: string | null;
}

// ...inside the Composer component, alongside the existing body state:
const fileInputRef = useRef<HTMLInputElement>(null);
const [pending, setPending] = useState<PendingAttachment[]>([]);
const uploadAttachment = useUploadAttachment();

const onPickFiles = (files: FileList | null) => {
  if (!files) return;
  for (const file of Array.from(files)) {
    const check = validateAttachment(file.type, file.size);
    const localId = crypto.randomUUID();
    if (!check.ok) {
      setPending((p) => [
        ...p,
        {
          localId,
          file,
          previewUrl: null,
          status: "error",
          attachmentId: null,
          error:
            check.reason === "too_large"
              ? "Over 25MB"
              : "Unsupported type",
        },
      ]);
      continue;
    }
    const previewUrl = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : null;
    setPending((p) => [
      ...p,
      {
        localId,
        file,
        previewUrl,
        status: "uploading",
        attachmentId: null,
        error: null,
      },
    ]);
    uploadAttachment.mutate(file, {
      onSuccess: (attachmentId) =>
        setPending((p) =>
          p.map((a) =>
            a.localId === localId
              ? { ...a, status: "done", attachmentId }
              : a,
          ),
        ),
      onError: (err) =>
        setPending((p) =>
          p.map((a) =>
            a.localId === localId
              ? { ...a, status: "error", error: (err as Error).message }
              : a,
          ),
        ),
    });
  }
};

const removePending = (localId: string) =>
  setPending((p) => {
    const target = p.find((a) => a.localId === localId);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    return p.filter((a) => a.localId !== localId);
  });

const uploadsBusy = pending.some((a) => a.status === "uploading");
const attachmentIds = pending
  .filter((a) => a.status === "done" && a.attachmentId)
  .map((a) => a.attachmentId as string);

// The existing send handler now forwards attachmentIds and clears the tray.
const onSend = () => {
  if (uploadsBusy) return;
  if (!body.trim() && attachmentIds.length === 0) return;
  sendMessage.mutate(
    { body: body.trim(), attachmentIds },
    {
      onSuccess: () => {
        setBody("");
        for (const a of pending) {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
        setPending([]);
      },
    },
  );
};
```
Markup additions (slot these into the existing composer layout, above the textarea
row for the tray, and wire the existing paperclip button's `onClick` to open the
input):
```tsx
<input
  ref={fileInputRef}
  type="file"
  multiple
  accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
  className="hidden"
  onChange={(e) => {
    onPickFiles(e.target.files);
    e.target.value = "";
  }}
/>

{/* paperclip: replace the disabled stub from Phase 05 with this */}
<button
  type="button"
  onClick={() => fileInputRef.current?.click()}
  className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
  aria-label="Attach a file"
>
  <Paperclip className="h-5 w-5" />
</button>

{pending.length > 0 && (
  <div className="flex flex-wrap gap-2 px-3 pb-2">
    {pending.map((a) => (
      <div
        key={a.localId}
        className="relative flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 pr-7 text-xs"
      >
        {a.previewUrl ? (
          <img
            src={a.previewUrl}
            alt={a.file.name}
            className={`h-12 w-12 rounded object-cover ${
              a.status === "uploading" ? "opacity-50" : ""
            }`}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-[var(--surface-2)]">
            <FileText className="h-5 w-5 text-[var(--text-muted)]" />
          </div>
        )}
        <div className="max-w-[7rem]">
          <div className="truncate font-medium text-[var(--text)]">
            {a.file.name}
          </div>
          <div className="text-[var(--text-muted)]">
            {a.status === "uploading" && "Uploading..."}
            {a.status === "done" && "Ready"}
            {a.status === "error" && (
              <span className="text-red-500">{a.error}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => removePending(a.localId)}
          className="absolute right-1 top-1 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
          aria-label="Remove attachment"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ))}
  </div>
)}
```
Import `Paperclip`, `FileText`, `X` from `lucide-react` (add to the existing import).
Disable the send button when `uploadsBusy` is true. Keep all other Phase 05 composer
behaviour (Enter to send, etc.) intact.

### 9. Conversation rendering (`Conversation.tsx`)

Modify `src/components/comms/Conversation.tsx` (Phase 05). For each
`message.attachments`, render images inline via a small component that fetches the
signed URL through `useAttachmentUrl`; render non-images as a download chip linking to
the signed URL.

Add this inside `Conversation.tsx` (or a sibling file imported by it):
```tsx
import { FileText, Download } from "lucide-react";
import { useAttachmentUrl } from "../../hooks/useChat";
import type { ChatAttachment } from "../../lib/api";

function AttachmentView({ attachment }: { attachment: ChatAttachment }) {
  const isImage = attachment.mimeType.startsWith("image/");
  const { data, isLoading } = useAttachmentUrl(attachment.id);
  const url = data?.url ?? null;

  if (isImage) {
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block max-w-xs overflow-hidden rounded-lg border border-[var(--border)]"
      >
        {url ? (
          <img
            src={url}
            alt={attachment.fileName}
            className="max-h-72 w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center bg-[var(--surface-2)] text-xs text-[var(--text-muted)]">
            {isLoading ? "Loading image..." : "Image unavailable"}
          </div>
        )}
      </a>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
    >
      <FileText className="h-4 w-4 text-[var(--text-muted)]" />
      <span className="max-w-[12rem] truncate">{attachment.fileName}</span>
      <Download className="h-4 w-4 text-[var(--text-muted)]" />
    </a>
  );
}
```
In the message render loop, after the message body, add:
```tsx
{message.attachments.length > 0 && (
  <div className="flex flex-col gap-1">
    {message.attachments.map((att) => (
      <AttachmentView key={att.id} attachment={att} />
    ))}
  </div>
)}
```
This works identically on both sides of a DM and on the Hauck line, because the
signed-url endpoint enforces membership; the sender and recipient both render their
own signed URLs.

### Commit group B (client)
```bash
git add command-center/app/src/lib/api.ts \
  command-center/app/src/hooks/useChat.ts \
  command-center/app/src/components/comms/Composer.tsx \
  command-center/app/src/components/comms/Conversation.tsx
git commit -m "feat(comms): attachment upload in composer + inline previews and downloads"
```

## Visual verification
Run the real app, do not claim "should work":

1. `cd command-center/app && npm run dev`. Sign in as a staff member with a DM open.
2. In the composer, click the paperclip, pick a PNG. Confirm a pending thumbnail
   appears with "Uploading..." then "Ready". Send.
3. Confirm the image renders inline in the conversation for the sender.
4. In a second browser (or profile) signed in as the other DM member, confirm the
   same image renders inline there too (signed-url path, membership enforced).
5. Attach a PDF, send, confirm it renders as a download chip; click it and confirm the
   file opens via the signed URL.
6. Try an oversized or `.exe` file: confirm the composer rejects it client-side and the
   `POST /api/chat/attachments` endpoint would reject it server-side (415 / 413).
7. Push: install the PWA, grant notifications, then background the app (lock screen or
   switch apps). From the other account, send a message. Confirm an OS notification
   appears with the sender name as the title and a body preview; tapping it opens
   `/comms`.
8. Admin side: as Jake in `/admin/messages`, reply on a Hauck line; confirm the client
   member receives an OS push. Then have the client reply; confirm Jake receives one.
9. Take Playwright screenshots of: an inline image in a DM, a PDF download chip, and
   the pending-thumbnail state mid-upload (M9 visual proof).

## Definition of done
- `POST /api/chat/attachments` validates type + size server-side, inserts a
  `chat_attachments` row, and returns a working signed upload URL.
- `GET /api/chat/attachments/[attachmentId]` returns a 300s signed URL only to a
  channel member (linked) or the uploader (unlinked); 403 otherwise.
- Composer uploads files, shows pending thumbnails, and sends `attachmentIds`.
- Images render inline both sides of a DM and on the Hauck line; non-images render as
  download chips. Signed URLs refresh before the 5min expiry.
- `push_subscriptions` rows carry `participant_kind` / `participant_id` after a fresh
  subscribe.
- A new message pushes an OS notification to every other channel member (client send,
  admin send, and client-to-admin on the Hauck line), and a push failure never fails
  the message send.
- Both commit groups landed.

## MANUAL ACTIONS - JAKE
1. Confirm the `chat-attachments` Storage bucket exists and is **private** (created in
   Phase 01; if the migration's `storage.buckets` insert was rejected, create it
   manually as private). Public access must be off; all reads go through signed URLs.
2. No new push secret is needed: VAPID keys (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`)
   are already set from the willis-launch plan 06. Confirm they are present in the
   Cloudflare Pages env so chat push can sign payloads.
