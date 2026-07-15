import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./context/ThemeContext";
import { ClientProvider } from "./context/ClientContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LeadsProvider } from "./context/LeadsContext";
import { PipelinesProvider } from "./context/PipelinesContext";
import Login from "./routes/Login";
import Home from "./routes/Home";
import AllFeatures from "./routes/AllFeatures";
import LeadsPipelinePage from "./routes/sales/LeadsPipelinePage";
import LeadsOrganic from "./routes/sales/LeadsOrganic";
import Jobs from "./routes/sales/Jobs";
import Dashboard from "./routes/Dashboard";
import { PaidAds } from "./routes/PaidAds";
import ReviewsOverview from "./routes/reviews/ReviewsOverview";
import ReviewsRequests from "./routes/reviews/ReviewsRequests";
import ReviewsPipeline from "./routes/reviews/ReviewsPipeline";
import { Activity } from "./routes/Activity";
import Contacts from "./routes/Contacts";
import ContactDetail from "./routes/ContactDetail";
import Conversations from "./routes/Conversations";
import ConversationDetail from "./routes/ConversationDetail";
import LeadDetail from "./routes/LeadDetail";
import Today from "./routes/Today";
import Billing from "./routes/Billing";
import Calendar from "./routes/Calendar";
import Notifications from "./routes/Notifications";
import Team from "./routes/Team";
import Settings from "./routes/Settings";
import Comms from "./routes/Comms";
import Automations from "./routes/Automations";
import ComingSoon from "./routes/ComingSoon";
import SocialOverview from "./routes/social/SocialOverview";
import SocialIdeas from "./routes/social/SocialIdeas";
import SocialCalendar from "./routes/social/SocialCalendar";
import SocialPosts from "./routes/social/SocialPosts";
import SocialInsights from "./routes/social/SocialInsights";
import WebsiteOverview from "./routes/website/WebsiteOverview";
import WebsitePages from "./routes/website/WebsitePages";
import WebsiteInsights from "./routes/website/WebsiteInsights";
import AdsOverview from "./routes/paid-ads/AdsOverview";
import AdsCreatives from "./routes/paid-ads/AdsCreatives";
import AdsInsights from "./routes/paid-ads/AdsInsights";
import AdsMedia from "./routes/paid-ads/AdsMedia";
import Reactivation from "./routes/sales/Reactivation";
import CampaignsAudiences from "./routes/campaigns/CampaignsAudiences";
import OutreachOverview from "./routes/outreach/OutreachOverview";
import OutreachSchedule from "./routes/outreach/OutreachSchedule";
import OutreachEmails from "./routes/outreach/OutreachEmails";
import OutreachData from "./routes/outreach/OutreachData";
import OutreachSms from "./routes/outreach/OutreachSms";
import ReactivationPipeline from "./routes/reactivation/ReactivationPipeline";
import ReactivationData from "./routes/reactivation/ReactivationData";
import GroupOutreachOverview from "./routes/groups/GroupOutreachOverview";
import AdminLayout from "./routes/admin/AdminLayout";
import AdminClientDetail from "./routes/admin/AdminClientDetail";
import AdminTasks from "./routes/admin/AdminTasks";
import AdminBuild from "./routes/admin/AdminBuild";
import AdminSops from "./routes/admin/AdminSops";
import AdminSopDetail from "./routes/admin/AdminSopDetail";
import Assets from "./routes/admin/Assets";
import AdminMessages from "./routes/admin/AdminMessages";
import Plans from "./routes/admin/Plans";
import AdminOnboarding from "./routes/admin/AdminOnboarding";
import AdminOnboardingDetail from "./routes/admin/AdminOnboardingDetail";
import AdminCommand from "./routes/admin/AdminCommand";
import AdminDelivery from "./routes/admin/AdminDelivery";
import DeliveryCockpit from "./routes/admin/DeliveryCockpit";
import AdminPillarPage from "./routes/admin/AdminPillarPage";
import AdminSettings from "./routes/admin/AdminSettings";
import AdminInfrastructure from "./routes/admin/AdminInfrastructure";
import Shell from "./components/Shell";
import IdentityPicker from "./components/IdentityPicker";
import OfflineBanner from "./components/OfflineBanner";
import PreviewBanner from "./components/PreviewBanner";
import DemoBanner from "./components/DemoBanner";
import IncomingCallBanner from "./components/call/IncomingCallBanner";
import ScrollToTop from "./components/ScrollToTop";
import MotionPresetSwitcher from "./components/dev/MotionPresetSwitcher";
import { ToastProvider } from "./context/ToastContext";
import { NowProvider } from "./context/NowContext";
import { ChatProvider } from "./context/ChatContext";
import { TourProvider } from "./context/TourContext";
import TourOverlay from "./components/tour/TourOverlay";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, currentUser, needsIdentity, setIdentity, isAdmin } = useAuth();
  if (status === "loading") return null;
  // A super-admin has no tenant and never belongs on a client surface.
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (!currentUser) return <Navigate to="/login" replace />;
  // One-time "who are you?" step after the shared-password login. Skipping
  // (or any failure) falls back to the hardcoded-owner default in AuthContext.
  if (needsIdentity) {
    return (
      <Shell>
        <IdentityPicker onPick={setIdentity} />
      </Shell>
    );
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { status, isAdmin, preview } = useAuth();
  if (status === "loading") return null;
  // Starting a client preview swaps the admin session for a read-only tenant
  // session, so isAdmin flips to false while this admin route is still mounted.
  // Send the admin into the client app (the preview banner offers the way back)
  // instead of bouncing to /login.
  if (preview) return <Navigate to="/home" replace />;
  if (!isAdmin) return <Navigate to="/login" replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

// Old pillar sub-routes (lane workspaces and tab deep links) collapse to the
// pillar page now that lanes and tabs are gone. Reads the :pillarId and sends
// the request up one level.
function PillarRedirect() {
  const { pillarId } = useParams<{ pillarId: string }>();
  return <Navigate to={`/admin/pillar/${pillarId ?? ""}`} replace />;
}

function RootRedirect() {
  const { status, mode, isAdmin } = useAuth();
  if (status === "loading") return null;
  // A super-admin always lands in the admin console, never a tenant surface.
  if (status === "authenticated" && isAdmin) {
    return <Navigate to="/admin" replace />;
  }
  // Offline grace: nobody can sign in without a network, so any plausible
  // previous session (either mode) goes to the cached dashboard, not /login.
  if (status === "authenticated-offline") {
    return <Navigate to="/home" replace />;
  }
  // Live sessions (clients) stay logged in and skip straight to the
  // dashboard. Test sessions (internal) always land on the login screen.
  if (status === "authenticated" && mode === "live") {
    return <Navigate to="/home" replace />;
  }
  return <Navigate to="/login" replace />;
}

// Bridge from the service worker into the running app. "push": a push landed,
// refresh the bell/feed immediately instead of waiting for the next poll.
// "navigate": a notification was tapped while a window exists; route in the
// SPA rather than the full-reload win.navigate the SW used to do.
function ServiceWorkerMessages() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === "push") {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        void queryClient.invalidateQueries({ queryKey: ["activity"] });
      } else if (data?.type === "navigate" && data.url) {
        navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);
  return null;
}

// Keep installed PWAs current without a reinstall. sw.ts already calls
// skipWaiting() + clientsClaim(), so a new deploy's worker activates and takes
// control the moment it is found, but the auto-injected registerSW.js only
// registers the worker: it never reloads the open page, so the running tab
// keeps executing the previous deploy's in-memory JS. This bridges the last
// step in two parts.
//
// Trigger: iOS keeps PWAs suspended and resumes them without checking for a new
// worker, so a client who never fully closes the app can run stale code for
// days. Forcing registration.update() whenever the app returns to the
// foreground (plus a slow heartbeat for sessions left open for hours) makes the
// browser look for a new deploy.
//
// Apply: when a found worker activates and claims the page, controllerchange
// fires and we reload into the new version. wasControlled guards the very first
// claim on a fresh visit (page loaded with no controller), where a reload would
// be a pointless flash and could loop.
function ServiceWorkerUpdater() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const wasControlled = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const onControllerChange = () => {
      if (!wasControlled || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;
    let cancelled = false;
    const check = () => {
      if (document.visibilityState === "visible") void reg?.update().catch(() => {});
    };
    void navigator.serviceWorker.getRegistration().then((r) => {
      if (cancelled) return;
      reg = r ?? undefined;
      check();
    });
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, 60 * 60 * 1000);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ClientProvider>
          <PipelinesProvider>
          <LeadsProvider>
          <NowProvider>
          <ToastProvider>
            <ChatProvider>
            <TourProvider>
            <ServiceWorkerMessages />
            <ServiceWorkerUpdater />
            {import.meta.env.DEV && <MotionPresetSwitcher />}
            <OfflineBanner />
            <PreviewBanner />
            <DemoBanner />
            <IncomingCallBanner />
            <ScrollToTop />
            <TourOverlay />
            <div className="app-shell">
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/apps"
                element={
                  <ProtectedRoute>
                    <AllFeatures />
                  </ProtectedRoute>
                }
              />
              {/* The old standalone /leads board now lands on the Pipeline tab. */}
              <Route path="/leads" element={<Navigate to="/sales/leads" replace />} />
              {/* Section root = Sales pipeline board (the default tab). */}
              <Route
                path="/sales/leads"
                element={
                  <ProtectedRoute>
                    <LeadsPipelinePage kind="sales" />
                  </ProtectedRoute>
                }
              />
              {/* Trash = the dead-lead pipeline board. */}
              <Route
                path="/sales/leads/trash"
                element={
                  <ProtectedRoute>
                    <LeadsPipelinePage kind="trash" />
                  </ProtectedRoute>
                }
              />
              {/* Organic = website estimate-form + chat leads (list only). */}
              <Route
                path="/sales/leads/organic"
                element={
                  <ProtectedRoute>
                    <LeadsOrganic />
                  </ProtectedRoute>
                }
              />
              {/* Old paths fold into the new pages. Paid Ads is no longer a Leads
                  tab; its old routes redirect to the Sales board. */}
              <Route path="/sales/leads/pipeline" element={<Navigate to="/sales/leads" replace />} />
              <Route path="/sales/leads/paid-ads" element={<Navigate to="/sales/leads" replace />} />
              <Route path="/sales/forms" element={<Navigate to="/sales/leads/organic" replace />} />
              <Route path="/sales/chat" element={<Navigate to="/sales/leads/organic" replace />} />
              <Route path="/sales/paid-ads" element={<Navigate to="/sales/leads" replace />} />
              <Route
                path="/sales/jobs"
                element={
                  <ProtectedRoute>
                    <Jobs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              {/* The raw live-ads dashboard (real Meta spend/CPL/ROAS). Not in the
                  nav; reachable as a deep dive beneath the Paid Ads overview. */}
              <Route
                path="/paid-ads"
                element={
                  <ProtectedRoute>
                    <PaidAds />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/activity"
                element={
                  <ProtectedRoute>
                    <Activity />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contacts"
                element={
                  <ProtectedRoute>
                    <Contacts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contacts/:contactId"
                element={
                  <ProtectedRoute>
                    <ContactDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/conversations"
                element={
                  <ProtectedRoute>
                    <Conversations />
                  </ProtectedRoute>
                }
              />
              {/* Old per-channel routes fold into the single unified inbox. */}
              <Route path="/conversations/sms" element={<Navigate to="/conversations" replace />} />
              <Route path="/conversations/email" element={<Navigate to="/conversations" replace />} />
              <Route
                path="/conversations/:contactId"
                element={
                  <ProtectedRoute>
                    <ConversationDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/today"
                element={
                  <ProtectedRoute>
                    <Today />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/billing"
                element={
                  <ProtectedRoute>
                    <Billing />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ProtectedRoute>
                    <Calendar />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <Notifications />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              {/* Owner-only inside the component (staff are redirected home);
                  the backend also enforces owner-only on every /api/staff call. */}
              <Route
                path="/team"
                element={
                  <ProtectedRoute>
                    <Team />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/comms"
                element={
                  <ProtectedRoute>
                    <Comms />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/lead/:id"
                element={
                  <ProtectedRoute>
                    <LeadDetail />
                  </ProtectedRoute>
                }
              />
              {/* Automations: built and live (read-only). */}
              <Route
                path="/operations/automations"
                element={
                  <ProtectedRoute>
                    <Automations />
                  </ProtectedRoute>
                }
              />
              {/* Skeleton surfaces: a home (route + sidebar row) exists ahead of
                  the feature; each renders the shared "coming soon" screen. */}
              {/* The read-only Sales Overview kanban is retired; Pipeline is a Leads tab now. */}
              <Route path="/sales/overview" element={<Navigate to="/sales/leads" replace />} />
              {/* Reactivation is its own Marketing section now; old paths redirect in. */}
              <Route path="/sales/reactivation" element={<Navigate to="/marketing/reactivation" replace />} />
              <Route path="/marketing/campaigns/reactivation" element={<Navigate to="/marketing/reactivation" replace />} />
              <Route path="/sales/scripts" element={<ProtectedRoute><ComingSoon title="Sales Scripts" blurb="Your call and message scripts, ready to use. Coming soon." /></ProtectedRoute>} />
              <Route path="/operations/reports" element={<ProtectedRoute><ComingSoon title="Reports & Analytics" blurb="Performance across ads, leads, and revenue in one place. Coming soon." /></ProtectedRoute>} />
              {/* Overview = the designed "at a glance" cockpit (AdsOverview). The raw
                  media-buyer dashboard stays reachable at /paid-ads for the deep dive. */}
              <Route path="/marketing/paid-ads" element={<ProtectedRoute><AdsOverview /></ProtectedRoute>} />
              <Route path="/marketing/paid-ads/creatives" element={<ProtectedRoute><AdsCreatives /></ProtectedRoute>} />
              {/* A marketing channel never hosts a lead list; ad leads live in Leads, filtered. */}
              <Route path="/marketing/paid-ads/leads" element={<Navigate to="/sales/leads" replace />} />
              <Route path="/marketing/paid-ads/stats" element={<ProtectedRoute><AdsInsights /></ProtectedRoute>} />
              {/* Funnel tab retired; old URL redirects to the Paid Ads overview. */}
              <Route path="/marketing/paid-ads/funnel" element={<Navigate to="/marketing/paid-ads" replace />} />
              <Route path="/marketing/paid-ads/media" element={<ProtectedRoute><AdsMedia /></ProtectedRoute>} />
              <Route path="/marketing/reviews" element={<ProtectedRoute><ReviewsOverview /></ProtectedRoute>} />
              <Route path="/marketing/reviews/pipeline" element={<ProtectedRoute><ReviewsPipeline /></ProtectedRoute>} />
              <Route path="/marketing/reviews/requests" element={<ProtectedRoute><ReviewsRequests /></ProtectedRoute>} />
              {/* All Reviews + Reputation Report tabs retired; old URLs fall back to Overview. */}
              <Route path="/marketing/reviews/all" element={<Navigate to="/marketing/reviews" replace />} />
              <Route path="/marketing/reviews/report" element={<Navigate to="/marketing/reviews" replace />} />
              {/* Campaigns is retired; Overview/all/insights redirect into Commercial Outreach.
                  Audiences stays parked but reachable. Reactivation moved to its own section. */}
              <Route path="/marketing/campaigns" element={<Navigate to="/marketing/outreach" replace />} />
              <Route path="/marketing/campaigns/all" element={<Navigate to="/marketing/outreach" replace />} />
              <Route path="/marketing/campaigns/audiences" element={<ProtectedRoute><CampaignsAudiences /></ProtectedRoute>} />
              <Route path="/marketing/campaigns/insights" element={<Navigate to="/marketing/outreach" replace />} />
              {/* Commercial Outreach */}
              <Route path="/marketing/outreach" element={<ProtectedRoute><OutreachOverview /></ProtectedRoute>} />
              <Route path="/marketing/outreach/schedule" element={<ProtectedRoute><OutreachSchedule /></ProtectedRoute>} />
              <Route path="/marketing/outreach/emails" element={<ProtectedRoute><OutreachEmails /></ProtectedRoute>} />
              <Route path="/marketing/outreach/data" element={<ProtectedRoute><OutreachData /></ProtectedRoute>} />
              <Route path="/marketing/outreach/sms" element={<ProtectedRoute><OutreachSms /></ProtectedRoute>} />
              {/* Reactivation */}
              <Route path="/marketing/reactivation" element={<ProtectedRoute><Reactivation /></ProtectedRoute>} />
              <Route path="/marketing/reactivation/pipeline" element={<ProtectedRoute><ReactivationPipeline /></ProtectedRoute>} />
              <Route path="/marketing/reactivation/data" element={<ProtectedRoute><ReactivationData /></ProtectedRoute>} />
              {/* Messages tab retired; old URL falls back to the Reactivation overview. */}
              <Route path="/marketing/reactivation/messages" element={<Navigate to="/marketing/reactivation" replace />} />
              {/* Group Outreach */}
              <Route path="/marketing/groups" element={<ProtectedRoute><GroupOutreachOverview /></ProtectedRoute>} />
              <Route path="/marketing/website" element={<ProtectedRoute><WebsiteOverview /></ProtectedRoute>} />
              <Route path="/marketing/website/pages" element={<ProtectedRoute><WebsitePages /></ProtectedRoute>} />
              <Route path="/marketing/website/request" element={<Navigate to="/marketing/website/pages" replace />} />
              <Route path="/marketing/website/insights" element={<ProtectedRoute><WebsiteInsights /></ProtectedRoute>} />
              <Route path="/marketing/social" element={<ProtectedRoute><SocialOverview /></ProtectedRoute>} />
              <Route path="/marketing/social/ideas" element={<ProtectedRoute><SocialIdeas /></ProtectedRoute>} />
              <Route path="/marketing/social/calendar" element={<ProtectedRoute><SocialCalendar /></ProtectedRoute>} />
              <Route path="/marketing/social/posts" element={<ProtectedRoute><SocialPosts /></ProtectedRoute>} />
              <Route path="/marketing/social/insights" element={<ProtectedRoute><SocialInsights /></ProtectedRoute>} />
              {/* Command home: the whole-business Theory-of-Constraints view. */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminCommand />
                  </AdminRoute>
                }
              />
              {/* Clients now live inside Service Delivery. The old standalone
                  list route redirects to Command; client detail pages stay
                  (reused as the cockpit Config tab). */}
              <Route path="/admin/clients" element={<Navigate to="/admin" replace />} />
              <Route
                path="/admin/clients/:id"
                element={
                  <AdminRoute>
                    <AdminClientDetail />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/onboarding"
                element={
                  <AdminRoute>
                    <AdminOnboarding />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/onboarding/:id"
                element={
                  <AdminRoute>
                    <AdminOnboardingDetail />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/tasks"
                element={
                  <AdminRoute>
                    <AdminTasks />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/assets"
                element={
                  <AdminRoute>
                    <Assets />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/build"
                element={
                  <AdminRoute>
                    <AdminBuild />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/plans"
                element={
                  <AdminRoute>
                    <Plans />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/sops"
                element={
                  <AdminRoute>
                    <AdminSops />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/sops/:cat/:slug"
                element={
                  <AdminRoute>
                    <AdminSopDetail />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/messages"
                element={
                  <AdminRoute>
                    <AdminMessages />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/infrastructure"
                element={
                  <AdminRoute>
                    <AdminInfrastructure />
                  </AdminRoute>
                }
              />
              {/* Service Delivery > Paid Ads: the old standalone ad tracker
                  is retired, replaced by the Fulfillment cockpit's Paid Ads tab. */}
              <Route path="/admin/ads" element={<Navigate to="/admin/delivery" replace />} />
              <Route path="/admin/ads/:clientId" element={<Navigate to="/admin/delivery" replace />} />
              {/* Service Delivery: the client roster and per-account cockpits. */}
              <Route
                path="/admin/delivery"
                element={
                  <AdminRoute>
                    <AdminDelivery />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/delivery/:tenantId"
                element={
                  <AdminRoute>
                    <DeliveryCockpit />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <AdminRoute>
                    <AdminSettings />
                  </AdminRoute>
                }
              />
              {/* Legacy 6-pillar ids fold into the new 4-pillar spine. Static
                  segments out-rank the :pillarId route, so these win. */}
              <Route path="/admin/pillar/outreach" element={<Navigate to="/admin/pillar/acquisition" replace />} />
              <Route path="/admin/pillar/onboarding" element={<Navigate to="/admin/pillar/sales" replace />} />
              <Route path="/admin/pillar/service" element={<Navigate to="/admin/delivery" replace />} />
              <Route path="/admin/pillar/retention" element={<Navigate to="/admin/delivery" replace />} />
              <Route path="/admin/pillar/delivery" element={<Navigate to="/admin/delivery" replace />} />
              {/* Old lane/tab deep links drop back to the pillar page. */}
              <Route path="/admin/pillar/:pillarId/lane/:laneId" element={<PillarRedirect />} />
              <Route path="/admin/pillar/:pillarId/:tabId" element={<PillarRedirect />} />
              {/* The pillar page itself (acquisition / sales / operations). */}
              <Route
                path="/admin/pillar/:pillarId"
                element={
                  <AdminRoute>
                    <AdminPillarPage />
                  </AdminRoute>
                }
              />
              <Route path="*" element={<RootRedirect />} />
            </Routes>
            </div>
            </TourProvider>
            </ChatProvider>
          </ToastProvider>
          </NowProvider>
          </LeadsProvider>
          </PipelinesProvider>
        </ClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
