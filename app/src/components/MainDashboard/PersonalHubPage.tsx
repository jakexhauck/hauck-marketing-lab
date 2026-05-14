import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowRight,
  IconExternalLink,
  IconHygiene,
  IconPlus,
  IconShirt,
  IconTrash,
} from "../icons";
import type { PersonalSection } from "../../lib/navigation";
import { api } from "../../lib/tauri";
import type {
  PersonalCategory,
  PersonalHubFile,
  PersonalItem,
  PersonalSectionData,
} from "../../lib/types";

interface PersonalHubPageProps {
  section: PersonalSection;
  root: string | null;
  onSelectSection: (section: PersonalSection) => void;
}

type SectionKey = "hygiene" | "clothing";

function emptyFile(): PersonalHubFile {
  return {
    hygiene: { categories: [] },
    clothing: { categories: [] },
  };
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function categoryTotal(cat: PersonalCategory): number {
  return cat.items.reduce(
    (sum, it) => sum + (typeof it.price === "number" ? it.price : 0),
    0,
  );
}

// ── root component ────────────────────────────────────

export function PersonalHubPage({
  section,
  root,
  onSelectSection,
}: PersonalHubPageProps) {
  const [file, setFile] = useState<PersonalHubFile>(emptyFile());
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!root) {
      setFile(emptyFile());
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const next = await api.readPersonalHub(root);
        if (cancelled || !mountedRef.current) return;
        setFile({
          hygiene: next.hygiene ?? { categories: [] },
          clothing: next.clothing ?? { categories: [] },
        });
      } catch {
        if (!cancelled) setFile(emptyFile());
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root]);

  const persist = useCallback(
    async (next: PersonalHubFile) => {
      setFile(next);
      if (!root) return;
      try {
        await api.writePersonalHub(root, next);
      } catch (err) {
        console.error("write personal hub failed", err);
      }
    },
    [root],
  );

  const mutateSection = useCallback(
    (key: SectionKey, fn: (s: PersonalSectionData) => PersonalSectionData) => {
      const next: PersonalHubFile = { ...file, [key]: fn(file[key]) };
      void persist(next);
    },
    [file, persist],
  );

  if (section === "hygiene") {
    return (
      <SectionEditor
        eyebrow="Personal · Hygiene"
        title="Hygiene"
        Icon={IconHygiene}
        data={file.hygiene}
        loaded={loaded}
        onChange={(fn) => mutateSection("hygiene", fn)}
      />
    );
  }
  if (section === "clothing") {
    return (
      <SectionEditor
        eyebrow="Personal · Clothes & Jewelry"
        title="Clothes & Jewelry"
        Icon={IconShirt}
        data={file.clothing}
        loaded={loaded}
        onChange={(fn) => mutateSection("clothing", fn)}
      />
    );
  }
  return <PersonalOverview file={file} onSelectSection={onSelectSection} />;
}

// ── overview ──────────────────────────────────────────

function PersonalOverview({
  file,
  onSelectSection,
}: {
  file: PersonalHubFile;
  onSelectSection: (section: PersonalSection) => void;
}) {
  const hygieneItems = file.hygiene.categories.reduce(
    (n, c) => n + c.items.length,
    0,
  );
  const clothingItems = file.clothing.categories.reduce(
    (n, c) => n + c.items.length,
    0,
  );
  const hygieneTotal = file.hygiene.categories.reduce(
    (n, c) => n + categoryTotal(c),
    0,
  );
  const clothingTotal = file.clothing.categories.reduce(
    (n, c) => n + categoryTotal(c),
    0,
  );

  return (
    <div className="hml-content">
      <section className="hml-greeting">
        <div className="hml-greeting-eyebrow">
          <span className="hml-eyebrow-dot" />
          PERSONAL HUB
        </div>
        <h1 className="hml-greeting-title">Personal</h1>
        <div className="hml-greeting-sub">
          Personal kit and references. Add categories and products with their
          price; totals roll up per category.
        </div>
      </section>

      <section className="hml-hub-banners">
        <button
          type="button"
          className="hml-hub-banner hml-hub-clients"
          onClick={() => onSelectSection("hygiene")}
        >
          <div className="hml-hub-banner-icon">
            <IconHygiene size={18} />
          </div>
          <div className="hml-hub-banner-body">
            <div className="hml-hub-banner-eyebrow">Section</div>
            <div className="hml-hub-banner-title">Hygiene</div>
            <div className="hml-hub-banner-stat">
              <span className="hml-em">
                {file.hygiene.categories.length} categor
                {file.hygiene.categories.length === 1 ? "y" : "ies"}
              </span>
              <span className="hml-sep">·</span>
              <span>
                {hygieneItems} product{hygieneItems === 1 ? "" : "s"}
              </span>
              {hygieneTotal > 0 && (
                <>
                  <span className="hml-sep">·</span>
                  <span className="hml-em">{formatMoney(hygieneTotal)}</span>
                </>
              )}
            </div>
          </div>
          <div className="hml-hub-banner-arrow">
            <IconArrowRight size={14} />
          </div>
        </button>

        <button
          type="button"
          className="hml-hub-banner hml-hub-outreach"
          onClick={() => onSelectSection("clothing")}
        >
          <div className="hml-hub-banner-icon">
            <IconShirt size={18} />
          </div>
          <div className="hml-hub-banner-body">
            <div className="hml-hub-banner-eyebrow">Section</div>
            <div className="hml-hub-banner-title">Clothes & Jewelry</div>
            <div className="hml-hub-banner-stat">
              <span className="hml-em">
                {file.clothing.categories.length} categor
                {file.clothing.categories.length === 1 ? "y" : "ies"}
              </span>
              <span className="hml-sep">·</span>
              <span>
                {clothingItems} item{clothingItems === 1 ? "" : "s"}
              </span>
              {clothingTotal > 0 && (
                <>
                  <span className="hml-sep">·</span>
                  <span className="hml-em">{formatMoney(clothingTotal)}</span>
                </>
              )}
            </div>
          </div>
          <div className="hml-hub-banner-arrow">
            <IconArrowRight size={14} />
          </div>
        </button>
      </section>
    </div>
  );
}

// ── section editor ────────────────────────────────────

interface SectionEditorProps {
  eyebrow: string;
  title: string;
  Icon: typeof IconHygiene;
  data: PersonalSectionData;
  loaded: boolean;
  onChange: (fn: (s: PersonalSectionData) => PersonalSectionData) => void;
}

function SectionEditor({
  eyebrow,
  title,
  Icon,
  data,
  loaded,
  onChange,
}: SectionEditorProps) {
  const [newCatName, setNewCatName] = useState("");

  const totalCost = useMemo(
    () => data.categories.reduce((n, c) => n + categoryTotal(c), 0),
    [data],
  );

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    onChange((s) => ({
      categories: [
        ...s.categories,
        { id: genId(), name, items: [] },
      ],
    }));
    setNewCatName("");
  };

  const renameCategory = (catId: string, name: string) => {
    onChange((s) => ({
      categories: s.categories.map((c) =>
        c.id === catId ? { ...c, name } : c,
      ),
    }));
  };

  const deleteCategory = (catId: string) => {
    onChange((s) => ({
      categories: s.categories.filter((c) => c.id !== catId),
    }));
  };

  const addItem = (catId: string, item: PersonalItem) => {
    onChange((s) => ({
      categories: s.categories.map((c) =>
        c.id === catId ? { ...c, items: [...c.items, item] } : c,
      ),
    }));
  };

  const updateItem = (
    catId: string,
    itemId: string,
    patch: Partial<PersonalItem>,
  ) => {
    onChange((s) => ({
      categories: s.categories.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: c.items.map((it) =>
                it.id === itemId ? { ...it, ...patch } : it,
              ),
            }
          : c,
      ),
    }));
  };

  const deleteItem = (catId: string, itemId: string) => {
    onChange((s) => ({
      categories: s.categories.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.filter((it) => it.id !== itemId) }
          : c,
      ),
    }));
  };

  return (
    <div className="hml-content">
      <section className="hml-greeting">
        <div className="hml-greeting-eyebrow">
          <span className="hml-eyebrow-dot" />
          {eyebrow.toUpperCase()}
        </div>
        <h1 className="hml-greeting-title">{title}</h1>
        <div className="hml-greeting-sub">
          {data.categories.length} categor
          {data.categories.length === 1 ? "y" : "ies"}
          {totalCost > 0 && (
            <>
              <span className="hml-divider" />
              <span className="hml-mono">{formatMoney(totalCost)} total</span>
            </>
          )}
        </div>
      </section>

      {/* Add category row */}
      <section className="hml-personal-addcat">
        <input
          type="text"
          className="hml-personal-input"
          placeholder="New category name (e.g. Skincare, Hair, Body…)"
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCategory();
          }}
        />
        <button
          type="button"
          className="hml-btn"
          onClick={addCategory}
          disabled={!newCatName.trim()}
        >
          <IconPlus size={13} />
          Add category
        </button>
      </section>

      {!loaded ? null : data.categories.length === 0 ? (
        <div className="hml-panel">
          <div className="hml-panel-body" style={{ padding: "10px 0" }}>
            <div className="hml-empty">
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Icon size={28} />
              </div>
              <div className="hml-empty-title">No categories yet</div>
              <div className="hml-empty-sub">
                Add a category above to start tracking products.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <section className="hml-personal-grid">
          {data.categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              onRename={(name) => renameCategory(cat.id, name)}
              onDelete={() => deleteCategory(cat.id)}
              onAddItem={(item) => addItem(cat.id, item)}
              onUpdateItem={(itemId, patch) => updateItem(cat.id, itemId, patch)}
              onDeleteItem={(itemId) => deleteItem(cat.id, itemId)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ── category card ─────────────────────────────────────

interface CategoryCardProps {
  category: PersonalCategory;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: (item: PersonalItem) => void;
  onUpdateItem: (itemId: string, patch: Partial<PersonalItem>) => void;
  onDeleteItem: (itemId: string) => void;
}

function CategoryCard({
  category,
  onRename,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: CategoryCardProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(category.name);

  const total = categoryTotal(category);

  const submitItem = () => {
    const n = name.trim();
    if (!n) return;
    const parsedPrice = price.trim() ? parsePrice(price) : null;
    onAddItem({
      id: genId(),
      name: n,
      url: url.trim() || null,
      price: parsedPrice,
    });
    setName("");
    setUrl("");
    setPrice("");
  };

  return (
    <div className="hml-panel hml-personal-cat">
      <div className="hml-panel-header">
        <div className="hml-panel-title" style={{ flex: 1, minWidth: 0 }}>
          <span className="hml-dot" />
          <input
            type="text"
            className="hml-personal-cat-name"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={() => {
              const next = editingName.trim();
              if (next && next !== category.name) onRename(next);
              else setEditingName(category.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setEditingName(category.name);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="hml-icon-btn hml-personal-cat-del"
          title={confirmDelete ? "Click again to confirm" : "Delete category"}
          onClick={() => {
            if (confirmDelete) onDelete();
            else setConfirmDelete(true);
          }}
          onMouseLeave={() => setConfirmDelete(false)}
        >
          <IconTrash size={13} />
        </button>
      </div>
      <div className="hml-panel-body">
        {category.items.length === 0 ? (
          <div className="hml-personal-empty">No products yet.</div>
        ) : (
          <ul className="hml-personal-list">
            {category.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onUpdate={(patch) => onUpdateItem(item.id, patch)}
                onDelete={() => onDeleteItem(item.id)}
              />
            ))}
          </ul>
        )}

        {/* Add item row */}
        <div className="hml-personal-additem">
          <input
            type="text"
            className="hml-personal-input"
            placeholder="Product name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitItem();
            }}
          />
          <input
            type="url"
            className="hml-personal-input"
            placeholder="Link (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitItem();
            }}
          />
          <input
            type="text"
            inputMode="decimal"
            className="hml-personal-input hml-personal-input-price"
            placeholder="$0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitItem();
            }}
          />
          <button
            type="button"
            className="hml-btn hml-personal-add-btn"
            onClick={submitItem}
            disabled={!name.trim()}
          >
            <IconPlus size={12} />
          </button>
        </div>

        <div className="hml-personal-cat-foot">
          <span>
            {category.items.length} item
            {category.items.length === 1 ? "" : "s"}
          </span>
          <span className="hml-personal-cat-total">
            {total > 0 ? formatMoney(total) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── item row (inline-editable) ────────────────────────

interface ItemRowProps {
  item: PersonalItem;
  onUpdate: (patch: Partial<PersonalItem>) => void;
  onDelete: () => void;
}

function ItemRow({ item, onUpdate, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [url, setUrl] = useState(item.url ?? "");
  const [price, setPrice] = useState(
    item.price != null ? String(item.price) : "",
  );

  useEffect(() => {
    if (!editing) {
      setName(item.name);
      setUrl(item.url ?? "");
      setPrice(item.price != null ? String(item.price) : "");
    }
  }, [item, editing]);

  const save = () => {
    const n = name.trim();
    if (!n) {
      setEditing(false);
      return;
    }
    const parsedPrice = price.trim() ? parsePrice(price) : null;
    onUpdate({
      name: n,
      url: url.trim() || null,
      price: parsedPrice,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="hml-personal-row hml-personal-row-edit">
        <input
          type="text"
          className="hml-personal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
        />
        <input
          type="url"
          className="hml-personal-input"
          placeholder="Link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <input
          type="text"
          inputMode="decimal"
          className="hml-personal-input hml-personal-input-price"
          placeholder="$0.00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          type="button"
          className="hml-btn hml-personal-add-btn"
          onClick={save}
        >
          Save
        </button>
      </li>
    );
  }

  return (
    <li className="hml-personal-row">
      <div className="hml-personal-row-name">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="hml-personal-link"
          >
            <span>{item.name}</span>
            <IconExternalLink size={11} />
          </a>
        ) : (
          <span>{item.name}</span>
        )}
      </div>
      <span className="hml-personal-price">
        {item.price != null ? formatMoney(item.price) : "—"}
      </span>
      <button
        type="button"
        className="hml-icon-btn hml-personal-row-edit-btn"
        onClick={() => setEditing(true)}
        title="Edit"
      >
        Edit
      </button>
      <button
        type="button"
        className="hml-icon-btn hml-personal-row-del-btn"
        onClick={onDelete}
        title="Delete"
      >
        <IconTrash size={12} />
      </button>
    </li>
  );
}
