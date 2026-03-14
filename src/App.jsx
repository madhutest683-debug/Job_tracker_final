import { useState, useEffect } from "react";

// ─── Storage ────────────────────────────────────────────────────
const STORAGE_KEY = "jobtracker_v2";
const loadData = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { jobs: [], referrals: [] }; }
  catch { return { jobs: [], referrals: [] }; }
};
const saveData = (data) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
};

// ─── Constants ──────────────────────────────────────────────────
const STATUSES = ["Saved","Applied","Referral Requested","Interview","Offer","Rejected"];
const SOURCES  = ["Naukri","LinkedIn","Company Site","Other"];
const REF_STATUSES = ["Not Asked","Asked","Pending","Referred","Declined"];

const STATUS_META = {
  "Saved":               { color:"#64748b", bg:"#1e293b", emoji:"🔖" },
  "Applied":             { color:"#38bdf8", bg:"#0c2a3f", emoji:"📤" },
  "Referral Requested":  { color:"#a78bfa", bg:"#1e1040", emoji:"🤝" },
  "Interview":           { color:"#34d399", bg:"#052e16", emoji:"🎯" },
  "Offer":               { color:"#86efac", bg:"#052e16", emoji:"🎉" },
  "Rejected":            { color:"#f87171", bg:"#2d0f0f", emoji:"✕"  },
};

const needsFollowUp = (job) => {
  if (["Offer","Rejected","Interview"].includes(job.status)) return false;
  if (job.deadline) {
    const diff = Math.ceil((new Date(job.deadline) - new Date().setHours(0,0,0,0)) / 86400000);
    if (diff <= 1) return true;
  }
  if (!job.addedAt) return false;
  return Date.now() - new Date(job.addedAt).getTime() > 86400000;
};

const timeAgo = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  const h = Math.floor((Date.now() - new Date(iso)) / 3600000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return "Just now";
};

const blankJob = { company:"", role:"", url:"", source:"Naukri", status:"Saved", referral:"", notes:"", deadline:"" };

const deadlineStatus = (deadline) => {
  if (!deadline) return null;
  const diff = Math.ceil((new Date(deadline) - new Date().setHours(0,0,0,0)) / 86400000);
  if (diff < 0)  return { label:`Expired ${Math.abs(diff)}d ago`, color:"#f87171", bg:"#2d0f0f", urgent:true };
  if (diff === 0) return { label:"Deadline Today!", color:"#fb923c", bg:"#431407", urgent:true };
  if (diff === 1) return { label:"1 day left",      color:"#fbbf24", bg:"#3b1f00", urgent:true };
  if (diff <= 3)  return { label:`${diff} days left`, color:"#fbbf24", bg:"#2d1c00", urgent:false };
  return           { label:`${diff} days left`,      color:"#34d399", bg:"#052e16", urgent:false };
};

const formatDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
};
const blankRef = { name:"", company:"", linkedin:"", connection:"", status:"Not Asked", notes:"" };

// ─── Import / Export helpers ─────────────────────────────────────
const JOB_CSV_HEADERS = ["company","role","url","source","status","referral","deadline","notes","addedAt"];

const jobsToCSV = (jobs) => {
  const rows = jobs.map(j => JOB_CSV_HEADERS.map(h => {
    const v = j[h] || "";
    return `"${String(v).replace(/"/g,'""')}"`;
  }).join(","));
  return [JOB_CSV_HEADERS.join(","), ...rows].join("\n");
};

const parseCSV = (text) => {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,"").toLowerCase());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (let c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === "," && !inQ) { vals.push(cur); cur = ""; }
      else cur += c;
    }
    vals.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
    return {
      id: Date.now() + Math.random(),
      company:  obj.company  || "",
      role:     obj.role     || "",
      url:      obj.url      || "",
      source:   SOURCES.includes(obj.source) ? obj.source : "Other",
      status:   STATUSES.includes(obj.status) ? obj.status : "Saved",
      referral: obj.referral || obj["referral contact"] || "",
      deadline: obj.deadline || "",
      notes:    obj.notes    || "",
      addedAt:  obj.addedat  || new Date().toISOString(),
    };
  }).filter(j => j.company || j.url);
};

const downloadFile = (content, filename, mime) => {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const parseURLList = (text) => {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.startsWith("http"));
  return lines.map(url => ({
    id: Date.now() + Math.random(),
    url,
    company: "",
    role: "",
    source: url.toLowerCase().includes("naukri") ? "Naukri" : url.toLowerCase().includes("linkedin") ? "LinkedIn" : "Other",
    status: "Saved",
    referral: "", deadline: "", notes: "",
    addedAt: new Date().toISOString(),
  }));
};
// ─── App ────────────────────────────────────────────────────────
export default function App() {
  const [data, setData]         = useState({ jobs:[], referrals:[] });
  const [tab, setTab]           = useState("home");
  const [sheet, setSheet]       = useState(null);
  const [form, setForm]         = useState(blankJob);
  const [refForm, setRefForm]   = useState(blankRef);
  const [editId, setEditId]     = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [toast, setToast]       = useState(null);
  const [filter, setFilter]     = useState("All");
  const [search, setSearch]     = useState("");
  const [importText, setImportText]   = useState("");
  const [importMode, setImportMode]   = useState("urls"); // "urls" | "csv" | "json"
  const [importPreview, setImportPreview] = useState([]);
  const [importError, setImportError] = useState("");

  useEffect(() => { setData(loadData()); }, []);
  useEffect(() => { saveData(data); }, [data]);

  const showToast = (msg, ok=true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const openSheet = (s) => setSheet(s);
  const closeSheet = () => { setSheet(null); setEditId(null); setForm(blankJob); setRefForm(blankRef); };

  // ── Job CRUD ──
  const saveJob = () => {
    if (!form.company && !form.url) { showToast("Add company or URL", false); return; }
    if (editId) {
      setData(d => ({ ...d, jobs: d.jobs.map(j => j.id === editId ? { ...j, ...form } : j) }));
      showToast("Job updated ✓");
    } else {
      const newJob = { ...form, id: Date.now(), addedAt: new Date().toISOString() };
      setData(d => ({ ...d, jobs: [newJob, ...d.jobs] }));
      showToast("Job added ✓");
    }
    closeSheet();
  };

  const deleteJob = (id) => {
    setData(d => ({ ...d, jobs: d.jobs.filter(j => j.id !== id) }));
    setSheet(null); setDetailId(null);
    showToast("Removed", false);
  };

  const updateStatus = (id, status) => {
    setData(d => ({ ...d, jobs: d.jobs.map(j => j.id === id ? { ...j, status } : j) }));
  };

  // ── Referral CRUD ──
  const saveRef = () => {
    if (!refForm.name) { showToast("Add a name", false); return; }
    if (editId) {
      setData(d => ({ ...d, referrals: d.referrals.map(r => r.id === editId ? { ...r, ...refForm } : r) }));
      showToast("Contact updated ✓");
    } else {
      setData(d => ({ ...d, referrals: [{ ...refForm, id: Date.now() }, ...d.referrals] }));
      showToast("Contact added ✓");
    }
    closeSheet();
  };

  const deleteRef = (id) => {
    setData(d => ({ ...d, referrals: d.referrals.filter(r => r.id !== id) }));
    setSheet(null); setDetailId(null);
    showToast("Removed", false);
  };

  // ── Export ──
  const exportCSV = () => {
    if (!data.jobs.length) { showToast("No jobs to export", false); return; }
    downloadFile(jobsToCSV(data.jobs), `job-tracker-${new Date().toISOString().slice(0,10)}.csv`, "text/csv");
    showToast(`Exported ${data.jobs.length} jobs ✓`);
  };

  const exportJSON = () => {
    if (!data.jobs.length) { showToast("No jobs to export", false); return; }
    downloadFile(JSON.stringify({ jobs: data.jobs, referrals: data.referrals, exportedAt: new Date().toISOString() }, null, 2),
      `job-tracker-backup-${new Date().toISOString().slice(0,10)}.json`, "application/json");
    showToast(`Full backup exported ✓`);
  };

  // ── Import preview ──
  const handleImportText = (text) => {
    setImportText(text);
    setImportError("");
    setImportPreview([]);
    if (!text.trim()) return;
    try {
      let parsed = [];
      if (importMode === "urls")   parsed = parseURLList(text);
      else if (importMode === "csv")  parsed = parseCSV(text);
      else if (importMode === "json") {
        const j = JSON.parse(text);
        parsed = Array.isArray(j) ? j : (j.jobs || []);
      }
      if (!parsed.length) { setImportError("No valid rows found. Check format and try again."); return; }
      setImportPreview(parsed.slice(0, 50));
    } catch(e) {
      setImportError("Could not parse. Check the format and try again.");
    }
  };

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "json") setImportMode("json");
    else if (ext === "csv") setImportMode("csv");
    const reader = new FileReader();
    reader.onload = (ev) => handleImportText(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmImport = (mode) => {
    if (!importPreview.length) return;
    const incoming = importPreview.map(j => ({
      ...j, id: Date.now() + Math.random(), addedAt: j.addedAt || new Date().toISOString()
    }));
    if (mode === "replace") {
      setData(d => ({ ...d, jobs: incoming }));
      showToast(`Replaced with ${incoming.length} jobs ✓`);
    } else {
      // merge — skip duplicates by URL
      const existingURLs = new Set(data.jobs.map(j => j.url).filter(Boolean));
      const fresh = incoming.filter(j => !j.url || !existingURLs.has(j.url));
      setData(d => ({ ...d, jobs: [...fresh, ...d.jobs] }));
      showToast(`Added ${fresh.length} new jobs (${incoming.length - fresh.length} skipped as duplicates) ✓`);
    }
    setImportText(""); setImportPreview([]); setImportError("");
    setSheet(null);
  };

  const detailJob = detailId ? data.jobs.find(j => j.id === detailId) : null;
  const detailRef = detailId ? data.referrals.find(r => r.id === detailId) : null;

  const filteredJobs = data.jobs.filter(j => {
    const ms = filter === "All" || j.status === filter;
    const mq = !search || j.company.toLowerCase().includes(search.toLowerCase()) || j.role.toLowerCase().includes(search.toLowerCase());
    return ms && mq;
  });

  const alertJobs = data.jobs.filter(needsFollowUp);

  // Deadline buckets
  const deadlineJobs = data.jobs
    .filter(j => j.deadline && !["Offer","Rejected"].includes(j.status))
    .map(j => ({ ...j, _ds: deadlineStatus(j.deadline) }))
    .filter(j => j._ds)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  const getDaysLeft = (deadline) => Math.ceil((new Date(deadline) - new Date().setHours(0,0,0,0)) / 86400000);
  const expiredDeadlines = deadlineJobs.filter(j => getDaysLeft(j.deadline) < 0);
  const todayDeadlines   = deadlineJobs.filter(j => getDaysLeft(j.deadline) === 0);
  const urgentDeadlines  = deadlineJobs.filter(j => getDaysLeft(j.deadline) >= 1 && getDaysLeft(j.deadline) <= 3);
  const comingDeadlines  = deadlineJobs.filter(j => getDaysLeft(j.deadline) >= 4 && getDaysLeft(j.deadline) <= 7);

  const stats = {
    total: data.jobs.length,
    applied: data.jobs.filter(j => ["Applied","Interview","Offer"].includes(j.status)).length,
    alerts: alertJobs.length,
    referrals: data.referrals.length,
    deadlineCount: deadlineJobs.length,
  };

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div style={s.root}>
      <style>{CSS}</style>

      {/* Status Bar */}
      <div style={s.statusBar}>
        <span style={{ fontSize:11, color:"#475569", letterSpacing:"0.06em" }}>JOB TRACKER</span>
        {stats.alerts > 0 && (
          <span style={s.alertBadge} className="pulse">{stats.alerts} follow-up</span>
        )}
      </div>

      {/* ── HOME TAB ── */}
      {tab === "home" && (
        <div style={s.page}>
          {/* Hero */}
          <div style={s.hero}>
            <div style={s.heroInner}>
              <div style={s.greeting}>Hey Madhu 👋</div>
              <div style={s.heroTitle}>{stats.total} Jobs<br/>Tracked</div>
              <div style={s.heroSub}>
                {stats.applied} applied · {stats.alerts > 0 ? `${stats.alerts} need action` : "all good"}
              </div>
            </div>
            <button style={s.heroBtn} className="tap" onClick={() => { setForm(blankJob); openSheet("addJob"); }}>
              + Add Job
            </button>
          </div>

          {/* Alert Strip */}
          {alertJobs.length > 0 && (
            <div style={s.alertStrip} className="tap" onClick={() => setTab("jobs")}>
              <span style={{ fontSize:18 }}>🔔</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#fed7aa" }}>Follow-up needed</div>
                <div style={{ fontSize:11, color:"#92400e", marginTop:2 }}>
                  {alertJobs.slice(0,2).map(j => j.company || "Unknown").join(", ")}
                  {alertJobs.length > 2 ? ` +${alertJobs.length-2} more` : ""}
                </div>
              </div>
              <span style={{ color:"#92400e", fontSize:18 }}>›</span>
            </div>
          )}

          {/* Stats Grid */}
          <div style={s.statsGrid}>
            {[
              { label:"Applied",   val: data.jobs.filter(j=>j.status==="Applied").length,   color:"#38bdf8" },
              { label:"Interview", val: data.jobs.filter(j=>j.status==="Interview").length, color:"#34d399" },
              { label:"Referrals", val: data.referrals.length,                              color:"#a78bfa" },
              { label:"Offers",    val: data.jobs.filter(j=>j.status==="Offer").length,     color:"#86efac" },
            ].map(st => (
              <div key={st.label} style={s.statCard}>
                <div style={{ ...s.statVal, color: st.color }}>{st.val}</div>
                <div style={s.statLabel}>{st.label}</div>
              </div>
            ))}
          </div>

          {/* ── Deadline Dashboard ── */}
          <div style={s.sectionHead}>📅 Deadlines</div>

          {deadlineJobs.length === 0 ? (
            <div style={{ margin:"0 16px 20px", padding:"20px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, textAlign:"center" }}>
              <div style={{ fontSize:28 }}>📭</div>
              <div style={{ fontSize:12, color:"#475569", marginTop:8 }}>No deadlines set yet</div>
              <div style={{ fontSize:11, color:"#334155", marginTop:4 }}>Add "Last Date to Apply" when saving jobs</div>
            </div>
          ) : (
            <div style={{ margin:"0 16px 20px", background:"#0a0f1c", border:"1px solid #1e293b", borderRadius:18, overflow:"hidden" }}>

              {/* Summary row */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", borderBottom:"1px solid #1e293b" }}>
                {[
                  { label:"Expired",  val: expiredDeadlines.length,  color:"#f87171", bg:"#2d0f0f" },
                  { label:"Today",    val: todayDeadlines.length,    color:"#fb923c", bg:"#431407" },
                  { label:"≤3 days",  val: urgentDeadlines.length,   color:"#fbbf24", bg:"#2d1c00" },
                  { label:"≤7 days",  val: comingDeadlines.length,   color:"#34d399", bg:"#052e16" },
                ].map(b => (
                  <div key={b.label} style={{ padding:"12px 6px", textAlign:"center", background: b.val > 0 ? b.bg : "transparent", borderRight:"1px solid #1e293b" }}>
                    <div style={{ fontSize:20, fontWeight:800, color: b.val > 0 ? b.color : "#334155" }}>{b.val}</div>
                    <div style={{ fontSize:9, color: b.val > 0 ? b.color : "#334155", letterSpacing:"0.05em", marginTop:2 }}>{b.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>

              {/* Expired */}
              {expiredDeadlines.length > 0 && (
                <DeadlineGroup label="⛔ Expired" jobs={expiredDeadlines} onTap={(job) => { setDetailId(job.id); openSheet("jobDetail"); }} />
              )}

              {/* Today */}
              {todayDeadlines.length > 0 && (
                <DeadlineGroup label="🚨 Deadline Today" jobs={todayDeadlines} onTap={(job) => { setDetailId(job.id); openSheet("jobDetail"); }} />
              )}

              {/* Urgent (1-3 days) */}
              {urgentDeadlines.length > 0 && (
                <DeadlineGroup label="⚡ This Week (1–3 days)" jobs={urgentDeadlines} onTap={(job) => { setDetailId(job.id); openSheet("jobDetail"); }} />
              )}

              {/* Coming (4-7 days) */}
              {comingDeadlines.length > 0 && (
                <DeadlineGroup label="📆 Coming Up (4–7 days)" jobs={comingDeadlines} onTap={(job) => { setDetailId(job.id); openSheet("jobDetail"); }} />
              )}

              {/* Beyond 7 days */}
              {deadlineJobs.filter(j => getDaysLeft(j.deadline) > 7).length > 0 && (
                <DeadlineGroup label="🕐 Beyond 7 days" jobs={deadlineJobs.filter(j => getDaysLeft(j.deadline) > 7)} onTap={(job) => { setDetailId(job.id); openSheet("jobDetail"); }} />
              )}
            </div>
          )}

          {/* Pipeline */}
          <div style={s.sectionHead}>Pipeline</div>
          <div style={s.pipeline}>
            {STATUSES.map(st => {
              const count = data.jobs.filter(j => j.status === st).length;
              const meta = STATUS_META[st];
              const pct = stats.total ? Math.round((count/stats.total)*100) : 0;
              return (
                <div key={st} style={s.pipeRow}>
                  <span style={{ fontSize:14 }}>{meta.emoji}</span>
                  <span style={{ flex:1, fontSize:12, color:"#94a3b8" }}>{st}</span>
                  <div style={s.pipeBar}>
                    <div style={{ ...s.pipeFill, width:`${pct}%`, background: meta.color }} />
                  </div>
                  <span style={{ fontSize:12, color: meta.color, minWidth:16, textAlign:"right" }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* Recent */}
          {data.jobs.length > 0 && (
            <>
              <div style={s.sectionHead}>Recent</div>
              {data.jobs.slice(0,3).map(job => (
                <JobCard key={job.id} job={job} onTap={() => { setDetailId(job.id); openSheet("jobDetail"); }} />
              ))}
              {data.jobs.length > 3 && (
                <div style={s.seeAll} className="tap" onClick={() => setTab("jobs")}>
                  See all {data.jobs.length} jobs →
                </div>
              )}
            </>
          )}

          {data.jobs.length === 0 && (
            <div style={s.empty}>
              <div style={{ fontSize:48 }}>📭</div>
              <div style={{ color:"#475569", marginTop:12, fontSize:14 }}>No jobs yet</div>
              <div style={{ color:"#334155", fontSize:12, marginTop:4 }}>Tap + Add Job to start</div>
            </div>
          )}
        </div>
      )}

      {/* ── JOBS TAB ── */}
      {tab === "jobs" && (
        <div style={s.page}>
          <div style={s.pageHeader}>
            <div style={s.pageTitle}>Jobs</div>
            <button style={s.iconBtn} className="tap" onClick={() => { setForm(blankJob); openSheet("addJob"); }}>+</button>
          </div>

          <input
            style={s.searchBar}
            placeholder="🔍  Search company or role..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div style={s.filterScroll}>
            {["All", ...STATUSES].map(f => (
              <button key={f} style={{ ...s.filterChip, ...(filter===f ? s.filterActive : {}) }}
                className="tap" onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>

          <div style={{ paddingBottom:20 }}>
            {filteredJobs.length === 0 ? (
              <div style={s.empty}>
                <div style={{ fontSize:36 }}>🔍</div>
                <div style={{ color:"#475569", marginTop:10 }}>No jobs found</div>
              </div>
            ) : filteredJobs.map(job => (
              <JobCard key={job.id} job={job} onTap={() => { setDetailId(job.id); openSheet("jobDetail"); }} />
            ))}
          </div>
        </div>
      )}

      {/* ── REFERRALS TAB ── */}
      {tab === "refs" && (
        <div style={s.page}>
          <div style={s.pageHeader}>
            <div style={s.pageTitle}>Referrals</div>
            <button style={s.iconBtn} className="tap" onClick={() => { setRefForm(blankRef); openSheet("addRef"); }}>+</button>
          </div>
          {data.referrals.length === 0 ? (
            <div style={s.empty}>
              <div style={{ fontSize:48 }}>👥</div>
              <div style={{ color:"#475569", marginTop:12 }}>No contacts yet</div>
            </div>
          ) : data.referrals.map(ref => (
            <div key={ref.id} style={s.refCard} className="tap"
              onClick={() => { setDetailId(ref.id); openSheet("refDetail"); }}>
              <div style={s.refAvatar}>{ref.name[0]?.toUpperCase() || "?"}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:"#f1f5f9" }}>{ref.name}</div>
                <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{ref.company}</div>
              </div>
              <div style={{
                fontSize:10, fontWeight:700,
                color: ref.status==="Referred" ? "#34d399" : ref.status==="Declined" ? "#f87171" : "#a78bfa",
                background: ref.status==="Referred" ? "#052e16" : ref.status==="Declined" ? "#2d0f0f" : "#1e1040",
                padding:"3px 10px", borderRadius:20,
              }}>{ref.status}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── IMPORT / EXPORT TAB ── */}
      {tab === "io" && (
        <div style={s.page}>
          <div style={s.pageHeader}>
            <div style={s.pageTitle}>Import & Export</div>
          </div>

          {/* ── EXPORT SECTION ── */}
          <div style={s.sectionHead}>📤 Export</div>
          <div style={{ margin:"0 16px 20px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, overflow:"hidden" }}>
            <div style={{ padding:"16px 16px 12px", borderBottom:"1px solid #1e293b" }}>
              <div style={{ fontSize:13, color:"#94a3b8" }}>
                Download your jobs as a file to back up or open in Excel / Google Sheets.
              </div>
              <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>{data.jobs.length} jobs · {data.referrals.length} contacts stored</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:1, background:"#1e293b" }}>
              <button className="tap" onClick={exportCSV} style={{ ...s.exportBtn, borderRadius:"0 0 0 16px" }}>
                <span style={{ fontSize:24 }}>📊</span>
                <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", marginTop:6 }}>Export CSV</div>
                <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>Open in Excel / Sheets</div>
              </button>
              <button className="tap" onClick={exportJSON} style={{ ...s.exportBtn, borderRadius:"0 0 16px 0" }}>
                <span style={{ fontSize:24 }}>💾</span>
                <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", marginTop:6 }}>Full Backup</div>
                <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>JSON with all data</div>
              </button>
            </div>
          </div>

          {/* ── IMPORT SECTION ── */}
          <div style={s.sectionHead}>📥 Import</div>
          <div style={{ margin:"0 16px 20px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, padding:16 }}>

            {/* Mode tabs */}
            <div style={{ display:"flex", gap:6, marginBottom:14 }}>
              {[
                { id:"urls", label:"🔗 Paste URLs" },
                { id:"csv",  label:"📊 CSV File"   },
                { id:"json", label:"💾 JSON Backup" },
              ].map(m => (
                <button key={m.id} className="tap"
                  style={{ flex:1, fontSize:11, fontWeight:700, padding:"7px 4px", borderRadius:10, border:"none", cursor:"pointer",
                    background: importMode===m.id ? "#0c2a3f" : "#0f172a",
                    color: importMode===m.id ? "#38bdf8" : "#475569",
                    outline: importMode===m.id ? "1px solid #3b82f6" : "1px solid #1e293b",
                  }}
                  onClick={() => { setImportMode(m.id); setImportText(""); setImportPreview([]); setImportError(""); }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* URL paste mode */}
            {importMode === "urls" && (
              <>
                <div style={s.fieldLabel}>PASTE JOB LINKS (one per line)</div>
                <textarea
                  style={{ ...s.input, resize:"none", lineHeight:1.6, height:120 }}
                  placeholder={"https://www.naukri.com/job-listings-...\nhttps://www.linkedin.com/jobs/view/...\nhttps://www.naukri.com/job-listings-..."}
                  value={importText}
                  onChange={e => handleImportText(e.target.value)}
                />
                <div style={{ fontSize:11, color:"#334155", marginTop:6 }}>
                  Auto-detects Naukri / LinkedIn. You can edit company & role after import.
                </div>
              </>
            )}

            {/* CSV / JSON file upload */}
            {(importMode === "csv" || importMode === "json") && (
              <>
                <label style={{ ...s.uploadZone, cursor:"pointer" }}>
                  <input type="file" accept={importMode==="csv" ? ".csv" : ".json"} onChange={handleFileImport} style={{ display:"none" }} />
                  <div style={{ fontSize:32, marginBottom:8 }}>📁</div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#94a3b8" }}>
                    Tap to choose {importMode.toUpperCase()} file
                  </div>
                  <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>
                    {importMode === "csv" ? "Must match exported CSV format" : "Use the backup JSON from this app"}
                  </div>
                </label>
                <div style={{ fontSize:11, color:"#475569", margin:"10px 0 4px" }}>OR paste content directly:</div>
                <textarea
                  style={{ ...s.input, resize:"none", lineHeight:1.5, height:90 }}
                  placeholder={importMode === "csv" ? "company,role,url,source,status..." : '{"jobs":[...]}'}
                  value={importText}
                  onChange={e => handleImportText(e.target.value)}
                />
              </>
            )}

            {/* Error */}
            {importError && (
              <div style={{ marginTop:10, padding:"10px 12px", background:"#2d0f0f", border:"1px solid #ef4444", borderRadius:10, fontSize:12, color:"#f87171" }}>
                ⚠️ {importError}
              </div>
            )}

            {/* Preview */}
            {importPreview.length > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:11, color:"#34d399", fontWeight:700, letterSpacing:"0.06em", marginBottom:8 }}>
                  ✓ PREVIEW — {importPreview.length} JOBS FOUND
                </div>
                <div style={{ background:"#080c14", borderRadius:10, border:"1px solid #1e293b", overflow:"hidden", marginBottom:14 }}>
                  {importPreview.slice(0,5).map((job, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                      borderBottom: i < Math.min(importPreview.length,5)-1 ? "1px solid #1e293b" : "none" }}>
                      <span style={{ fontSize:16 }}>{job.source==="Naukri" ? "🏢" : job.source==="LinkedIn" ? "💼" : "🌐"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {job.company || job.url || "Unknown"}
                        </div>
                        {job.role && <div style={{ fontSize:11, color:"#64748b" }}>{job.role}</div>}
                        {!job.company && job.url && <div style={{ fontSize:10, color:"#475569", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.url}</div>}
                      </div>
                      <span style={{ fontSize:10, color:"#64748b", background:"#1e293b", padding:"2px 8px", borderRadius:20, flexShrink:0 }}>{job.source}</span>
                    </div>
                  ))}
                  {importPreview.length > 5 && (
                    <div style={{ padding:"8px 12px", fontSize:11, color:"#475569", textAlign:"center", borderTop:"1px solid #1e293b" }}>
                      +{importPreview.length - 5} more jobs
                    </div>
                  )}
                </div>

                <div style={{ fontSize:11, color:"#94a3b8", marginBottom:10 }}>How should we handle existing jobs?</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <button className="tap" onClick={() => confirmImport("merge")}
                    style={{ padding:"12px 8px", borderRadius:12, border:"none", cursor:"pointer", background:"#0c2a3f", outline:"1px solid #3b82f6" }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>🔀</div>
                    <div style={{ fontSize:12, fontWeight:700, color:"#38bdf8" }}>Merge</div>
                    <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>Add new, skip duplicates</div>
                  </button>
                  <button className="tap" onClick={() => confirmImport("replace")}
                    style={{ padding:"12px 8px", borderRadius:12, border:"none", cursor:"pointer", background:"#2d0f0f", outline:"1px solid #ef4444" }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>♻️</div>
                    <div style={{ fontSize:12, fontWeight:700, color:"#f87171" }}>Replace All</div>
                    <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>Overwrite existing jobs</div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CSV format guide */}
          <div style={s.sectionHead}>📖 CSV Format Guide</div>
          <div style={{ margin:"0 16px 30px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:14 }}>
            <div style={{ fontSize:11, color:"#64748b", marginBottom:8 }}>Your CSV must have these column headers:</div>
            <div style={{ background:"#080c14", borderRadius:8, padding:"10px 12px", fontFamily:"monospace", fontSize:11, color:"#34d399", lineHeight:1.8, wordBreak:"break-all" }}>
              company, role, url, source, status, referral, deadline, notes
            </div>
            <div style={{ marginTop:10, fontSize:11, color:"#475569" }}>
              Valid values for <span style={{ color:"#a78bfa" }}>source</span>: Naukri · LinkedIn · Company Site · Other
            </div>
            <div style={{ marginTop:4, fontSize:11, color:"#475569" }}>
              Valid values for <span style={{ color:"#a78bfa" }}>status</span>: Saved · Applied · Referral Requested · Interview · Offer · Rejected
            </div>
            <div style={{ marginTop:4, fontSize:11, color:"#475569" }}>
              <span style={{ color:"#a78bfa" }}>deadline</span> format: YYYY-MM-DD (e.g. 2025-04-30)
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div style={s.nav}>
        {[
          { id:"home", icon:"⚡", label:"Home"     },
          { id:"jobs", icon:"📋", label:"Jobs"     },
          { id:"refs", icon:"👤", label:"Contacts" },
          { id:"io",   icon:"↕️", label:"Import"   },
        ].map(n => (
          <button key={n.id} style={{ ...s.navBtn, ...(tab===n.id ? s.navActive : {}) }}
            className="tap" onClick={() => setTab(n.id)}>
            <span style={{ fontSize:18 }}>{n.icon}</span>
            <span style={{ fontSize:10, marginTop:2 }}>{n.label}</span>
          </button>
        ))}
      </div>

      {/* ════════════════ BOTTOM SHEETS ════════════════ */}

      {/* Add / Edit Job */}
      {(sheet==="addJob") && (
        <BottomSheet title={editId ? "Edit Job" : "Add Job"} onClose={closeSheet} onSave={saveJob} saveLabel={editId?"Update":"Save"}>
          <Field label="Job URL" placeholder="Paste Naukri / LinkedIn link" value={form.url}
            onChange={v => {
              let src = form.source;
              if (v.includes("naukri")) src="Naukri";
              else if (v.includes("linkedin")) src="LinkedIn";
              setForm(f=>({...f, url:v, source:src}));
            }} />
          <Field label="Company *" placeholder="e.g. Infosys" value={form.company} onChange={v=>setForm(f=>({...f,company:v}))} />
          <Field label="Role" placeholder="e.g. Salesforce Developer" value={form.role} onChange={v=>setForm(f=>({...f,role:v}))} />
          <RadioGroup label="Source" options={SOURCES} value={form.source} onChange={v=>setForm(f=>({...f,source:v}))} />
          <RadioGroup label="Status" options={STATUSES} value={form.status} onChange={v=>setForm(f=>({...f,status:v}))} colors={STATUS_META} />
          <Field label="Referral Contact" placeholder="Name + LinkedIn" value={form.referral} onChange={v=>setForm(f=>({...f,referral:v}))} />
          <DateField label="Last Date to Apply" value={form.deadline} onChange={v=>setForm(f=>({...f,deadline:v}))} />
          <Field label="Notes" placeholder="Any notes..." value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} multiline />
        </BottomSheet>
      )}

      {/* Add / Edit Referral */}
      {(sheet==="addRef") && (
        <BottomSheet title={editId ? "Edit Contact" : "Add Contact"} onClose={closeSheet} onSave={saveRef} saveLabel={editId?"Update":"Save"}>
          <Field label="Name *" placeholder="e.g. Rahul Sharma" value={refForm.name} onChange={v=>setRefForm(f=>({...f,name:v}))} />
          <Field label="Company" placeholder="e.g. Infosys" value={refForm.company} onChange={v=>setRefForm(f=>({...f,company:v}))} />
          <Field label="LinkedIn URL" placeholder="linkedin.com/in/..." value={refForm.linkedin} onChange={v=>setRefForm(f=>({...f,linkedin:v}))} />
          <Field label="Connection" placeholder="e.g. Ex-colleague, Batch mate" value={refForm.connection} onChange={v=>setRefForm(f=>({...f,connection:v}))} />
          <RadioGroup label="Status" options={REF_STATUSES} value={refForm.status} onChange={v=>setRefForm(f=>({...f,status:v}))} />
          <Field label="Notes" placeholder="Any notes..." value={refForm.notes} onChange={v=>setRefForm(f=>({...f,notes:v}))} multiline />
        </BottomSheet>
      )}

      {/* Job Detail */}
      {sheet==="jobDetail" && detailJob && (
        <BottomSheet title="Job Details" onClose={closeSheet}
          onEdit={() => { setForm({...detailJob}); setEditId(detailJob.id); setSheet("addJob"); }}
          onDelete={() => deleteJob(detailJob.id)}>
          <div style={s.detailHero}>
            <div style={s.detailCompany}>{detailJob.company || "Unknown"}</div>
            <div style={s.detailRole}>{detailJob.role}</div>
            <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
              <Chip label={detailJob.status} color={STATUS_META[detailJob.status]?.color} bg={STATUS_META[detailJob.status]?.bg} />
              <Chip label={detailJob.source} color="#64748b" bg="#1e293b" />
              <Chip label={timeAgo(detailJob.addedAt)} color="#475569" bg="#0f172a" />
              {needsFollowUp(detailJob) && <Chip label="🔔 Follow up" color="#f59e0b" bg="#451a03" />}
              {detailJob.deadline && (() => { const ds = deadlineStatus(detailJob.deadline); return <Chip label={`📅 ${ds.label}`} color={ds.color} bg={ds.bg} />; })()}
            </div>
          </div>

          <div style={s.detailSection}>
            <div style={s.detailLabel}>UPDATE STATUS</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {STATUSES.map(st => {
                const m = STATUS_META[st];
                const active = detailJob.status === st;
                return (
                  <button key={st} className="tap" onClick={() => updateStatus(detailJob.id, st)}
                    style={{ fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:20, border:"none", cursor:"pointer",
                      background: active ? m.bg : "#0f172a",
                      color: active ? m.color : "#334155",
                      outline: active ? `1px solid ${m.color}` : "1px solid #1e293b",
                    }}>
                    {m.emoji} {st}
                  </button>
                );
              })}
            </div>
          </div>

          {detailJob.url && (
            <div style={s.detailSection}>
              <div style={s.detailLabel}>JOB URL</div>
              <a href={detailJob.url} target="_blank" rel="noreferrer"
                style={{ fontSize:13, color:"#38bdf8", wordBreak:"break-all" }}>
                {detailJob.url}
              </a>
            </div>
          )}
          {detailJob.deadline && (() => {
            const ds = deadlineStatus(detailJob.deadline);
            return (
              <div style={{ ...s.detailSection, padding:"12px 14px", background: ds.bg, borderRadius:12, border:`1px solid ${ds.color}33` }}>
                <div style={{ ...s.detailLabel, color: ds.color }}>📅 LAST DATE TO APPLY</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:16, fontWeight:700, color: ds.color }}>{formatDate(detailJob.deadline)}</div>
                  <div style={{ fontSize:12, fontWeight:700, color: ds.color, background:"rgba(0,0,0,0.3)", padding:"3px 10px", borderRadius:20 }}>{ds.label}</div>
                </div>
              </div>
            );
          })()}
          {detailJob.referral && (
            <div style={s.detailSection}>
              <div style={s.detailLabel}>REFERRAL</div>
              <div style={{ fontSize:13, color:"#a78bfa" }}>{detailJob.referral}</div>
            </div>
          )}
          {detailJob.notes && (
            <div style={s.detailSection}>
              <div style={s.detailLabel}>NOTES</div>
              <div style={{ fontSize:13, color:"#94a3b8" }}>{detailJob.notes}</div>
            </div>
          )}
        </BottomSheet>
      )}

      {/* Referral Detail */}
      {sheet==="refDetail" && detailRef && (
        <BottomSheet title="Contact" onClose={closeSheet}
          onEdit={() => { setRefForm({...detailRef}); setEditId(detailRef.id); setSheet("addRef"); }}
          onDelete={() => deleteRef(detailRef.id)}>
          <div style={s.detailHero}>
            <div style={{ ...s.refAvatar, width:56, height:56, fontSize:22, margin:"0 auto 12px" }}>
              {detailRef.name[0]?.toUpperCase()}
            </div>
            <div style={{ ...s.detailCompany, textAlign:"center" }}>{detailRef.name}</div>
            <div style={{ ...s.detailRole, textAlign:"center" }}>{detailRef.company}</div>
          </div>
          {[
            ["CONNECTION", detailRef.connection],
            ["STATUS", detailRef.status],
            ["LINKEDIN", detailRef.linkedin],
            ["NOTES", detailRef.notes],
          ].filter(([,v])=>v).map(([label, val]) => (
            <div key={label} style={s.detailSection}>
              <div style={s.detailLabel}>{label}</div>
              <div style={{ fontSize:13, color:"#94a3b8" }}>{val}</div>
            </div>
          ))}
        </BottomSheet>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ ...s.toast, background: toast.ok ? "#14532d" : "#7f1d1d", borderColor: toast.ok ? "#22c55e" : "#ef4444", color: toast.ok ? "#86efac" : "#fca5a5" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function DeadlineGroup({ label, jobs, onTap }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div style={{ borderBottom:"1px solid #1e293b" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", cursor:"pointer" }}
        onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize:12, fontWeight:700, color:"#94a3b8", letterSpacing:"0.04em" }}>{label}</span>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:11, color:"#475569", background:"#1e293b", padding:"1px 8px", borderRadius:20 }}>{jobs.length}</span>
          <span style={{ color:"#334155", fontSize:14 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && jobs.map((job, i) => {
        const ds = job._ds;
        return (
          <div key={job.id} className="tap" onClick={() => onTap(job)}
            style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px",
              background: i % 2 === 0 ? "#080c14" : "#0a0f1c",
              borderTop:"1px solid #1e293b", cursor:"pointer" }}>
            <div style={{ fontSize:18 }}>
              {job.source === "Naukri" ? "🏢" : job.source === "LinkedIn" ? "💼" : "🌐"}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {job.company || "Unknown"}
              </div>
              {job.role && <div style={{ fontSize:11, color:"#475569", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.role}</div>}
            </div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ fontSize:10, fontWeight:700, color: ds.color, background: ds.bg, padding:"2px 8px", borderRadius:20, marginBottom:3 }}>
                {ds.label}
              </div>
              <div style={{ fontSize:10, color:"#475569" }}>{formatDate(job.deadline)}</div>
            </div>
            <span style={{ color:"#334155", fontSize:16 }}>›</span>
          </div>
        );
      })}
    </div>
  );
}

function JobCard({ job, onTap }) {
  const m = STATUS_META[job.status] || STATUS_META["Saved"];
  const alert = needsFollowUp(job);
  return (
    <div style={{ ...s.jobCard, borderColor: alert ? "#78350f" : "#1e293b", background: alert ? "#1c1008" : "#0f172a" }}
      className="tap" onClick={onTap}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <div style={{ fontSize:22, marginTop:1 }}>
          {job.source==="Naukri" ? "🏢" : job.source==="LinkedIn" ? "💼" : "🌐"}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#f1f5f9", lineHeight:1.2 }}>
              {job.company || "Unknown"}
            </div>
            {alert && <span style={{ fontSize:10, color:"#f59e0b" }} className="pulse">🔔</span>}
          </div>
          {job.role && <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{job.role}</div>}
          <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:10, fontWeight:700, color:m.color, background:m.bg, padding:"2px 8px", borderRadius:20 }}>
              {m.emoji} {job.status}
            </span>
            <span style={{ fontSize:10, color:"#334155" }}>{timeAgo(job.addedAt)}</span>
            {job.referral && <span style={{ fontSize:10, color:"#8b5cf6" }}>👤</span>}
            {job.deadline && (() => { const ds = deadlineStatus(job.deadline); return (
              <span style={{ fontSize:10, fontWeight:700, color:ds.color, background:ds.bg, padding:"2px 8px", borderRadius:20 }}>
                📅 {ds.label}
              </span>
            ); })()}
          </div>
        </div>
        <div style={{ color:"#334155", fontSize:18 }}>›</div>
      </div>
    </div>
  );
}

function BottomSheet({ title, onClose, onSave, saveLabel, onEdit, onDelete, children }) {
  return (
    <>
      <div style={s.overlay} onClick={onClose} />
      <div style={s.sheet} className="slideUp">
        <div style={s.sheetHandle} />
        <div style={s.sheetHeader}>
          <div style={s.sheetTitle}>{title}</div>
          <div style={{ display:"flex", gap:8 }}>
            {onDelete && (
              <button style={{ ...s.sheetActionBtn, color:"#f87171", background:"#2d0f0f" }}
                className="tap" onClick={onDelete}>Delete</button>
            )}
            {onEdit && (
              <button style={{ ...s.sheetActionBtn, color:"#38bdf8", background:"#0c2a3f" }}
                className="tap" onClick={onEdit}>Edit</button>
            )}
            {onSave && (
              <button style={{ ...s.sheetActionBtn, color:"#fff", background:"#3b82f6" }}
                className="tap" onClick={onSave}>{saveLabel || "Save"}</button>
            )}
            <button style={{ ...s.sheetActionBtn, color:"#64748b", background:"#1e293b" }}
              className="tap" onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={s.sheetBody}>{children}</div>
      </div>
    </>
  );
}

function Field({ label, placeholder, value, onChange, multiline }) {
  const props = { placeholder, value, onChange: e => onChange(e.target.value), style: s.input };
  return (
    <div style={{ marginBottom:14 }}>
      <div style={s.fieldLabel}>{label}</div>
      {multiline
        ? <textarea {...props} rows={3} style={{ ...s.input, resize:"none", lineHeight:1.5 }} />
        : <input {...props} />}
    </div>
  );
}

function DateField({ label, value, onChange }) {
  const ds = value ? deadlineStatus(value) : null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={s.fieldLabel}>{label}</div>
      <div style={{ position:"relative" }}>
        <input
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
          min={new Date().toISOString().split("T")[0]}
          style={{ ...s.input, colorScheme:"dark" }}
        />
        {ds && (
          <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:11, fontWeight:700, color:ds.color, background:ds.bg, padding:"3px 10px", borderRadius:20 }}>
              {ds.urgent ? "⚠️" : "📅"} {ds.label}
            </span>
            {value && (
              <button onClick={() => onChange("")}
                style={{ fontSize:10, color:"#475569", background:"#1e293b", border:"none", borderRadius:20, padding:"3px 8px", cursor:"pointer" }}>
                clear
              </button>
            )}
          </div>
        )}
        {!ds && value === "" && (
          <div style={{ marginTop:5, fontSize:11, color:"#334155" }}>Optional — set if job posting has a deadline</div>
        )}
      </div>
    </div>
  );
}

function RadioGroup({ label, options, value, onChange, colors }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={s.fieldLabel}>{label}</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {options.map(o => {
          const active = value === o;
          const meta = colors?.[o];
          return (
            <button key={o} className="tap" onClick={() => onChange(o)}
              style={{ fontSize:11, fontWeight:600, padding:"5px 12px", borderRadius:20, border:"none", cursor:"pointer",
                background: active ? (meta?.bg || "#0c2a3f") : "#0f172a",
                color: active ? (meta?.color || "#38bdf8") : "#475569",
                outline: active ? `1px solid ${meta?.color || "#38bdf8"}` : "1px solid #1e293b",
              }}>
              {meta ? `${meta.emoji} ` : ""}{o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ label, color, bg }) {
  return (
    <span style={{ fontSize:11, fontWeight:700, color, background:bg, padding:"3px 10px", borderRadius:20 }}>
      {label}
    </span>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const s = {
  root: { maxWidth:430, margin:"0 auto", minHeight:"100vh", background:"#080c14", fontFamily:"'DM Sans', system-ui, sans-serif", position:"relative", overflow:"hidden" },
  statusBar: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px 0", background:"#080c14" },
  alertBadge: { fontSize:10, fontWeight:700, color:"#fed7aa", background:"#7c2d12", padding:"2px 8px", borderRadius:20 },
  page: { paddingBottom:90, overflowY:"auto", maxHeight:"calc(100vh - 0px)" },
  hero: { margin:16, padding:"24px 20px", background:"linear-gradient(135deg, #0f172a 0%, #1e1040 100%)", borderRadius:20, border:"1px solid #1e293b", display:"flex", justifyContent:"space-between", alignItems:"flex-end" },
  heroInner: {},
  greeting: { fontSize:12, color:"#64748b", letterSpacing:"0.05em", marginBottom:6 },
  heroTitle: { fontSize:32, fontWeight:800, color:"#f1f5f9", lineHeight:1.1, letterSpacing:"-0.02em" },
  heroSub: { fontSize:12, color:"#64748b", marginTop:8 },
  heroBtn: { background:"#3b82f6", color:"#fff", border:"none", borderRadius:12, padding:"10px 18px", fontSize:13, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" },
  alertStrip: { margin:"0 16px 12px", padding:"14px 16px", background:"#1c0f00", border:"1px solid #78350f", borderRadius:14, display:"flex", alignItems:"center", gap:12, cursor:"pointer" },
  statsGrid: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, padding:"0 16px 16px" },
  statCard: { background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, padding:"14px 8px", textAlign:"center" },
  statVal: { fontSize:22, fontWeight:800, letterSpacing:"-0.02em" },
  statLabel: { fontSize:10, color:"#475569", marginTop:3, letterSpacing:"0.04em" },
  sectionHead: { padding:"0 16px 10px", fontSize:12, fontWeight:700, color:"#475569", letterSpacing:"0.08em" },
  pipeline: { margin:"0 16px 20px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, padding:"14px 16px", display:"flex", flexDirection:"column", gap:10 },
  pipeRow: { display:"flex", alignItems:"center", gap:8 },
  pipeBar: { flex:1, height:4, background:"#1e293b", borderRadius:2, overflow:"hidden" },
  pipeFill: { height:"100%", borderRadius:2, transition:"width 0.6s ease" },
  jobCard: { margin:"0 16px 10px", padding:"14px 14px", borderRadius:14, border:"1px solid", cursor:"pointer" },
  empty: { textAlign:"center", padding:"60px 20px" },
  seeAll: { textAlign:"center", color:"#3b82f6", fontSize:13, padding:"10px 0 20px", cursor:"pointer" },
  pageHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 16px 12px" },
  pageTitle: { fontSize:24, fontWeight:800, color:"#f1f5f9", letterSpacing:"-0.02em" },
  iconBtn: { width:36, height:36, borderRadius:12, background:"#3b82f6", color:"#fff", border:"none", fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" },
  searchBar: { margin:"0 16px 12px", padding:"10px 14px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:12, color:"#e2e8f0", fontSize:13, width:"calc(100% - 32px)", outline:"none", fontFamily:"inherit" },
  filterScroll: { display:"flex", gap:6, padding:"0 16px 14px", overflowX:"auto" },
  filterChip: { flexShrink:0, fontSize:11, fontWeight:600, padding:"5px 12px", borderRadius:20, border:"none", cursor:"pointer", background:"#0f172a", color:"#475569", outline:"1px solid #1e293b" },
  filterActive: { background:"#0c2a3f", color:"#38bdf8", outline:"1px solid #3b82f6" },
  refCard: { margin:"0 16px 10px", padding:"14px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:14, display:"flex", alignItems:"center", gap:12, cursor:"pointer" },
  refAvatar: { width:42, height:42, borderRadius:14, background:"linear-gradient(135deg,#4f46e5,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color:"#fff", flexShrink:0 },
  nav: { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(8,12,20,0.95)", backdropFilter:"blur(12px)", borderTop:"1px solid #1e293b", display:"flex", justifyContent:"space-around", padding:"8px 0 16px", zIndex:100 },
  navBtn: { display:"flex", flexDirection:"column", alignItems:"center", gap:2, background:"none", border:"none", cursor:"pointer", color:"#475569", padding:"4px 20px", borderRadius:10, fontSize:12 },
  navActive: { color:"#38bdf8", background:"#0c2a3f" },
  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:200, backdropFilter:"blur(2px)" },
  sheet: { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"#0f172a", borderRadius:"24px 24px 0 0", zIndex:201, maxHeight:"85vh", display:"flex", flexDirection:"column" },
  sheetHandle: { width:36, height:4, background:"#334155", borderRadius:2, margin:"12px auto 0" },
  sheetHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px 12px", borderBottom:"1px solid #1e293b" },
  sheetTitle: { fontSize:16, fontWeight:700, color:"#f1f5f9" },
  sheetActionBtn: { fontSize:12, fontWeight:700, padding:"6px 14px", borderRadius:10, border:"none", cursor:"pointer" },
  sheetBody: { overflowY:"auto", padding:"16px 20px 32px" },
  input: { width:"100%", background:"#080c14", border:"1px solid #1e293b", color:"#e2e8f0", borderRadius:10, padding:"10px 14px", fontSize:13, fontFamily:"inherit", outline:"none" },
  fieldLabel: { fontSize:11, color:"#475569", letterSpacing:"0.07em", marginBottom:6, fontWeight:600 },
  detailHero: { padding:"4px 0 20px", borderBottom:"1px solid #1e293b", marginBottom:16 },
  detailCompany: { fontSize:22, fontWeight:800, color:"#f1f5f9", letterSpacing:"-0.02em" },
  detailRole: { fontSize:14, color:"#64748b", marginTop:4 },
  detailSection: { marginBottom:16 },
  detailLabel: { fontSize:10, color:"#475569", letterSpacing:"0.08em", fontWeight:700, marginBottom:5 },
  toast: { position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", padding:"10px 20px", borderRadius:10, border:"1px solid", fontSize:13, fontWeight:600, zIndex:300, whiteSpace:"nowrap" },
  exportBtn: { padding:"18px 12px", background:"#0f172a", border:"none", cursor:"pointer", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center" },
  uploadZone: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", background:"#080c14", border:"2px dashed #1e293b", borderRadius:12, textAlign:"center", marginBottom:4 },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
body { background: #080c14; }
::-webkit-scrollbar { display:none; }
.tap { transition: transform 0.1s, opacity 0.1s; }
.tap:active { transform: scale(0.95); opacity: 0.8; }
.pulse { animation: pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.slideUp { animation: slideUp 0.3s cubic-bezier(0.32,0.72,0,1); }
@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
input::placeholder, textarea::placeholder { color:#334155; }
input:focus, textarea:focus { border-color:#3b82f6 !important; }
a { color: #38bdf8; }
`;
