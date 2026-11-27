import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { User } from "firebase/auth";
import { LoadingRegion, Skeleton } from "./components/ui";
import { firebaseEnabled, onAuthChange } from "./lib/auth";
import { titleForPath, useDocumentTitle } from "./lib/useDocumentTitle";

// The app opens first; the product overview (former landing page) lives at /about and is
// linked from the "How to use" guide in the app header.
const Landing = lazy(() => import("./pages/landing/LandingPage"));
const AppShell = lazy(() => import("./components/AppShell").then((m) => ({ default: m.AppShell })));
const Dashboard = lazy(() => import("./pages/dashboard/DashboardPage"));
const AirMap = lazy(() => import("./pages/airmap/AirMapPage"));
const Assistant = lazy(() => import("./pages/assistant/AssistantPage"));
const Community = lazy(() => import("./pages/community/CommunityPage"));
const Impact = lazy(() => import("./pages/impact/ImpactPage"));
const Alerts = lazy(() => import("./pages/alerts/AlertsPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));
const SignIn = lazy(() => import("./pages/SignIn"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageFallback() {
  return (
    <LoadingRegion label="Loading page…" className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-72" />
    </LoadingRegion>
  );
}

function FullScreenFallback({ label }: { label: string }) {
  return (
    <div className="grid min-h-screen place-items-center">
      <Skeleton className="h-10 w-48" label={label} />
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(firebaseEnabled ? undefined : null);
  useEffect(() => (firebaseEnabled ? onAuthChange(setUser) : undefined), []);
  if (!firebaseEnabled) return <>{children}</>;
  if (user === undefined) return <FullScreenFallback label="Checking sign-in…" />;
  if (!user)
    return (
      <Suspense fallback={<FullScreenFallback label="Loading sign-in…" />}>
        <SignIn />
      </Suspense>
    );
  return <>{children}</>;
}

const page = (el: ReactNode) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

export default function App() {
  const { pathname } = useLocation();
  useDocumentTitle(titleForPath(pathname));
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route
        path="/about"
        element={
          <Suspense fallback={<FullScreenFallback label="Loading…" />}>
            <Landing />
          </Suspense>
        }
      />
      <Route
        path="/app"
        element={
          <AuthGate>
            <Suspense fallback={<FullScreenFallback label="Loading AIRenv…" />}>
              <AppShell />
            </Suspense>
          </AuthGate>
        }
      >
        <Route index element={page(<Dashboard />)} />
        <Route path="map" element={page(<AirMap />)} />
        <Route path="assistant" element={page(<Assistant />)} />
        <Route path="community" element={page(<Community />)} />
        <Route path="impact" element={page(<Impact />)} />
        <Route path="alerts" element={page(<Alerts />)} />
        <Route path="settings" element={page(<SettingsPage />)} />
      </Route>
      <Route path="*" element={page(<NotFound />)} />
    </Routes>
  );
}
