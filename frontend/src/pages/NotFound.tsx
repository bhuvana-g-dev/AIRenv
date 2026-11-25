import { Link } from "react-router-dom";
import { Aurora, Logo } from "../components/effects";

export default function NotFound() {
  return (
    <main id="main-content" className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-4 text-center">
      <Aurora />
      <div className="relative">
        <Link to="/" aria-label="AIRenv home" className="inline-flex rounded-xl">
          <Logo className="justify-center" />
        </Link>
        <h1 className="mt-8 font-display text-6xl font-semibold">
          <span className="text-gradient" aria-hidden="true">
            404
          </span>
          <span className="sr-only">Page not found (error 404)</span>
        </h1>
        <p className="mt-2 text-sm text-muted">This page drifted away.</p>
        <Link to="/app" className="mt-6 inline-block rounded-xl bg-emerald/15 px-4 py-2 text-sm text-mint hover:bg-emerald/25">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
