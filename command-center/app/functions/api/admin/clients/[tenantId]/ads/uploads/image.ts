import type { Env, ApiData } from "../../../../../../lib/env";
import { resolveUploadTarget } from "../../../../../../lib/creativeUploadTarget";
import { uploadAdImage } from "../../../../../../lib/metaUpload";
import { parseLabelledName } from "../../../../../../lib/creativeNames";

// POST /api/admin/clients/:tenantId/ads/uploads/image
//   multipart: file, name ("spring-promo 1:1.jpg") -> { hash }
//
// One image straight through to the client's ad account. Images are small
// enough to pass through the Worker whole; videos go in pieces (video.ts).
//
// Admin-only via _middleware.ts.

// Meta's own ceiling for an ad image.
const MAX_BYTES = 30 * 1024 * 1024;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const target = await resolveUploadTarget(ctx.env, ctx.params.tenantId as string);
  if (target instanceof Response) return target;

  let form: FormData;
  try {
    form = await ctx.request.formData();
  } catch {
    return Response.json({ error: "expected multipart form data" }, { status: 400 });
  }
  const entry = form.get("file") as unknown;
  if (!entry || typeof entry === "string") {
    return Response.json({ error: "missing file" }, { status: 400 });
  }
  const file = entry as File;
  if (!(file.type || "").startsWith("image/")) {
    return Response.json({ error: "That needs to be an image." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That image is over 30 MB." }, { status: 413 });
  }
  // The label is the whole point of this route: refuse a name that would land
  // in the library unfiled.
  const name = String(form.get("name") ?? "").trim();
  if (!parseLabelledName(name)) {
    return Response.json({ error: "name must end in 1:1 or 4:5" }, { status: 400 });
  }

  try {
    const { hash } = await uploadAdImage(target.token, target.account, file, name);
    return Response.json({ hash });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
};
