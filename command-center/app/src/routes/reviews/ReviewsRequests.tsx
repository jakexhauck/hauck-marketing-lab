import { useMemo } from "react";
import { Star, Mail, Phone, Clock, CheckCircle2 } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import {
  Panel,
  Badge,
  Button,
  EmptyState,
  LoadingState,
  ErrorState,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useReviewsQuery, useStartReviewCampaign } from "../../hooks/useApi";
import { relativeTime, formatPhone } from "../../lib/format";
import type { ApiReviewContact } from "../../lib/api";

function ReviewRow({
  contact,
  onStart,
  pending,
}: {
  contact: ApiReviewContact;
  onStart: (contactId: string) => void;
  pending: boolean;
}) {
  const telDigits = contact.phone.replace(/[^\d+]/g, "");
  return (
    <li className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[14.5px] text-text">{contact.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
          {telDigits && (
            <a
              href={`tel:${telDigits}`}
              className="flex items-center gap-1 hover:text-brand-text"
            >
              <Phone size={13} className="shrink-0 text-faint" /> {formatPhone(contact.phone)}
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-1 truncate hover:text-brand-text"
            >
              <Mail size={13} className="shrink-0 text-faint" /> {contact.email}
            </a>
          )}
          {contact.completedAt && (
            <span className="flex items-center gap-1 text-faint">
              <Clock size={13} className="shrink-0" /> Completed {relativeTime(contact.completedAt)}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {contact.started ? (
          <Badge tone="positive">
            <CheckCircle2 size={13} className="mr-1" /> Campaign started
          </Badge>
        ) : (
          <Button
            variant="primary"
            size="sm"
            loading={pending}
            onClick={() => onStart(contact.contactId)}
          >
            Start Campaign
          </Button>
        )}
      </div>
    </li>
  );
}

export default function ReviewsRequests() {
  const { session } = useAuth();
  const useReal = Boolean(session);
  const query = useReviewsQuery(useReal);
  const start = useStartReviewCampaign();

  const contacts: ApiReviewContact[] = useMemo(
    () => query.data?.contacts ?? [],
    [query.data],
  );
  const configError = query.data?.configError;
  const pendingId = start.isPending ? start.variables?.contactId : undefined;

  return (
    <Shell>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-5 pb-12 pt-5 lg:px-8">
        <PageHeader
          title="Ask for Reviews"
          count={contacts.length ? `${contacts.length}` : undefined}
          description="Finished jobs. Tap Start Campaign to ask that customer for a Google review."
        />

        {configError ? (
          <Panel className="px-4 py-8">
            <EmptyState
              icon={<Star size={22} />}
              title="No completed-jobs stage found"
              description="Once your Sales pipeline has a 'Job Completed' stage, finished jobs will show up here ready to request a review."
            />
          </Panel>
        ) : query.isError ? (
          <Panel className="px-4 py-8">
            <ErrorState
              title="Could not load reviews"
              description={(query.error as Error | null)?.message ?? "Try again."}
              onRetry={() => query.refetch()}
            />
          </Panel>
        ) : query.isLoading ? (
          <Panel>
            <LoadingState label="Loading completed jobs" />
          </Panel>
        ) : contacts.length === 0 ? (
          <Panel className="px-4 py-8">
            <EmptyState
              icon={<Star size={22} />}
              title="No completed jobs yet"
              description="When a job is marked complete, that customer shows up here so you can request a review in one tap."
            />
          </Panel>
        ) : (
          <Panel className="overflow-hidden">
            <ul>
              {contacts.map((c) => (
                <ReviewRow
                  key={c.contactId}
                  contact={c}
                  onStart={(id) => start.mutate({ contactId: id })}
                  pending={pendingId === c.contactId}
                />
              ))}
            </ul>
            {query.data?.truncatedAt != null && (
              <div className="border-t border-divider px-4 py-2.5 text-[12px] text-faint">
                Showing campaign status for the most recent {query.data.truncatedAt} completed
                jobs.
              </div>
            )}
          </Panel>
        )}

        {start.isError && (
          <div className="mt-4 rounded-[var(--radius)] border border-border bg-danger-tint/40 px-3.5 py-2 text-[12.5px] text-danger">
            Could not start that campaign. Please try again.
          </div>
        )}
      </div>
    </Shell>
  );
}
