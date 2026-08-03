import Link from "next/link";
import { SignalSlashIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

export default function OfflineFallbackPage() {
  return (
    <div className="min-h-screen bg-bg-app flex flex-col items-center justify-center p-6 text-center">
      <div className="h-16 w-16 rounded-full bg-warning-50 border border-warning-200 flex items-center justify-center mb-4">
        <SignalSlashIcon className="h-8 w-8 text-warning-600" />
      </div>
      <h1 className="text-2xl font-bold text-txt-primary mb-2">You are currently offline</h1>
      <p className="text-txt-secondary text-sm max-w-md mb-6">
        This page was not previously cached for offline use. You can return to the scanner or search sheets which operate completely offline.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Link
          href="/volunteer/qr-scan"
          className="inline-flex items-center justify-center h-11 px-4 font-semibold text-white bg-teal-600 rounded-lg shadow hover:bg-teal-700 transition"
        >
          Open QR Scanner
        </Link>
        <button
          onClick={() => typeof window !== "undefined" && window.location.reload()}
          className="inline-flex items-center justify-center h-11 px-4 font-semibold text-txt-primary bg-bg-surface border border-border-default rounded-lg hover:bg-bg-subtle transition"
        >
          <ArrowPathIcon className="h-4 w-4 mr-2" />
          Retry Connection
        </button>
      </div>
    </div>
  );
}
