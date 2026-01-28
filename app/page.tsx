"use client";

import { useState, useCallback } from "react";
import { uploadWorkout } from "./actions";

export default function HomePage() {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle"
  );
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setStatus("uploading");
      setError(null);

      const formData = new FormData(e.currentTarget);
      const result = await uploadWorkout(formData);

      if (result.success) {
        const fullUrl = `${window.location.origin}${result.url}`;
        setShareUrl(fullUrl);
        setStatus("done");

        try {
          await navigator.clipboard.writeText(fullUrl);
          setCopied(true);
        } catch {
          // Clipboard API may not be available
        }
      } else {
        setError(result.error);
        setStatus("error");
      }
    },
    []
  );

  return (
    <main className="max-w-md mx-auto p-6 min-h-screen">
      <h1 className="text-2xl font-bold mb-2">Share Garmin Workout</h1>
      <p className="text-gray-600 mb-6">
        Upload a workout file to get a shareable link.
      </p>

      {status === "done" && shareUrl ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-800 mb-2">
              {copied ? "Link copied to clipboard!" : "Share this link:"}
            </p>
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="w-full p-2 border rounded text-sm bg-white"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>
          <button
            onClick={() => {
              setStatus("idle");
              setShareUrl(null);
              setCopied(false);
            }}
            className="text-blue-600 text-sm hover:underline"
          >
            Upload another
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                name="file"
                accept=".fit,.json"
                required
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  file:cursor-pointer cursor-pointer"
              />
              <p className="text-xs text-gray-400 mt-2">
                .FIT (from watch) or .JSON (from Chrome extension)
              </p>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={status === "uploading"}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === "uploading" ? "Uploading..." : "Generate Share Link"}
            </button>
          </form>

          <details className="mt-8 text-sm text-gray-600">
            <summary className="cursor-pointer font-medium hover:text-gray-800">
              How do I get my workout file?
            </summary>
            <div className="mt-3 space-y-4 pl-1">
              <div>
                <p className="font-medium text-gray-800">
                  Option 1: Chrome Extension (Easiest)
                </p>
                <ol className="ml-4 list-decimal text-gray-600 space-y-1 mt-1">
                  <li>
                    Install{" "}
                    <a
                      href="https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff"
                      className="text-blue-600 underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Share Your Garmin Connect Workout
                    </a>
                  </li>
                  <li>Open your workout in Garmin Connect</li>
                  <li>Click the extension icon → Download</li>
                </ol>
              </div>
              <div>
                <p className="font-medium text-gray-800">Option 2: Watch USB</p>
                <ol className="ml-4 list-decimal text-gray-600 space-y-1 mt-1">
                  <li>Connect watch via USB cable</li>
                  <li>
                    Navigate to <code className="bg-gray-100 px-1 rounded">/GARMIN/Workouts/</code>
                  </li>
                  <li>Copy the .FIT file you want to share</li>
                </ol>
              </div>
            </div>
          </details>
        </>
      )}
    </main>
  );
}
