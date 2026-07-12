import Head from "next/head";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebaseClient";

export default function SearchFab() {
  const [checking, setChecking] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
        return;
      }
      setChecking(false);
    });
    return () => unsubscribe();
  }, [router]);

  const runSearch = async (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setResults(null);
    setImages([]);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!res.ok) {
        setError("SearchFab couldn't reach the search service. Try again in a moment.");
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else if (!data.results || data.results.length === 0) {
        setError("No results found for that search.");
      } else {
        setResults(data.results);
        setImages(data.images || []);
      }
    } catch (err) {
      setError("Something went wrong while searching. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const openResult = (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (checking) return null;

  return (
    <>
      <Head>
        <title>SearchFab | Fabion</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="min-h-screen bg-zinc-950 text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
        <header className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800">
          <button onClick={() => router.push("/chat")} className="text-zinc-400 hover:text-white transition-colors text-sm">
            ← Chat
          </button>
          <div className="text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
            SearchFab
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-12">
          <form onSubmit={runSearch} className="flex gap-2 mb-10">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anything..."
              autoFocus
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-5 py-3 text-sm focus:outline-none focus:border-zinc-600 transition-colors"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-white text-black px-6 py-3 rounded-full text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          {loading && (
            <div className="flex items-center gap-2 text-zinc-500 text-sm mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" />
              Searching the web...
            </div>
          )}

          {error && !loading && (
            <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-xl px-4 py-3 mb-6">
              {error}
            </div>
          )}

          {!loading && !error && !results && (
            <div className="text-zinc-600 text-sm italic">
              Enter a search above to get real, current results from the web.
            </div>
          )}

          {images.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-8">
              {images.slice(0, 8).map((img, i) => {
                const src = typeof img === "string" ? img : img?.url || "";
                if (!src) return null;
                return (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
                    <img
                      src={`/api/image-proxy?url=${encodeURIComponent(src)}`}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => (e.target.parentElement.style.display = "none")}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-6">
              {results.map((r, i) => (
                <div
                  key={i}
                  onClick={() => openResult(r.url)}
                  role="link"
                  tabIndex={0}
                  className="block border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 transition-colors cursor-pointer"
                >
                  <div className="text-xs text-zinc-500 mb-1 truncate">{r.url}</div>
                  <div className="text-base font-medium mb-2 text-white">{r.title}</div>
                  <div className="text-sm text-zinc-400 leading-relaxed">{r.snippet}</div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
