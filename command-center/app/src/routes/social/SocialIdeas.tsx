import { useState } from "react";
import { Lightbulb, Plus } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { SOCIAL_TABS } from "../../lib/pageTabs";
import { Panel, Button, EmptyState } from "../../components/ui";
import { SOCIAL_CONTAINER } from "./shared";
import NewIdeaDialog from "../../components/social/NewIdeaDialog";

// A place to jot down post ideas to write later. Ideas are added by hand via the
// "New Post Idea" dialog; there is no generated feed. Until an idea store is
// wired, the tab shows an honest empty state (no templated or fabricated ideas).

export default function SocialIdeas() {
  const [ideaOpen, setIdeaOpen] = useState(false);

  return (
    <Shell>
      <NewIdeaDialog open={ideaOpen} onClose={() => setIdeaOpen(false)} />
      <div className={SOCIAL_CONTAINER}>
        <PageBar
          tabs={SOCIAL_TABS}
          description="Jot down post ideas to write later."
          actions={
            <Button variant="primary" size="md" onClick={() => setIdeaOpen(true)}>
              <Plus size={16} /> New Post Idea
            </Button>
          }
        />

        <Panel className="px-4 py-12">
          <EmptyState
            icon={<Lightbulb size={22} />}
            title="No ideas yet"
            description="Add a post idea and it will show up here, ready to write and schedule when you are."
          />
        </Panel>
      </div>
    </Shell>
  );
}
