import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowRight, Phone } from "lucide-react";
import type { Lead } from "../types";
import StagePill from "./StagePill";
import Avatar from "./Avatar";
import { timeAgo } from "../lib/timeAgo";
import { usePipelines } from "../context/PipelinesContext";
import { useNow } from "../context/NowContext";
import { useLeads } from "../context/LeadsContext";

interface Props {
  lead: Lead;
  onTap: (leadId: string) => void;
  onAction?: (message: string) => void;
  isLast?: boolean;
}

const REVEAL_THRESHOLD = 80;
const COMMIT_THRESHOLD = 140;
const DRAG_LOCK_DISTANCE = 6;
const DIRECTION_LOCK_WINDOW = 12;
const ACTION_WIDTH = 100;

type DragAxis = "none" | "horizontal" | "vertical";

export default function LeadRow({ lead, onTap, onAction, isLast = false }: Props) {
  const { pipelines } = usePipelines();
  const now = useNow();
  const { moveStage } = useLeads();

  const [offset, setOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const axisRef = useRef<DragAxis>("none");
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  // Next stage = the following stage in the lead's own pipeline, by position.
  // Only open leads advance; terminal statuses and unknown stages do not.
  const pipeline = pipelines.find((p) => p.id === lead.pipelineId);
  const nextStage =
    lead.status === "open" && pipeline && lead.stagePosition >= 0
      ? (pipeline.stages[lead.stagePosition + 1] ?? null)
      : null;
  const hasPhone = Boolean(lead.phone);
  const telDigits = hasPhone ? lead.phone.replace(/[^0-9+]/g, "") : "";

  const canSwipeLeft = Boolean(nextStage); // reveals "advance" action on the right
  const canSwipeRight = hasPhone; // reveals "call" action on the left

  const reset = useCallback(() => {
    setIsAnimating(true);
    setOffset(0);
  }, []);

  const commitAdvance = useCallback(() => {
    if (!nextStage) return;
    moveStage(lead.id, nextStage.id, nextStage.name);
    onAction?.(`Moved to ${nextStage.name}`);
    reset();
  }, [moveStage, lead.id, nextStage, onAction, reset]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Only respond to primary pointer (left mouse / single touch / pen).
    if (e.button !== undefined && e.button !== 0) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    axisRef.current = "none";
    draggingRef.current = false;
    suppressClickRef.current = false;
    pointerIdRef.current = e.pointerId;
    setIsAnimating(false);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === null) return;
    if (e.pointerId !== pointerIdRef.current) return;

    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (axisRef.current === "none") {
      if (absDx < DIRECTION_LOCK_WINDOW && absDy < DIRECTION_LOCK_WINDOW) {
        // Not enough motion to decide yet.
        return;
      }
      if (absDy > absDx * 1.5) {
        axisRef.current = "vertical";
        pointerIdRef.current = null;
        return;
      }
      axisRef.current = "horizontal";
      try {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      } catch {
        // Capture may fail on some platforms — safe to ignore.
      }
    }

    if (axisRef.current !== "horizontal") return;

    if (absDx > DRAG_LOCK_DISTANCE) {
      draggingRef.current = true;
      suppressClickRef.current = true;
    }

    // Clamp to available action sides.
    let next = dx;
    if (next < 0 && !canSwipeLeft) next = 0;
    if (next > 0 && !canSwipeRight) next = 0;
    // Soft cap at 1.5x action width per side.
    const cap = ACTION_WIDTH * 1.5;
    if (next > cap) next = cap;
    if (next < -cap) next = -cap;
    setOffset(next);
  };

  const finishDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current === null) return;
      if (e.pointerId !== pointerIdRef.current) return;
      try {
        if ((e.currentTarget as HTMLDivElement).hasPointerCapture?.(e.pointerId)) {
          (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      pointerIdRef.current = null;

      if (axisRef.current !== "horizontal") {
        axisRef.current = "none";
        draggingRef.current = false;
        return;
      }

      const dx = offset;
      const abs = Math.abs(dx);

      if (dx < 0 && canSwipeLeft && abs >= COMMIT_THRESHOLD) {
        // Commit the stage advance.
        commitAdvance();
      } else if (dx < 0 && canSwipeLeft && abs >= REVEAL_THRESHOLD) {
        // Snap to revealed state so the user can tap the action.
        setIsAnimating(true);
        setOffset(-ACTION_WIDTH);
      } else if (dx > 0 && canSwipeRight && abs >= COMMIT_THRESHOLD) {
        // Trigger the tel: link.
        if (telDigits) {
          window.location.href = `tel:${telDigits}`;
        }
        reset();
      } else if (dx > 0 && canSwipeRight && abs >= REVEAL_THRESHOLD) {
        setIsAnimating(true);
        setOffset(ACTION_WIDTH);
      } else {
        reset();
      }

      axisRef.current = "none";
      draggingRef.current = false;
      // Reset click suppression on next tick so the synthetic click that
      // follows a pointerup gets swallowed if dragging happened.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    },
    [canSwipeLeft, canSwipeRight, commitAdvance, offset, reset, telDigits]
  );

  const handleClick = () => {
    if (suppressClickRef.current) return;
    if (Math.abs(offset) > 1) {
      // Row is in revealed state — first tap snaps back rather than navigating.
      reset();
      return;
    }
    onTap(lead.id);
  };

  const handleAdvanceClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    commitAdvance();
  };

  const handleCallClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    reset();
  };

  return (
    <div className="relative isolate overflow-hidden bg-[var(--surface)]">
      {/* Left action panel — revealed when swiping right. */}
      {canSwipeRight && (
        <a
          href={`tel:${telDigits}`}
          onClick={handleCallClick}
          aria-label={`Call ${lead.name}`}
          className="absolute inset-y-0 left-0 flex items-center justify-center gap-1.5 text-white"
          style={{
            width: `${ACTION_WIDTH}px`,
            backgroundColor: "#10b981",
          }}
        >
          <Phone size={20} aria-hidden="true" />
          <span className="label-cap" style={{ color: "#ffffff" }}>
            Call
          </span>
        </a>
      )}

      {/* Right action panel — revealed when swiping left. */}
      {canSwipeLeft && nextStage && (
        <button
          type="button"
          onClick={handleAdvanceClick}
          aria-label={`Move to ${nextStage.name}`}
          className="absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 text-[var(--brand-fg)]"
          style={{
            width: `${ACTION_WIDTH}px`,
            backgroundColor: "var(--brand-primary)",
          }}
        >
          <ArrowRight size={20} aria-hidden="true" />
          <span className="label-cap" style={{ color: "var(--brand-fg)" }}>
            {nextStage.name}
          </span>
        </button>
      )}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTap(lead.id);
          }
        }}
        className={
          "relative flex w-full cursor-pointer items-center gap-3 bg-[var(--surface)] px-4 py-3.5 text-left select-none active:bg-[var(--surface-2)]" +
          (isLast ? "" : " border-b border-[var(--divider)]") +
          (isAnimating ? " transition-transform duration-200 ease-out" : "")
        }
        style={{
          minHeight: "64px",
          transform: `translateX(${offset}px)`,
          touchAction: "pan-y",
        }}
      >
        <Avatar name={lead.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
            {lead.name}
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--text-faint)]">
            {lead.sourceAd}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StagePill lead={lead} />
          <span className="tabular-figs text-[10.5px] font-semibold text-[var(--text-faint)]">
            {timeAgo(lead.lastActivityAt, now)}
          </span>
        </div>
      </div>
    </div>
  );
}
