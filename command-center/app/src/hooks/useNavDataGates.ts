import { useCallback } from "react";
import type { DataGate } from "../lib/nav";
import { useOrganicAvailable } from "./useOrganic";

// Answers NavItem.dataGate for every data-gated surface, in one place.
//
// The sidebar, the phone bottom bar and the /apps grid each render the nav
// independently, so each calls this. They share one react-query cache entry per
// gate, so three callers is still one network request.
export function useNavDataGates(enabled: boolean): (gate: DataGate) => boolean {
  const organic = useOrganicAvailable(enabled);
  return useCallback(
    (gate: DataGate) => {
      switch (gate) {
        case "organic":
          return organic;
        default:
          return false;
      }
    },
    [organic],
  );
}
