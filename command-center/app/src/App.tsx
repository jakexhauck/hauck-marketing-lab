import { useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./context/ThemeContext";
import { ClientProvider } from "./context/ClientContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LeadsProvider } from "./context/LeadsContext";
import { PipelinesProvider } from "./context/PipelinesContext";
import Login from "./routes/Login";
import Home from "./routes/Home";
import AllFeatures from "./routes/AllFeatures";
import Sales from "./routes/sales/Sales";
import Dashboard from "./routes/Dashboard";
import { PaidAds } from "./routes/PaidAds";
import ReviewsRequests from "./routes/reviews/ReviewsRequests";
import ReviewsPipeline from "./routes/reviews/ReviewsPipeline";
import ReviewsChats from "./routes/reviews/ReviewsChats";
import { Activity } from "./routes/Activity";
import Contacts from "./routes/Contacts";
import ContactDetail from "./routes/ContactDetail";
import Customers from "./routes/Customers";
import CustomerDetail from "./routes/CustomerDetail";
import CloseOutJob from "./routes/sales/CloseOutJob";
import Conversations from "./routes/Conversations";
import ConversationDetail from "./routes/ConversationDetail";
import LeadDetail from "./routes/LeadDetail";
import Today from "./routes/Today";
import Billing from "./routes/Billing";
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
import AdsDashboard from "./routes/paid-ads/AdsDashboard";
import AdsLeadTracker from "./routes/paid-ads/AdsLeadTracker";
import AdsMetaData from "./routes/paid-ads/AdsMetaData";
import AdsCreatives from "./routes/paid-ads/AdsCreatives";
import Organic from "./routes/organic/Organic";
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
import AdminLayout, { adminHomeFor } from "./routes/admin/AdminLayout";
import { effectiveAdminRole, type AdminRole } from "./lib/adminRoles";
import AdminClientNew from "./routes/admin/AdminClientNew";
import AdminNewClient from "./routes/admin/AdminNewClient";
import AdminCommand from "./routes/admin/AdminCommand";
import AdminApps from "./routes/admin/AdminApps";
import AdminOnboarding from "./routes/admin/AdminOnboarding";
import { clientSetupPath } from "./lib/onboardingViews";
import FulfillmentPage from "./routes/admin/FulfillmentPage";
import {
  DEFAULT_FULFILLMENT_PAGE,
  fulfillmentPath,
  legacyFulfillmentPage,
} from "./lib/fulfillmentPages";
import SetterSuite from "./routes/admin/SetterSuite";
import PillarPage from "./routes/admin/PillarPage";
import AdminSettings from "./routes/admin/AdminSettings";
import AdminAudit from "./routes/admin/AdminAudit";
import AdminTeam from "./routes/admin/AdminTeam";
import Shell from "./components/Shell";
import IdentityPicker from "./components/IdentityPicker";
import SetupHoldingScreen from "./components/client/SetupHoldingScreen";
import SocialConnectGate from "./components/client/SocialConnectGate";
import { useSocialGate } from "./hooks/useApi";
import OfflineBanner from "./components/OfflineBanner";
import PreviewBanner from "./components/PreviewBanner";
import { isPreviewFrame } from "./lib/previewFrame";
import DemoBanner from "./components/DemoBanner";
import ScrollToTop from "./components/ScrollToTop";
import { ToastProvider } from "./context/ToastContext";
import { NowProvider } from "./context/NowContext";
import { ChatProvider } from "./context/ChatContext";
import { TourProvider } from "./context/TourContext";
import TourOverlay from "./components/tour/TourOverlay";
import type { ReactNode } from "react";
import { CLIENT_HOME } from "./lib/nav";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, currentUser, needsIdentity, setIdentity, isAdmin, crmConnected } =
    useAuth();
  if (status === "loading") return null;
  // A super-admin has no tenant and never belongs on a client surface.
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (!currentUser) return <Navigate to="/login" replace />;
  // Signed in, but their GoHighLevel sub-account does not exist yet. Ahead of
  // the identity picker: choosing who you are is pointless in an app you cannot
  // open yet. The API refuses every tenant surface in this state regardless, so
  // this is the presentable version of a gate that is already being enforced.
  //
  // This used to read an onboarding_status flag an admin flipped by hand. It
  // now reads the only thing that actually matters, so it clears itself the
  // moment the sub-account is wired and the client goes straight to connecting
  // their socials (Jake, 2026-08-15).
  if (!crmConnected) return <SetupHoldingScreen />;
  // One-time "who are you?" step after the shared-password login. Skipping
  // (or any failure) falls back to the hardcoded-owner default in AuthContext.
  if (needsIdentity) {
    return (
      <Shell>
        <IdentityPicker onPick={setIdentity} />
      </Shell>
    );
  }
  return <SocialGateGuard>{children}</SocialGateGuard>;
}

// The blocking social-connect gate (0094). Split out so ProtectedRoute keeps its
// no-hooks shape: every branch above is a plain early return, and adding a query
// there would run it for admins and setup-state clients too.
//
// An early return rather than an overlay, so there is genuinely no app behind it
// to reach. While the answer is unknown it renders nothing: flashing the app for
// one frame and then yanking it away is worse than a beat of blank.
function SocialGateGuard({ children }: { children: ReactNode }) {
  const gate = useSocialGate();
  if (gate.isLoading) return null;
  // A failed gate check must not lock anybody out. The server already fails open
  // on its own errors; this covers the request never arriving at all.
  if (gate.isError || !gate.data) return <>{children}</>;
  if (gate.data.blocked) return <SocialConnectGate gate={gate.data} />;
  return <>{children}</>;
}

// An admin surface, optionally restricted to particular roles (0047). `roles`
// left out means every signed-in admin may see it. The API enforces the same
// boundary independently, so this only decides what renders.
function AdminRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: AdminRole[];
}) {
  const { status, isAdmin, preview, admin } = useAuth();
  if (status === "loading") return null;
  // Starting a client preview swaps the admin session for a read-only tenant
  // session, so isAdmin flips to false while this admin route is still mounted.
  // Send the admin into the client app (the preview banner offers the way back)
  // instead of bouncing to /login.
  if (preview) return <Navigate to="/home" replace />;
  if (!isAdmin) return <Navigate to="/login" replace />;
  const role = effectiveAdminRole(admin?.role);
  // A role that cannot use this page goes to its own home rather than /login:
  // they are signed in correctly, they are simply somewhere they do not belong.
  if (roles && !roles.includes(role)) {
    return <Navigate to={adminHomeFor(role)} replace />;
  }
  return <AdminLayout>{children}</AdminLayout>;
}

// /admin/onboarding/:tenantId and its old /setup child both became one view of
// the Onboarding page. Reads the tenant out of the path and hands it over as the
// selected client.
function OnboardingClientRedirect() {
  const { tenantId } = useParams<{ tenantId: string }>();
  return <Navigate to={tenantId ? clientSetupPath(tenantId) : "/admin/onboarding"} replace />;
}

// Old pillar sub-routes (lane workspaces and tab deep links) collapse to the
// pillar page now that lanes and tabs are gone. Reads the :pillarId and sends
// the request up one level.
function PillarRedirect() {
  const { pillarId } = useParams<{ pillarId: string }>();
  return <Navigate to={`/admin/pillar/${pillarId ?? ""}`} replace />;
}

// The retired per-client cockpit (/admin/delivery/:tenantId?tab=&sub=). Its
// service tabs are now pages, so the old address maps across exactly: the tab
// becomes the page, the tenant becomes the ?client=, and the sub-tab is kept.
// An unknown or missing tab lands on Overview, which is where the cockpit
// opened anyway.
function DeliveryCockpitRedirect() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams] = useSearchParams();
  const page = legacyFulfillmentPage(searchParams.get("tab"));
  return (
    <Navigate to={fulfillmentPath(page, tenantId, searchParams.get("sub"))} replace />
  );
}

// The retired standalone client hub (/admin/clients/:id), which was the config
// cards and nothing else. Those cards sit under Fulfillment > Management now.
function ClientDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={fulfillmentPath("management", id)} replace />;
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
    return <Navigate to={CLIENT_HOME} replace />;
  }
  // Live sessions (clients) stay logged in and skip straight to the
  // dashboard. Test sessions (internal) always land on the login screen.
  if (status === "authenticated" && mode === "live") {
    return <Navigate to={CLIENT_HOME} replace />;
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
            <OfflineBanner />
            {/* Inside the admin Software tab's preview frame the surrounding
                cockpit already says whose app this is, and there is no session
                to "exit" (the frame holds a token, not a cookie), so the banner
                would be both redundant and a dead end. */}
            {!isPreviewFrame() && <PreviewBanner />}
            <DemoBanner />
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
              {/* The whole Leads section retired 2026-07-23 into Paid Ads. Each
                  old path lands on the tab that replaced it: the lead lists go
                  to the Lead Tracker, not the Dashboard, so a bookmark that used
                  to show leads still shows leads. */}
              <Route path="/sales/leads" element={<Navigate to="/marketing/paid-ads/leads" replace />} />
              <Route path="/sales/leads/trash" element={<Navigate to="/marketing/paid-ads/leads" replace />} />
              <Route path="/sales/leads/organic" element={<Navigate to="/marketing/paid-ads/leads" replace />} />
              <Route path="/sales/leads/pipeline" element={<Navigate to="/marketing/paid-ads/leads" replace />} />
              <Route path="/sales/leads/paid-ads" element={<Navigate to="/marketing/paid-ads" replace />} />
              <Route path="/sales/forms" element={<Navigate to="/marketing/paid-ads/leads" replace />} />
              <Route path="/sales/chat" element={<Navigate to="/marketing/paid-ads/leads" replace />} />
              <Route path="/sales/paid-ads" element={<Navigate to="/marketing/paid-ads" replace />} />
              {/* ONE route with a splat, not two. Leads and Schedule are
                  separate sidebar rows but the same mounted component: a
                  half-finished booking lives in <Sales>'s state and is carried
                  from Leads to Schedule to pick a slot, and two sibling routes
                  would unmount it on the way and lose the booking.

                  The static /sales/* redirects above outrank this: React Router
                  ranks a literal segment over a splat regardless of order. */}
              <Route
                path="/sales/*"
                element={
                  <ProtectedRoute>
                    <Sales />
                  </ProtectedRoute>
                }
              />
              <Route path="/sales/jobs" element={<Navigate to="/sales/schedule" replace />} />
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
                path="/customers"
                element={
                  <ProtectedRoute>
                    <Customers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers/:contactId"
                element={
                  <ProtectedRoute>
                    <CustomerDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/leads/close-out/:opportunityId"
                element={
                  <ProtectedRoute>
                    <CloseOutJob />
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
              <Route path="/handoffs" element={<Navigate to="/sales?tab=leads" replace />} />
              <Route path="/handoffs/:id" element={<Navigate to="/sales?tab=leads" replace />} />
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
              {/* The calendar now lives inside the Jobs tab as a set of views. */}
              <Route path="/calendar" element={<Navigate to="/sales/jobs" replace />} />
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
              {/* Paid Ads = the client tracking sheet: Dashboard (the landing
                  page, as the workbook opened), Lead Tracker, Meta Data. Media
                  was dropped 2026-07-30 as it was never in the sheet; Pipeline
                  Stats and How to Use are not being rebuilt. The raw media-buyer
                  dashboard stays at /paid-ads. */}
              <Route path="/marketing/paid-ads" element={<ProtectedRoute><AdsDashboard /></ProtectedRoute>} />
              <Route path="/marketing/paid-ads/leads" element={<ProtectedRoute><AdsLeadTracker /></ProtectedRoute>} />
              <Route path="/marketing/paid-ads/meta" element={<ProtectedRoute><AdsMetaData /></ProtectedRoute>} />
              {/* Creatives points at the client's Drive folder. This path used to
                  redirect to the dashboard; it is a real page again. */}
              <Route path="/marketing/paid-ads/creatives" element={<ProtectedRoute><AdsCreatives /></ProtectedRoute>} />
              {/* Website leads. The nav row is data-gated (see NavItem.dataGate)
                  but the route stays registered for everyone: a client without an
                  Organic pipeline simply gets the empty state if they land here
                  from a bookmark, rather than a dead URL. */}
              <Route path="/organic" element={<ProtectedRoute><Organic /></ProtectedRoute>} />
              {/* Old Paid Ads URLs fold into the current tabs. */}
              <Route path="/marketing/paid-ads/media" element={<Navigate to="/marketing/paid-ads" replace />} />
              <Route path="/marketing/paid-ads/pipeline-stats" element={<Navigate to="/marketing/paid-ads" replace />} />
              <Route path="/marketing/paid-ads/how-to" element={<Navigate to="/marketing/paid-ads" replace />} />
              <Route path="/marketing/paid-ads/stats" element={<Navigate to="/marketing/paid-ads" replace />} />
              <Route path="/marketing/paid-ads/funnel" element={<Navigate to="/marketing/paid-ads" replace />} />
              {/* Overview retired; Google Reviews opens on the Review Pipeline. */}
              <Route path="/marketing/reviews" element={<Navigate to="/marketing/reviews/pipeline" replace />} />
              <Route path="/marketing/reviews/pipeline" element={<ProtectedRoute><ReviewsPipeline /></ProtectedRoute>} />
              <Route path="/marketing/reviews/requests" element={<ProtectedRoute><ReviewsRequests /></ProtectedRoute>} />
              <Route path="/marketing/reviews/chats" element={<ProtectedRoute><ReviewsChats /></ProtectedRoute>} />
              {/* All Reviews + Reputation Report tabs retired; old URLs fall back to the pipeline. */}
              <Route path="/marketing/reviews/all" element={<Navigate to="/marketing/reviews/pipeline" replace />} />
              <Route path="/marketing/reviews/report" element={<Navigate to="/marketing/reviews/pipeline" replace />} />
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
                  <AdminRoute roles={["owner"]}>
                    <AdminCommand />
                  </AdminRoute>
                }
              />
              {/* Clients now live inside Service Delivery. The old standalone
                  list route redirects to Command; client detail pages stay
                  (reused as the cockpit Config tab). */}
              {/* The Command hub: the phone app launcher (raised center tab). */}
              <Route
                path="/admin/apps"
                element={
                  <AdminRoute roles={["owner"]}>
                    <AdminApps />
                  </AdminRoute>
                }
              />
              {/* Clients is a top-level rail row again (2026-08-23), so this old
                  path lands on it rather than on Command, which no longer has a
                  row to come back from. */}
              <Route
                path="/admin/clients"
                element={<Navigate to="/admin/pillar/operations?tab=clients" replace />}
              />
              {/* Declared above /admin/clients/:id or React Router hands "new"
                  to the detail page as a tenant id. The launchpad is the page
                  Jake opens when someone signs; the three-step form behind
                  /manual is the rare path, for a client with no intake form. */}
              <Route
                path="/admin/clients/new"
                element={
                  <AdminRoute roles={["owner"]}>
                    <AdminNewClient />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/clients/new/manual"
                element={
                  <AdminRoute roles={["owner"]}>
                    <AdminClientNew />
                  </AdminRoute>
                }
              />
              {/* The standalone client hub is retired: its config cards are the
                  Fulfillment > Config page, on the same shared panel. */}
              <Route path="/admin/clients/:id" element={<ClientDetailRedirect />} />
              {/* Retired admin surfaces (SOPs, Onboarding, Build, Plans, Assets,
                  Messages, Infrastructure, standalone Tasks) are gone; their
                  work now lives inside the pillar tab bars. Old URLs fall
                  through to RootRedirect below. */}
              {/* Service Delivery > Paid Ads: the old standalone ad tracker
                  is retired, replaced by the Fulfillment Paid Ads page. */}
              <Route
                path="/admin/ads"
                element={<Navigate to="/admin/fulfillment/paid-ads" replace />}
              />
              <Route
                path="/admin/ads/:clientId"
                element={<Navigate to="/admin/fulfillment/paid-ads" replace />}
              />

              {/* Fulfillment: one route per service page. The client is a
                  picker on the page (?client=), not part of the address, so
                  switching client keeps you on the page you were reading. */}
              <Route
                path="/admin/fulfillment"
                element={<Navigate to={`/admin/fulfillment/${DEFAULT_FULFILLMENT_PAGE}`} replace />}
              />
              <Route
                path="/admin/fulfillment/:page"
                element={
                  <AdminRoute roles={["owner"]}>
                    <FulfillmentPage />
                  </AdminRoute>
                }
              />
              {/* The roster landing and the per-client cockpit it fed. */}
              <Route
                path="/admin/delivery"
                element={<Navigate to={`/admin/fulfillment/${DEFAULT_FULFILLMENT_PAGE}`} replace />}
              />
              <Route path="/admin/delivery/:tenantId" element={<DeliveryCockpitRedirect />} />
              {/* Fulfillment > Onboarding: standing a new client up. The
                  roster, then one client's whole onboarding record. */}
              <Route
                path="/admin/onboarding"
                element={
                  <AdminRoute roles={["owner"]}>
                    <AdminOnboarding />
                  </AdminRoute>
                }
              />
              {/* Onboarding is one page in two views (?view=setup|management),
                  so the per-client addresses it used to have redirect into the
                  setup view with that client selected. Old links, the pillar
                  lanes and anything bookmarked all still land. */}
              <Route
                path="/admin/onboarding/:tenantId/setup"
                element={<OnboardingClientRedirect />}
              />
              <Route
                path="/admin/onboarding/:tenantId"
                element={<OnboardingClientRedirect />}
              />

              {/* Retired admin surfaces (SOPs, Onboarding, Build, Plans, Assets,
                  Messages, Infrastructure, standalone Tasks) are gone; their
                  work now lives inside the pillar tab bars. Old URLs fall
                  through to RootRedirect below. */}
              {/* Service Delivery > Paid Ads: the old standalone ad tracker
                  is retired, replaced by the Fulfillment Paid Ads page. */}
              <Route
                path="/admin/ads"
                element={<Navigate to="/admin/fulfillment/paid-ads" replace />}
              />
              <Route
                path="/admin/ads/:clientId"
                element={<Navigate to="/admin/fulfillment/paid-ads" replace />}
              />

              {/* Fulfillment: one route per service page. The client is a
                  picker on the page (?client=), not part of the address, so
                  switching client keeps you on the page you were reading. */}
              <Route
                path="/admin/fulfillment"
                element={<Navigate to={`/admin/fulfillment/${DEFAULT_FULFILLMENT_PAGE}`} replace />}
              />
              <Route
                path="/admin/fulfillment/:page"
                element={
                  <AdminRoute roles={["owner"]}>
                    <FulfillmentPage />
                  </AdminRoute>
                }
              />
              {/* The roster landing and the per-client cockpit it fed. */}
              <Route
                path="/admin/delivery"
                element={<Navigate to={`/admin/fulfillment/${DEFAULT_FULFILLMENT_PAGE}`} replace />}
              />
              <Route path="/admin/delivery/:tenantId" element={<DeliveryCockpitRedirect />} />
              {/* Fulfillment > Onboarding: standing a new client up. The
                  roster, then one client's whole onboarding record. */}
              <Route
                path="/admin/onboarding"
                element={
                  <AdminRoute roles={["owner"]}>
                    <AdminOnboarding />
                  </AdminRoute>
                }
              />
              {/* Sales: the Setter Suite, one client's leads worked across
                  every one of that client's pipelines. */}
              <Route
                path="/admin/setter"
                element={
                  <AdminRoute roles={["owner", "setter"]}>
                    <SetterSuite />
                  </AdminRoute>
                }
              />
              {/* Who has a login to this console, and what their role opens. */}
              <Route
                path="/admin/team"
                element={
                  <AdminRoute roles={["owner"]}>
                    <AdminTeam />
                  </AdminRoute>
                }
              />
              {/* The caller's old landing page. Kept as a redirect so an early
                  bookmark still lands somewhere real. */}
              <Route
                path="/admin/calling"
                element={<Navigate to="/admin/pillar/acquisition?tab=cold-call" replace />}
              />
              <Route
                path="/admin/settings"
                element={
                  <AdminRoute roles={["owner"]}>
                    <AdminSettings />
                  </AdminRoute>
                }
              />
              {/* The admin audit log. Reached from Settings, not the sidebar:
                  occasional-use, and the sidebar zones are settled. */}
              <Route
                path="/admin/audit"
                element={
                  <AdminRoute roles={["owner"]}>
                    <AdminAudit />
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
              {/* The standalone Tasks page folded into the Operations pillar. */}
              <Route path="/admin/tasks" element={<Navigate to="/admin/pillar/operations?tab=tasks" replace />} />
              {/* Old lane/tab deep links drop back to the pillar page. */}
              <Route path="/admin/pillar/:pillarId/lane/:laneId" element={<PillarRedirect />} />
              <Route path="/admin/pillar/:pillarId/:tabId" element={<PillarRedirect />} />
              {/* The pillar page itself (acquisition / sales / operations):
                  a Bento Bold header + per-pillar tab bar driven by ?tab=. */}
              {/* A cold caller reaches Acquisition > Cold Call and nothing
                  else: the pillar page renders only the tab they can use, and
                  the API is what actually holds the line. */}
              <Route
                path="/admin/pillar/:pillarId"
                element={
                  <AdminRoute roles={["owner", "cold_caller"]}>
                    <PillarPage />
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
