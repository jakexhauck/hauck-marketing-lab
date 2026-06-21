import { Link, useParams } from "react-router-dom";
import { findSop } from "../../lib/sopData";
import { HsopStyle } from "./AdminSops";

// One SOP: written steps + the original training video. Reads the static seed by
// (category, slug) from the route. Same scoped green styling as the SOP Hub.

function videoEmbed(url?: string) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
  if (yt) {
    return (
      <div className="hsop-video">
        <iframe src={`https://www.youtube.com/embed/${yt[1]}`} allowFullScreen title="Training video" />
      </div>
    );
  }
  const loom = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
  if (loom) {
    return (
      <div className="hsop-video">
        <iframe src={`https://www.loom.com/embed/${loom[1]}`} allowFullScreen title="Training video" />
      </div>
    );
  }
  return null;
}

export default function AdminSopDetail() {
  const { cat: catKey, slug } = useParams<{ cat: string; slug: string }>();
  const found = catKey && slug ? findSop(catKey, slug) : null;

  return (
    <div className="hsop-root">
      <HsopStyle />
      <Link className="hsop-back" to="/admin/sops">
        <svg viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> SOP Hub
      </Link>

      {!found ? (
        <div className="hsop-empty">
          SOP not found. <Link to="/admin/sops" style={{ color: "var(--g-accent)" }}>Back to SOP Hub</Link>
        </div>
      ) : (
        <>
          <div className="hsop-detail-head">
            <span className="hsop-detail-emoji">{found.sop.emoji}</span>
            <div>
              <div className="hsop-kicker">{found.cat.emoji} {found.cat.name}</div>
              <h1>{found.sop.title}</h1>
            </div>
          </div>

          {found.sop.video &&
            (videoEmbed(found.sop.videoUrl) ?? (
              <div className="hsop-video">
                <div className="ph">
                  <span className="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
                  <span>Training video — link to be added</span>
                </div>
              </div>
            ))}

          <div className="hsop-prose" dangerouslySetInnerHTML={{ __html: found.sop.body }} />
        </>
      )}
    </div>
  );
}
