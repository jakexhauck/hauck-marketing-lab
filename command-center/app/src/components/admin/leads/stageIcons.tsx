import type { ReactNode } from "react";
import {
  UserPlus,
  Phone,
  PhoneOff,
  Hand,
  PhoneForwarded,
  Calendar,
  CircleX,
  CalendarDays,
} from "lucide-react";
import type { ColdCallStageId } from "../../../lib/coldCallStages";
import { TRACKER_ID } from "../../../lib/coldCallStages";

// One icon per Cold Call Leads stage, plus the Tracker chip that shares the
// strip. Kept beside the stage list rather than inside it so lib/coldCallStages
// stays a pure module with no JSX.

export const STAGE_ICONS: Record<ColdCallStageId | typeof TRACKER_ID, ReactNode> = {
  "new-lead": <UserPlus size={15} />,
  "first-dial": <Phone size={15} />,
  "second-dial": <PhoneOff size={15} />,
  "brushed-off": <Hand size={15} />,
  "call-back": <PhoneForwarded size={15} />,
  booked: <Calendar size={15} />,
  "not-interested": <CircleX size={15} />,
  [TRACKER_ID]: <CalendarDays size={15} />,
};
