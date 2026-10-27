// What plays in the app as it is. Anything else (a .mov, a HEIC, a TIFF) is
// converted first: by the browser on Client > Grok Bot > Add Creatives, and on
// the server (the Software connector's software_add_creatives) only a HEIC, as
// Drive's own JPEG preview, because a Worker has no video encoder.
//
// No imports: the page and the Worker both read this one list.

export const PLAYABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
export const HEIC = /^image\/hei[cf]/i;
