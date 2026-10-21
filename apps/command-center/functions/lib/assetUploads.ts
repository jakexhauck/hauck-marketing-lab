// Where an uploaded image lands in the `followup-assets` bucket (0095), for
// POST /api/admin/followups/upload: the Lead Form editor's pictures and other
// admin uploads. Moved out of conversionAssets.ts when conversion assets went
// (2026-10-20; docs/build-plans/four-agents-and-handoffs.md).
//
// Not part of any data model: the url that comes back is what gets stored.
// This exists so somebody opening the Supabase console can tell what they are
// looking at, and so an arbitrary string from a form cannot become a folder
// name. Anything else becomes "extra".
export const UPLOAD_FOLDERS = ["logo", "kit", "owner", "before", "after"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];
