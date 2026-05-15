import { useParams } from "react-router-dom";
import Shell from "../components/Shell";

export default function LeadDetail() {
  const { id } = useParams();
  return (
    <Shell>
      <div className="flex flex-1 items-center justify-center p-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Lead {id} (placeholder)
        </h1>
      </div>
    </Shell>
  );
}
