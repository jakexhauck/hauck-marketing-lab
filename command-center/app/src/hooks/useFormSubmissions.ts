import { useMemo } from "react";
import { useClient } from "../context/ClientContext";
import { buildFormSubmissions, type FormSubmissionsDataset } from "../lib/formSubmissions";

// The Form Submissions surface reads its data through this hook so the page stays
// source-agnostic. Today it returns a deterministic demo dataset (see
// `formSubmissions.ts`); when the website estimate form is wired to GoHighLevel,
// swap the body for a query (e.g. `useQuery(["form-submissions"], () =>
// api("/api/forms/submissions"))`) and keep the return shape: nothing downstream
// changes.
export function useFormSubmissions(): FormSubmissionsDataset {
  const { client } = useClient();
  const appName = client.brand.appName;
  return useMemo(() => buildFormSubmissions(appName, new Date()), [appName]);
}
