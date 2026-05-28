import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import {
  Search, TrendingUp, Target, Flame, Award, Zap, ChevronRight, Loader2,
  AlertCircle, LayoutDashboard, Tags, ExternalLink, ArrowUpDown, Sparkles,
  CheckCircle2, Circle, Trophy, Activity,
} from "lucide-react";

/* ---------------------------------------------------------------------------
   Codeforces rank tiers + colors
--------------------------------------------------------------------------- */
const RANKS = [
  { min: 3000, name: "Legendary Grandmaster", color: "#FF0000", short: "LGM" },
  { min: 2600, name: "International Grandmaster", color: "#FF0000", short: "IGM" },
  { min: 2400, name: "Grandmaster", color: "#FF0000", short: "GM" },
  { min: 2300, name: "International Master", color: "#FF8C00", short: "IM" },
  { min: 2100, name: "Master", color: "#FF8C00", short: "M" },
  { min: 1900, name: "Candidate Master", color: "#AA00AA", short: "CM" },
  { min: 1600, name: "Expert", color: "#0000FF", short: "Exp" },
  { min: 1400, name: "Specialist", color: "#03A89E", short: "Spec" },
  { min: 1200, name: "Pupil", color: "#008000", short: "Pup" },
  { min: 0,    name: "Newbie", color: "#808080", short: "New" },
];
const rankFor = (r) => RANKS.find((t) => (r || 0) >= t.min) || RANKS[RANKS.length - 1];

const DIFF_BUCKETS = [
  { label: "800-1100", lo: 800, hi: 1100, color: "#808080" },
  { label: "1200-1300", lo: 1200, hi: 1300, color: "#008000" },
  { label: "1400-1500", lo: 1400, hi: 1500, color: "#03A89E" },
  { label: "1600-1800", lo: 1600, hi: 1800, color: "#0000FF" },
  { label: "1900-2100", lo: 1900, hi: 2100, color: "#AA00AA" },
  { label: "2200-2300", lo: 2200, hi: 2300, color: "#FF8C00" },
  { label: "2400+", lo: 2400, hi: 9999, color: "#FF0000" },
];

const CF = "https://codeforces.com/api/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cfFetch(endpoint) {
  const res = await fetch(CF + endpoint);
  if (res.status === 429) throw new Error("RATE_LIMIT");
  const data = await res.json();
  if (data.status !== "OK") throw new Error(data.comment || "API error");
  return data.result;
}

/* ---------------------------------------------------------------------------
   Small UI primitives
--------------------------------------------------------------------------- */
const Card = ({ className = "", children }) => (
  <div className={`rounded-xl border border-white/[0.06] bg-[#13131a] ${className}`}>
    {children}
  </div>
);

const Mono = ({ className = "", children, style }) => (
  <span className={`font-mono tabular-nums ${className}`} style={style}>{children}</span>
);

const Pill = ({ children, color }) => (
  <span
    className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium font-mono"
    style={{ background: `${color}1f`, color }}
  >
    {children}
  </span>
);

function DiffBadge({ rating }) {
  const c = rating ? rankFor(rating).color : "#6b7280";
  return <Mono className="text-xs font-semibold" style={{ color: c }}>{rating || "?"}</Mono>;
}

/* ---------------------------------------------------------------------------
   Main App
--------------------------------------------------------------------------- */
export default function App() {
  const [handle, setHandle] = useState("");
  const [activeHandle, setActiveHandle] = useState(null);
  const [page, setPage] = useState("dashboard");
  useEffect(() => {
    const saved = localStorage.getItem("cf_handle");
    if (saved) {
      setHandle(saved);
      loadHandle(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState(null);

  const [info, setInfo] = useState(null);
  const [ratingHist, setRatingHist] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [problemBank, setProblemBank] = useState([]);

  const [selectedTopic, setSelectedTopic] = useState(null);
  const [topicSort, setTopicSort] = useState("rating");

  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const fetchAiInsights = useCallback(async () => {
    if (!analysis || !info) return;
    setAiLoading(true); setAiError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: info.rating || 0,
          rank: rankFor(info.rating || 0).name,
          weakTopics: weakTopics.map((t) => ({ tag: t.tag, success: t.success })),
          tagStats: analysis.tagStats.slice(0, 20),
        }),
      });
      if (!res.ok) throw new Error("API error");
      setAiInsights(await res.json());
    } catch (e) {
      setAiError(e.message || "Failed to get AI insights");
    } finally {
      setAiLoading(false);
    }
  }, [analysis, info, weakTopics]);

  /* ----- initial batched fetch ----- */
  const loadHandle = useCallback(async (h) => {
    if (!h.trim()) return;
    setLoading(true); setError(null);
    setInfo(null); setRatingHist([]); setSubmissions([]);
    try {
      setStage("Fetching profile…");
      const infoRes = await cfFetch(`user.info?handles=${encodeURIComponent(h)}`);
      setInfo(infoRes[0]);
      await sleep(350);

      setStage("Loading rating history…");
      let hist = [];
      try { hist = await cfFetch(`user.rating?handle=${encodeURIComponent(h)}`); }
      catch { hist = []; }
      setRatingHist(hist);
      await sleep(350);

      setStage("Analyzing submissions…");
      const subs = await cfFetch(`user.status?handle=${encodeURIComponent(h)}`);
      setSubmissions(subs);

      if (problemBank.length === 0) {
        await sleep(350);
        setStage("Loading problem bank (~9k problems)…");
        try {
          const pb = await cfFetch(`problemset.problems`);
          setProblemBank(pb.problems || []);
        } catch { /* degrade gracefully */ }
      }

      setActiveHandle(infoRes[0].handle);
      localStorage.setItem("cf_handle", infoRes[0].handle);
      setPage("dashboard");
    } catch (e) {
      if (e.message === "RATE_LIMIT")
        setError("Codeforces rate limit hit. Wait a few seconds and try again.");
      else if (/not found|invalid/i.test(e.message))
        setError(`Handle "${h}" not found. Check the spelling.`);
      else setError(e.message || "Something went wrong fetching data.");
    } finally {
      setLoading(false); setStage("");
    }
  }, [problemBank.length]);

  /* ----- derived: solved set + per-tag stats ----- */
  const analysis = useMemo(() => {
    if (!submissions.length) return null;
    const solved = new Set();
    const attempted = new Set();
    const solvedProblems = new Map();
    const attemptCount = new Map();
    const solveByTag = new Map();
    const attemptByTag = new Map();

    for (const s of submissions) {
      if (!s.problem || s.problem.contestId == null) continue;
      const key = `${s.problem.contestId}-${s.problem.index}`;
      attempted.add(key);
      attemptCount.set(key, (attemptCount.get(key) || 0) + 1);
      for (const t of s.problem.tags || []) {
        if (!solveByTag.has(t)) { solveByTag.set(t, new Set()); attemptByTag.set(t, new Set()); }
        attemptByTag.get(t).add(key);
      }
      if (s.verdict === "OK" && !solved.has(key)) {
        solved.add(key);
        solvedProblems.set(key, { rating: s.problem.rating, tags: s.problem.tags || [] });
        for (const t of s.problem.tags || []) {
          if (!solveByTag.has(t)) { solveByTag.set(t, new Set()); attemptByTag.set(t, new Set()); }
          solveByTag.get(t).add(key);
        }
      }
    }

    const tagStats = [];
    for (const [tag, set] of attemptByTag) {
      const solvedN = solveByTag.get(tag)?.size || 0;
      const attN = set.size;
      const ratings = [...(solveByTag.get(tag) || [])]
        .map((k) => solvedProblems.get(k)?.rating).filter(Boolean);
      const avg = ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;
      tagStats.push({
        tag, solved: solvedN, attempted: attN,
        success: attN ? solvedN / attN : 0,
        avgDifficulty: avg,
      });
    }
    tagStats.sort((a, b) => b.solved - a.solved);

    const diffDist = DIFF_BUCKETS.map((b) => ({
      label: b.label, color: b.color, count: 0,
    }));
    let totalRated = 0;
    for (const { rating } of solvedProblems.values()) {
      if (!rating) continue;
      totalRated++;
      const bi = DIFF_BUCKETS.findIndex((b) => rating >= b.lo && rating <= b.hi);
      if (bi >= 0) diffDist[bi].count++;
    }

    const now = Date.now() / 1000;
    const WEEK = 7 * 86400, MONTH = 30 * 86400;
    let week = 0, month = 0;
    const solveDays = new Set();
    const firstSolveTime = new Map();
    for (const s of submissions) {
      if (s.verdict !== "OK") continue;
      const key = `${s.problem.contestId}-${s.problem.index}`;
      if (!firstSolveTime.has(key) || s.creationTimeSeconds < firstSolveTime.get(key))
        firstSolveTime.set(key, s.creationTimeSeconds);
    }
    for (const [, t] of firstSolveTime) {
      if (now - t <= WEEK) week++;
      if (now - t <= MONTH) month++;
      solveDays.add(Math.floor(t / 86400));
    }
    let streak = 0;
    let day = Math.floor(now / 86400);
    while (solveDays.has(day)) { streak++; day--; }
    if (streak === 0 && solveDays.has(day - 1)) {
      let d = day - 1;
      while (solveDays.has(d)) { streak++; d--; }
    }

    return {
      solved, solvedProblems, attemptCount, tagStats,
      diffDist, totalSolved: solved.size, totalRated,
      week, month, streak,
    };
  }, [submissions]);

  /* ----- tag frequency from problem bank (proxy for "appears often in contests") ----- */
  const tagFrequency = useMemo(() => {
    const m = new Map();
    for (const p of problemBank)
      for (const t of p.tags || [])
        m.set(t, (m.get(t) || 0) + 1);
    return m;
  }, [problemBank]);

  /* ----- weakness flags ----- */
  const weakTopics = useMemo(() => {
    if (!analysis) return [];
    const curRating = info?.rating || 0;
    const candidates = analysis.tagStats.filter((t) => t.attempted >= 3);

    const maxFreq = tagFrequency.size ? Math.max(...tagFrequency.values()) : 1;
    const maxLogFreq = Math.log(maxFreq + 1);

    const scored = candidates.map((t) => {
      const successPenalty = (1 - t.success) * 100;
      const diffGap = curRating ? Math.max(0, curRating - (t.avgDifficulty || curRating)) / 10 : 0;
      // log-scale prominence: common contest tags (dp, greedy, math) get up to +40 pts
      const freq = tagFrequency.get(t.tag) || 0;
      const prominenceBoost = maxLogFreq > 0 ? (Math.log(freq + 1) / maxLogFreq) * 40 : 0;
      return { ...t, weakScore: successPenalty + diffGap + prominenceBoost };
    });
    scored.sort((a, b) => b.weakScore - a.weakScore);
    return scored.slice(0, 3);
  }, [analysis, info, tagFrequency]);

  /* ----- recommendation engine ----- */
  const recommendations = useMemo(() => {
    if (!analysis || !problemBank.length) return [];
    const cur = info?.rating || 900;
    const lo = cur ? cur + 100 : 800;
    const hi = cur ? cur + 300 : 1100;
    const weakTagSet = new Set(weakTopics.map((t) => t.tag));

    const pool = problemBank.filter((p) => {
      if (p.contestId == null || !p.rating) return false;
      const key = `${p.contestId}-${p.index}`;
      if (analysis.solved.has(key)) return false;
      return p.rating >= lo && p.rating <= hi;
    });

    const scored = pool.map((p) => {
      const tagMatch = (p.tags || []).filter((t) => weakTagSet.has(t)).length;
      const closeness = 1 - Math.abs(p.rating - (cur + 200)) / 300;
      const score = tagMatch * 2 + closeness;
      const weakHit = (p.tags || []).find((t) => weakTagSet.has(t));
      return {
        ...p, key: `${p.contestId}-${p.index}`, score,
        reason: weakHit
          ? `Targets your weak topic "${weakHit}", rated ${p.rating} (~${p.rating - cur} above you)`
          : `Solid practice at ${p.rating} (~${p.rating - cur} above your current rating)`,
      };
    });
    scored.sort((a, b) => b.score - a.score || a.rating - b.rating);
    const seen = new Set(); const out = [];
    for (const p of scored) {
      if (seen.has(p.name)) continue;
      seen.add(p.name); out.push(p);
      if (out.length >= 6) break;
    }
    return out;
  }, [analysis, problemBank, info, weakTopics]);

  /* ----- topics (from problem bank tags + user mastery) ----- */
  const topics = useMemo(() => {
    if (!tagFrequency.size) return [];
    const solvedByTag = new Map();
    if (analysis) for (const t of analysis.tagStats) solvedByTag.set(t.tag, t.solved);
    return [...tagFrequency.entries()]
      .map(([tag, total]) => {
        const solved = solvedByTag.get(tag) || 0;
        return { tag, total, solved, mastery: total ? Math.min(100, Math.round((solved / Math.min(total, 80)) * 100)) : 0 };
      })
      .filter((t) => t.total >= 25)
      .sort((a, b) => b.total - a.total);
  }, [tagFrequency, analysis]);

  /* ----- problems for selected topic ----- */
  const topicProblems = useMemo(() => {
    if (!selectedTopic || !problemBank.length) return [];
    const cur = info?.rating || 900;
    let list = problemBank
      .filter((p) => (p.tags || []).includes(selectedTopic) && p.rating)
      .map((p) => {
        const key = `${p.contestId}-${p.index}`;
        return { ...p, key, isSolved: analysis?.solved.has(key) || false };
      });
    const recPick = list
      .filter((p) => !p.isSolved && p.rating >= cur + 100 && p.rating <= cur + 300)
      .sort((a, b) => Math.abs(a.rating - (cur + 200)) - Math.abs(b.rating - (cur + 200)))[0];
    list = list.map((p) => ({ ...p, isRec: recPick && p.key === recPick.key }));
    if (topicSort === "rating") list.sort((a, b) => a.rating - b.rating);
    else if (topicSort === "rating-desc") list.sort((a, b) => b.rating - a.rating);
    else if (topicSort === "solved") list.sort((a, b) => (b.isSolved ? 1 : 0) - (a.isSolved ? 1 : 0));
    return list.slice(0, 120);
  }, [selectedTopic, problemBank, analysis, info, topicSort]);

  /* ----- rating chart data ----- */
  const ratingChart = useMemo(() =>
    ratingHist.map((r) => ({
      name: r.contestName, x: r.ratingUpdateTimeSeconds * 1000, rating: r.newRating,
    })), [ratingHist]);

  const rank = info ? rankFor(info.rating) : null;

  /* =========================================================================
     RENDER
  ========================================================================= */
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200 font-sans antialiased"
      style={{ fontFamily: "'Outfit', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a35; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #3a3a45; }
        @keyframes fadeUp { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform:none } }
        .fade-up { animation: fadeUp .4s ease both; }
      `}</style>

      {/* ---------------- Landing / handle input ---------------- */}
      {!activeHandle ? (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md fade-up">
            <div className="mb-8 text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
                <Zap className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Codeforces Forge</h1>
              <p className="mt-2 text-sm text-gray-500">
                Link your handle. Find your weaknesses. Rank up.
              </p>
            </div>
            <Card className="p-1.5">
              <div className="flex items-center gap-2">
                <Search className="ml-3 h-4 w-4 shrink-0 text-gray-500" />
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadHandle(handle)}
                  placeholder="Enter Codeforces handle…"
                  className="flex-1 bg-transparent py-2.5 font-mono text-sm text-white outline-none placeholder:text-gray-600"
                />
                <button
                  onClick={() => loadHandle(handle)}
                  disabled={loading || !handle.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyze"}
                </button>
              </div>
            </Card>
            {loading && <p className="mt-4 text-center text-xs text-indigo-400 font-mono">{stage}</p>}
            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["tourist", "Benq", "jiangly", "Um_nik"].map((h) => (
                <button key={h} onClick={() => { setHandle(h); loadHandle(h); }}
                  className="rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1 font-mono text-xs text-gray-500 transition hover:text-gray-300 hover:border-white/10">
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ---------------- Main app shell ---------------- */
        <div className="flex min-h-screen">
          {/* Sidebar (desktop) */}
          <aside className="hidden w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c12] p-4 md:flex">
            <div className="mb-8 flex items-center gap-2 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-white">Forge</span>
            </div>
            <nav className="flex flex-col gap-1">
              {[
                { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
                { id: "topics", label: "Topics", icon: Tags },
              ].map((t) => (
                <button key={t.id} onClick={() => { setPage(t.id); setSelectedTopic(null); }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    page === t.id ? "bg-indigo-500/10 text-indigo-300" : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
                  }`}>
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </nav>
            <div className="mt-auto">
              {info && (
                <button onClick={() => { setActiveHandle(null); setHandle(""); localStorage.removeItem("cf_handle"); }}
                  className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition hover:bg-white/[0.03]">
                  <img src={info.titlePhoto} alt="" className="h-8 w-8 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <Mono className="block truncate text-xs font-semibold" style={{ color: rank.color }}>{info.handle}</Mono>
                    <span className="text-[10px] text-gray-600">Switch handle</span>
                  </div>
                </button>
              )}
            </div>
          </aside>

          {/* Mobile top tabs */}
          <div className="fixed inset-x-0 top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#0c0c12]/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-400" /><span className="font-bold text-white">Forge</span>
            </div>
            <div className="flex gap-1">
              {[{ id: "dashboard", icon: LayoutDashboard }, { id: "topics", icon: Tags }].map((t) => (
                <button key={t.id} onClick={() => { setPage(t.id); setSelectedTopic(null); }}
                  className={`rounded-lg p-2 ${page === t.id ? "bg-indigo-500/10 text-indigo-300" : "text-gray-500"}`}>
                  <t.icon className="h-4 w-4" />
                </button>
              ))}
               <button onClick={() => { setActiveHandle(null); localStorage.removeItem("cf_handle"); }} className="rounded-lg p-2 text-gray-500">
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <main className="flex-1 overflow-x-hidden px-4 py-6 pt-20 md:px-8 md:py-8 md:pt-8">
            {page === "dashboard" && info && (
              <Dashboard
                info={info} rank={rank} ratingChart={ratingChart}
                analysis={analysis} weakTopics={weakTopics}
                recommendations={recommendations} bankReady={problemBank.length > 0}
                aiInsights={aiInsights} aiLoading={aiLoading} aiError={aiError}
                onFetchAi={fetchAiInsights}
              />
            )}
            {page === "topics" && (
              <Topics
                topics={topics} selectedTopic={selectedTopic} setSelectedTopic={setSelectedTopic}
                topicProblems={topicProblems} topicSort={topicSort} setTopicSort={setTopicSort}
                bankReady={problemBank.length > 0}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
   DASHBOARD PAGE
=========================================================================== */
function Dashboard({ info, rank, ratingChart, analysis, weakTopics, recommendations, bankReady, aiInsights, aiLoading, aiError, onFetchAi }) {
  const spotlight = recommendations[0];
  const queue = recommendations.slice(1, 6);

  return (
    <div className="mx-auto max-w-5xl space-y-6 fade-up">
      {/* Header */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <img src={info.titlePhoto} alt="" className="h-16 w-16 rounded-xl object-cover ring-2 ring-white/10" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Mono className="text-xl font-bold" style={{ color: rank.color }}>{info.handle}</Mono>
              <Pill color={rank.color}>{rank.name}</Pill>
            </div>
            {(info.firstName || info.city) && (
              <p className="mt-0.5 text-sm text-gray-500">
                {[info.firstName, info.lastName].filter(Boolean).join(" ")}
                {info.city ? ` · ${info.city}` : ""}
              </p>
            )}
          </div>
          <div className="flex gap-6">
            <Stat label="Rating" value={info.rating ?? "—"} color={rank.color} />
            <Stat label="Max" value={info.maxRating ?? "—"} color={info.maxRating ? rankFor(info.maxRating).color : "#888"} />
            <Stat label="Solved" value={analysis?.totalSolved ?? 0} color="#fff" />
          </div>
        </div>
      </Card>

      {/* Progress tracker row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard icon={Activity} label="This week" value={analysis?.week ?? 0} accent="#6366f1" />
        <MetricCard icon={TrendingUp} label="This month" value={analysis?.month ?? 0} accent="#03A89E" />
        <MetricCard icon={Flame} label="Day streak" value={analysis?.streak ?? 0} accent="#FF8C00" />
        <MetricCard icon={Trophy} label="Rated solved" value={analysis?.totalRated ?? 0} accent="#AA00AA" />
      </div>

      {/* Rating chart */}
      <Card className="p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-300">
          <TrendingUp className="h-4 w-4 text-indigo-400" /> Rating Progress
        </h3>
        {ratingChart.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ratingChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} scale="time"
                tickFormatter={(t) => new Date(t).getFullYear()} stroke="#555" fontSize={11} />
              <YAxis stroke="#555" fontSize={11} domain={["dataMin - 100", "dataMax + 100"]} />
              <Tooltip
                contentStyle={{ background: "#13131a", border: "1px solid #ffffff14", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(t) => new Date(t).toLocaleDateString()}
                formatter={(v) => [v, "Rating"]} />
              <Line type="monotone" dataKey="rating" stroke="#6366f1" strokeWidth={2}
                dot={false} activeDot={{ r: 4, fill: "#818cf8" }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Empty text="No rated contests yet — compete to start your rating curve." />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weakness analysis */}
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-300">
            <Target className="h-4 w-4 text-red-400" /> Weakness Analysis
          </h3>
          {weakTopics.length ? (
            <div className="space-y-3">
              {weakTopics.map((t) => (
                <div key={t.tag}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono text-gray-300">{t.tag}</span>
                    <span className="text-gray-500">
                      {Math.round(t.success * 100)}% success · {t.solved}/{t.attempted} solved
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                    <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500"
                      style={{ width: `${Math.max(6, t.success * 100)}%` }} />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-gray-600">
                Flagged by low success rate, difficulty gap, and contest frequency.
              </p>
            </div>
          ) : (
            <Empty text="Not enough attempts yet to flag weak topics. Solve more to unlock analysis." />
          )}
        </Card>

        {/* Difficulty distribution */}
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-300">
            <Award className="h-4 w-4 text-cyan-400" /> Solved by Difficulty
          </h3>
          {analysis?.totalRated ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analysis.diffDist} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis dataKey="label" stroke="#555" fontSize={9} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis stroke="#555" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#13131a", border: "1px solid #ffffff14", borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: "#ffffff05" }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {analysis.diffDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="No rated problems solved yet." />
          )}
        </Card>
      </div>

      {/* Solve Now spotlight */}
      <Card className="overflow-hidden border-indigo-500/20">
        <div className="border-b border-white/[0.06] bg-gradient-to-r from-indigo-500/10 to-transparent px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-300">
            <Sparkles className="h-4 w-4" /> Solve Now — AI Spotlight
          </h3>
        </div>
        <div className="p-5">
          {!bankReady ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading problem bank to build recommendations…
            </div>
          ) : spotlight ? (
            <>
              <a href={`https://codeforces.com/problemset/problem/${spotlight.contestId}/${spotlight.index}`}
                target="_blank" rel="noreferrer"
                className="group flex items-start justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-indigo-500/30 hover:bg-indigo-500/5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-gray-500">{spotlight.contestId}{spotlight.index}</span>
                    <DiffBadge rating={spotlight.rating} />
                  </div>
                  <p className="mt-1 truncate font-medium text-white group-hover:text-indigo-300">{spotlight.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{spotlight.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(spotlight.tags || []).slice(0, 4).map((t) => (
                      <span key={t} className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-gray-500">{t}</span>
                    ))}
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-gray-600 group-hover:text-indigo-400" />
              </a>

              {queue.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-gray-500">Next up</p>
                  <div className="space-y-1.5">
                    {queue.map((p) => (
                      <a key={p.key} href={`https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`}
                        target="_blank" rel="noreferrer"
                        className="group flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-white/[0.03]">
                        <DiffBadge rating={p.rating} />
                        <span className="flex-1 truncate text-sm text-gray-300 group-hover:text-white">{p.name}</span>
                        <span className="hidden truncate text-[11px] text-gray-600 sm:block max-w-[40%]">{p.reason}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-700 group-hover:text-gray-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <Empty text="No unsolved problems found in your target band. Try competing to update your rating." />
          )}
        </div>
      </Card>
      {/* AI Insights */}
      <Card className="overflow-hidden border-violet-500/20">
        <div className="border-b border-white/[0.06] bg-gradient-to-r from-violet-500/10 to-transparent px-5 py-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-300">
            <Sparkles className="h-4 w-4" /> AI Learning Path
          </h3>
          {!aiInsights && (
            <button
              onClick={onFetchAi}
              disabled={aiLoading}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
            >
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {aiLoading ? "Analyzing…" : "Analyze with AI"}
            </button>
          )}
          {aiInsights && (
            <button onClick={onFetchAi} disabled={aiLoading}
              className="text-[11px] text-gray-600 hover:text-gray-400 transition">
              {aiLoading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>
        <div className="p-5">
          {!aiInsights && !aiLoading && !aiError && (
            <p className="text-sm text-gray-600 text-center py-4">
              กด "Analyze with AI" เพื่อให้ Gemini วิเคราะห์จุดอ่อนและแนะนำ learning path
            </p>
          )}
          {aiError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" /> {aiError}
            </div>
          )}
          {aiLoading && !aiInsights && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Gemini กำลังวิเคราะห์…
            </div>
          )}
          {aiInsights && (
            <div className="space-y-5">
              <p className="text-sm text-gray-300 leading-relaxed">{aiInsights.analysis}</p>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Learning Path</p>
                <div className="space-y-2">
                  {(aiInsights.learningPath || []).map((step) => (
                    <div key={step.priority} className="flex items-start gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-bold text-violet-300">
                        {step.priority}
                      </span>
                      <div>
                        <p className="font-mono text-sm font-medium text-gray-200">{step.topic}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{step.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ===========================================================================
   TOPICS PAGE
=========================================================================== */
function Topics({ topics, selectedTopic, setSelectedTopic, topicProblems, topicSort, setTopicSort, bankReady }) {
  if (!bankReady)
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center py-20 text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading problem bank…
      </div>
    );

  if (selectedTopic) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 fade-up">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedTopic(null)}
            className="flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-white">
            <ChevronRight className="h-4 w-4 rotate-180" /> All topics
          </button>
          <button onClick={() => setTopicSort(
              topicSort === "rating" ? "rating-desc" : topicSort === "rating-desc" ? "solved" : "rating")}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs text-gray-400 transition hover:text-white">
            <ArrowUpDown className="h-3.5 w-3.5" />
            {topicSort === "rating" ? "Difficulty ↑" : topicSort === "rating-desc" ? "Difficulty ↓" : "Solved first"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-xl font-bold text-white">{selectedTopic}</h2>
          <span className="text-sm text-gray-500">{topicProblems.length} problems</span>
        </div>
        <Card className="divide-y divide-white/[0.04]">
          {topicProblems.map((p) => (
            <a key={p.key} href={`https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`}
              target="_blank" rel="noreferrer"
              className="group flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.02]">
              {p.isSolved
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                : <Circle className="h-4 w-4 shrink-0 text-gray-700" />}
              <DiffBadge rating={p.rating} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-sm ${p.isSolved ? "text-gray-500" : "text-gray-200 group-hover:text-white"}`}>{p.name}</span>
                  {p.isRec && (
                    <span className="flex shrink-0 items-center gap-1 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
                      <Sparkles className="h-2.5 w-2.5" /> pick
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {(p.tags || []).slice(0, 3).map((t) => (
                    <span key={t} className="font-mono text-[10px] text-gray-600">{t}</span>
                  ))}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-700 group-hover:text-gray-400" />
            </a>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 fade-up">
      <div>
        <h2 className="text-xl font-bold text-white">Topics</h2>
        <p className="text-sm text-gray-500">Mastery across {topics.length} Codeforces problem tags</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {topics.map((t) => (
          <button key={t.tag} onClick={() => setSelectedTopic(t.tag)}
            className="group rounded-xl border border-white/[0.06] bg-[#13131a] p-4 text-left transition hover:border-indigo-500/30 hover:bg-indigo-500/5">
            <div className="mb-3 flex items-start justify-between">
              <span className="font-mono text-sm font-medium text-gray-200 group-hover:text-white">{t.tag}</span>
              <ChevronRight className="h-4 w-4 text-gray-700 group-hover:text-indigo-400" />
            </div>
            <div className="mb-2 flex items-end justify-between">
              <Mono className="text-2xl font-bold text-white">{t.mastery}<span className="text-sm text-gray-600">%</span></Mono>
              <span className="text-[11px] text-gray-600">{t.solved}/{t.total}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${t.mastery}%`,
                  background: t.mastery > 60 ? "#03A89E" : t.mastery > 30 ? "#6366f1" : "#FF8C00" }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Shared bits
--------------------------------------------------------------------------- */
function Stat({ label, value, color }) {
  return (
    <div className="text-center">
      <Mono className="block text-xl font-bold" style={{ color }}>{value}</Mono>
      <span className="text-[10px] uppercase tracking-wide text-gray-600">{label}</span>
    </div>
  );
}
function MetricCard({ icon: Icon, label, value, accent }) {
  return (
    <Card className="p-4">
      <Icon className="mb-2 h-4 w-4" style={{ color: accent }} />
      <Mono className="block text-2xl font-bold text-white">{value}</Mono>
      <span className="text-xs text-gray-500">{label}</span>
    </Card>
  );
}
function Empty({ text }) {
  return <p className="py-8 text-center text-sm text-gray-600">{text}</p>;
}
