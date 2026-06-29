import type { ReactNode } from "react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, EmptyState } from "../../components/ui";

// Shared scaffold for the Social sub-pages that are not built yet. Each renders a
// real page (so the sidebar group and routes are wired and navigable) with a
// friendly placeholder describing what will live there. Replaced one by one as
// each surface is built.
export default function SocialStub({
  title,
  description,
  icon,
  comingTitle,
  comingBody,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  comingTitle: string;
  comingBody: string;
}) {
  return (
    <Shell>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-5 pb-12 pt-5 lg:px-8">
        <PageHeader title={title} description={description} />
        <Panel className="px-4 py-12">
          <EmptyState icon={icon} title={comingTitle} description={comingBody} />
        </Panel>
      </div>
    </Shell>
  );
}
