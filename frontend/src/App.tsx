import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import type { User } from "firebase/auth";
import { AppShell } from "./components/AppShell";
import { Skeleton } from "./components/ui";
import { firebaseEnabled, onAuthChange } from "./lib/auth";
import Landing from "./pages/Landing";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const AirMap = lazy(() => import("./pages/AirMap"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Community = lazy(() => import("./pages/Community"));
const Impact = lazy(() => import("./pages/Impact"));
const Alerts = lazy(() => import("./pages/Alerts"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const SignIn = lazy(() => import("./pages/SignIn"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(firebaseEnabled ? undefined : null);
  useEffect(() => (firebaseEnabled ? onAuthChange(setUser) : undefined), []);
  if (!firebaseEnabled) return <>{children}</>;
  if (user === undefined)
    return (
      <div className="grid min-h-screen place-items-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  if (!user)
    return (
      <Suspense fallback={null}>
        <SignIn />
      </Suspense>
    );
  return <>{children}</>;
}

const page = (el: ReactNode) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/app"
        element={
          <AuthGate>
            <AppShell />
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
