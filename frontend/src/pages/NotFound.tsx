import { Link } from "react-router-dom";
import { Aurora, Logo } from "../components/effects";

export default function NotFound() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-4 text-center">
      <Aurora />
      <div className="relative">
        <Logo className="justify-center" />
        <p className="mt-8 font-display text-6xl font-semibold text-gradient">404</p>
        <p className="mt-2 text-sm text-muted">This page drifted away.</p>
        <Link to="/app" className="mt-6 inline-block rounded-xl bg-emerald/15 px-4 py-2 text-sm text-mint hover:bg-emerald/25">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
