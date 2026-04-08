import { useState, useMemo, useEffect, useCallback } from "react";
import { BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import DATA from "./data.json";

/* ─── Colors ─── */
const FAMILY_COLORS = {
  "Heavy Plate": "#7c3aed", CRC: "#2563eb",
  "Coated — HDG": "#16a34a", "Coated — Galvalume": "#0891b2",
  "Coated — Aluminized": "#d97706", "Coated — EG": "#ea580c",
  "Coated — Pre-painted": "#e11d48", "Coated — Other Metallic": "#6b7280",
};
const ORIGIN_COLORS = [
  "#2563eb","#dc2626","#16a34a","#d97706","#7c3aed","#0891b2","#e11d48",
  "#4338ca","#059669","#a16207","#6b7280","#10b981","#be185d","#a3a3a3",
  "#1d4ed8","#b91c1c","#15803d","#b45309"
];
const fmt = (n) => n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(0)}K` : String(n);
const fmtN = (n) => typeof n === "number" ? n.toLocaleString() : n;

/* ─── Hooks ─── */
const useIsMobile = () => {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return m;
};

/* ─── Shared Components ─── */
const KPI = ({ value, label, sub, color, compact }) => (
  <div style={{ background: "#fff", borderRadius: 12, padding: compact ? "10px 12px" : "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,.08)", borderTop: `3px solid ${color || "#2563eb"}`, flex: 1, minWidth: compact ? 80 : 110 }}>
    <div style={{ fontSize: compact ? 18 : 26, fontWeight: 700, color: color || "#1e3a5f", lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: compact ? 10 : 12, color: "#64748b", marginTop: compact ? 2 : 4 }}>{label}</div>
    {sub && <div style={{ fontSize: compact ? 9 : 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
  </div>
);

const Card = ({ title, children, style: s, headerRight }) => (
  <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,.08)", ...s }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1e3a5f" }}>{title}</div>
      {headerRight}
    </div>
    {children}
  </div>
);

const Pill = ({ label, active, onClick, color }) => (
  <button onClick={onClick} style={{
    padding: "5px 14px", borderRadius: 20, border: active ? "none" : "1px solid #cbd5e1",
    background: active ? (color || "#2563eb") : "#fff", color: active ? "#fff" : "#475569",
    fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", minHeight: 30,
    transition: "all .15s"
  }}>{label}</button>
);

const Toggle = ({ options, value, onChange }) => (
  <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 8, padding: 2 }}>
    {options.map(o => (
      <button key={o.value} onClick={() => onChange(o.value)} style={{
        padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 500,
        background: value === o.value ? "#fff" : "transparent", color: value === o.value ? "#1e3a5f" : "#94a3b8",
        cursor: "pointer", boxShadow: value === o.value ? "0 1px 2px rgba(0,0,0,.1)" : "none"
      }}>{o.label}</button>
    ))}
  </div>
);

const MiniBar = ({ data, color, max: maxOverride }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {data.map((d, i) => {
      const max = maxOverride || data[0]?.vol || 1;
      return (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 140, fontSize: 11, color: "#475569", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{d.name}</div>
          <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 4, height: 20, overflow: "hidden" }}>
            <div style={{ width: `${Math.min((d.vol / max) * 100, 100)}%`, background: color || ORIGIN_COLORS[i % ORIGIN_COLORS.length], height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
          </div>
          <div style={{ width: 60, fontSize: 11, color: "#64748b", textAlign: "right", flexShrink: 0 }}>{fmt(d.vol)}</div>
        </div>
      );
    })}
  </div>
);

/* ─── Data helpers ─── */
const periodToMonths = (period, timeMode) => {
  if (timeMode === "month") return [period]; // "2024-03" → ["2024-03"]
  if (timeMode === "quarter") {
    const [y, q] = period.split("-Q");
    const start = (parseInt(q) - 1) * 3 + 1;
    return [0, 1, 2].map(i => `${y}-${String(start + i).padStart(2, "0")}`);
  }
  // year → all 12 months
  return Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, "0")}`);
};

const aggregateByTime = (records, timeMode) => {
  const map = {};
  records.forEach(r => {
    let key;
    if (timeMode === "quarter") {
      const [y, m] = r.month.split("-");
      key = `${y}-Q${Math.ceil(parseInt(m) / 3)}`;
    } else if (timeMode === "year") {
      key = r.month.split("-")[0];
    } else {
      key = r.month;
    }
    if (!map[key]) map[key] = { period: key, vol: 0, val: 0, txn: 0 };
    map[key].vol += r.vol || 0;
    map[key].val += r.val || 0;
    map[key].txn += r.txn || 0;
  });
  return Object.values(map).sort((a, b) => a.period.localeCompare(b.period)).map(d => ({
    ...d, avg_price: d.vol > 0 ? Math.round(d.val / d.vol) : 0
  }));
};

/* ─── Main Dashboard ─── */
export default function Dashboard() {
  const isMobile = useIsMobile();
  const pad = isMobile ? 12 : 28;

  const [selFamily, setSelFamily] = useState(null); // null = all
  const [timeMode, setTimeMode] = useState("month");
  const [selOrigin, setSelOrigin] = useState(null);
  const [selPeriod, setSelPeriod] = useState(null); // clicked period from chart
  const [selSupplier, setSelSupplier] = useState(null);

  const families = DATA.meta.families;

  // Months that correspond to the selected period
  const selMonths = useMemo(() => selPeriod ? new Set(periodToMonths(selPeriod, timeMode)) : null, [selPeriod, timeMode]);

  // Helper to filter records by selected period
  const filterByPeriod = useCallback((records) => {
    if (!selMonths) return records;
    return records.filter(r => selMonths.has(r.month));
  }, [selMonths]);

  // Bar click handler (Recharts Bar onClick gives the bar's data directly)
  const handleBarClick = useCallback((data) => {
    if (!data?.period) return;
    setSelPeriod(prev => prev === data.period ? null : data.period);
  }, []);

  // When a supplier is selected, derive monthlyFamily-like data from DATA.suppliers
  const supplierMonthlyFamily = useMemo(() => {
    if (!selSupplier) return null;
    let src = DATA.suppliers.filter(r => r.supplier === selSupplier);
    // Aggregate by month+family (suppliers data is already keyed by month/family/origin/supplier)
    const map = {};
    src.forEach(r => {
      const k = `${r.month}|${r.family}`;
      if (!map[k]) map[k] = { month: r.month, family: r.family, vol: 0, val: 0, txn: 0 };
      map[k].vol += r.vol; map[k].val += r.val; map[k].txn += r.txn || 0;
    });
    return Object.values(map);
  }, [selSupplier]);

  const supplierMonthlyOrigin = useMemo(() => {
    if (!selSupplier) return null;
    let src = DATA.suppliers.filter(r => r.supplier === selSupplier);
    // This is already keyed by month/family/origin/supplier, aggregate by month+family+origin
    const map = {};
    src.forEach(r => {
      const k = `${r.month}|${r.family}|${r.origin}`;
      if (!map[k]) map[k] = { month: r.month, family: r.family, origin: r.origin, vol: 0, val: 0, txn: 0 };
      map[k].vol += r.vol; map[k].val += r.val; map[k].txn += r.txn || 0;
    });
    return Object.values(map);
  }, [selSupplier]);

  const supplierMonthlyOriginAll = useMemo(() => {
    if (!selSupplier) return null;
    let src = DATA.suppliers.filter(r => r.supplier === selSupplier);
    const map = {};
    src.forEach(r => {
      const k = `${r.month}|${r.origin}`;
      if (!map[k]) map[k] = { month: r.month, origin: r.origin, vol: 0, val: 0, txn: 0 };
      map[k].vol += r.vol; map[k].val += r.val; map[k].txn += r.txn || 0;
    });
    return Object.values(map);
  }, [selSupplier]);

  // Filter data by selected family
  const mfData = useMemo(() => {
    let d = selSupplier ? supplierMonthlyFamily : DATA.monthlyFamily;
    if (!d) return [];
    if (selFamily) d = d.filter(r => r.family === selFamily);
    if (selOrigin) return []; // handled by origin view
    return d;
  }, [selFamily, selOrigin, selSupplier, supplierMonthlyFamily]);

  const moData = useMemo(() => {
    const base = selSupplier ? supplierMonthlyOrigin : DATA.monthlyOrigin;
    const baseAll = selSupplier ? supplierMonthlyOriginAll : DATA.monthlyOriginAll;
    if (!base || !baseAll) return [];
    let d = selFamily ? base.filter(r => r.family === selFamily) : baseAll;
    if (selOrigin) d = d.filter(r => r.origin === selOrigin);
    return d;
  }, [selFamily, selOrigin, selSupplier, supplierMonthlyOrigin, supplierMonthlyOriginAll]);

  // Volume over time
  const volumeTime = useMemo(() => {
    if (selOrigin) return aggregateByTime(moData.map(r => ({ ...r, month: r.month })), timeMode);
    return aggregateByTime(mfData, timeMode);
  }, [mfData, moData, selOrigin, timeMode]);

  // Stacked by family over time
  const stackedTime = useMemo(() => {
    if (selFamily) return null;
    const src = filterByPeriod(selSupplier ? (supplierMonthlyFamily || []) : DATA.monthlyFamily);
    const map = {};
    src.forEach(r => {
      let key;
      if (timeMode === "quarter") { const [y, m] = r.month.split("-"); key = `${y}-Q${Math.ceil(parseInt(m)/3)}`; }
      else if (timeMode === "year") { key = r.month.split("-")[0]; }
      else { key = r.month; }
      if (!map[key]) map[key] = { period: key };
      map[key][r.family] = (map[key][r.family] || 0) + r.vol;
    });
    return Object.values(map).sort((a, b) => a.period.localeCompare(b.period));
  }, [selFamily, timeMode, filterByPeriod, selSupplier, supplierMonthlyFamily]);

  // Price over time by origin (top 5 origins, or just selected origin)
  const priceByOrigin = useMemo(() => {
    const base = selSupplier ? (supplierMonthlyOrigin || []) : DATA.monthlyOrigin;
    const baseAll = selSupplier ? (supplierMonthlyOriginAll || []) : DATA.monthlyOriginAll;
    let src = selFamily ? base.filter(r => r.family === selFamily) : baseAll;
    if (selOrigin) src = src.filter(r => r.origin === selOrigin);
    src = filterByPeriod(src);
    // Get top origins by volume
    const originVols = {};
    src.forEach(r => { originVols[r.origin] = (originVols[r.origin] || 0) + r.vol; });
    const topN = Object.entries(originVols).sort((a, b) => b[1] - a[1]).slice(0, selOrigin ? 1 : 6).map(([o]) => o);
    // Build price series
    const map = {};
    src.filter(r => topN.includes(r.origin)).forEach(r => {
      let key;
      if (timeMode === "quarter") { const [y, m] = r.month.split("-"); key = `${y}-Q${Math.ceil(parseInt(m)/3)}`; }
      else if (timeMode === "year") { key = r.month.split("-")[0]; }
      else { key = r.month; }
      if (!map[key]) map[key] = { period: key };
      if (!map[key][`${r.origin}_vol`]) { map[key][`${r.origin}_vol`] = 0; map[key][`${r.origin}_val`] = 0; }
      map[key][`${r.origin}_vol`] += r.vol;
      map[key][`${r.origin}_val`] += r.val;
    });
    const series = Object.values(map).sort((a, b) => a.period.localeCompare(b.period)).map(d => {
      const out = { period: d.period };
      topN.forEach(o => { out[o] = d[`${o}_vol`] > 0 ? Math.round(d[`${o}_val`] / d[`${o}_vol`]) : null; });
      return out;
    });
    return { origins: topN, data: series };
  }, [selFamily, selOrigin, timeMode, filterByPeriod, selSupplier, supplierMonthlyOrigin, supplierMonthlyOriginAll]);

  // Origin breakdown
  const originData = useMemo(() => {
    const base = selSupplier ? (supplierMonthlyOrigin || []) : DATA.monthlyOrigin;
    const baseAll = selSupplier ? (supplierMonthlyOriginAll || []) : DATA.monthlyOriginAll;
    let src = selFamily ? base.filter(r => r.family === selFamily) : baseAll;
    src = filterByPeriod(src);
    const map = {};
    src.forEach(r => {
      if (!map[r.origin]) map[r.origin] = { name: r.origin, vol: 0, val: 0 };
      map[r.origin].vol += r.vol;
      map[r.origin].val += r.val;
    });
    return Object.values(map).sort((a, b) => b.vol - a.vol).map(d => ({
      ...d, avg_price: d.vol > 0 ? Math.round(d.val / d.vol) : 0
    }));
  }, [selFamily, filterByPeriod, selSupplier, supplierMonthlyOrigin, supplierMonthlyOriginAll]);

  // Family breakdown (pie)
  const familyPie = useMemo(() => {
    const src = filterByPeriod(selSupplier ? (supplierMonthlyFamily || []) : DATA.monthlyFamily);
    const map = {};
    src.forEach(r => { map[r.family] = (map[r.family] || 0) + r.vol; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [filterByPeriod, selSupplier, supplierMonthlyFamily]);

  // Subtype breakdown (not available when filtered by supplier)
  const subtypeData = useMemo(() => {
    if (!selFamily || selSupplier) return null;
    const src = filterByPeriod(DATA.monthlySub.filter(r => r.family === selFamily));
    const map = {};
    src.forEach(r => {
      if (!map[r.subtype]) map[r.subtype] = { name: r.subtype, vol: 0, val: 0 };
      map[r.subtype].vol += r.vol;
      map[r.subtype].val += r.val;
    });
    return Object.values(map).sort((a, b) => b.vol - a.vol);
  }, [selFamily, selSupplier, filterByPeriod]);

  // Top importers
  const topImporters = useMemo(() => {
    let src = selFamily ? DATA.importers.filter(r => r.family === selFamily) : DATA.importers;
    if (selOrigin) src = src.filter(r => r.origin === selOrigin);
    if (selSupplier) src = src.filter(r => r.supplier === selSupplier);
    src = filterByPeriod(src);
    const map = {};
    src.forEach(r => {
      if (!map[r.company]) map[r.company] = { name: r.company, vol: 0, val: 0, txn: 0 };
      map[r.company].vol += r.vol;
      map[r.company].val += r.val;
      map[r.company].txn += r.txn;
    });
    return Object.values(map).sort((a, b) => b.vol - a.vol).slice(0, 15).map(d => ({
      ...d, avg_price: d.vol > 0 ? Math.round(d.val / d.vol) : 0
    }));
  }, [selFamily, selOrigin, selSupplier, filterByPeriod]);

  // Top suppliers
  const topSuppliers = useMemo(() => {
    let src = selFamily ? DATA.suppliers.filter(r => r.family === selFamily) : DATA.suppliers;
    if (selOrigin) src = src.filter(r => r.origin === selOrigin);
    if (selSupplier) src = src.filter(r => r.supplier === selSupplier);
    src = filterByPeriod(src);
    const map = {};
    src.forEach(r => {
      if (!map[r.supplier]) map[r.supplier] = { name: r.supplier, vol: 0, val: 0, txn: 0 };
      map[r.supplier].vol += r.vol;
      map[r.supplier].val += r.val;
      map[r.supplier].txn += r.txn;
    });
    return Object.values(map).sort((a, b) => b.vol - a.vol).slice(0, 15).map(d => ({
      ...d, avg_price: d.vol > 0 ? Math.round(d.val / d.vol) : 0
    }));
  }, [selFamily, selOrigin, selSupplier, filterByPeriod]);

  // Customs ports
  const topPorts = useMemo(() => {
    let src = selFamily ? DATA.customs.filter(r => r.family === selFamily) : DATA.customs;
    if (selOrigin) src = src.filter(r => r.origin === selOrigin);
    if (selSupplier) src = src.filter(r => r.supplier === selSupplier);
    src = filterByPeriod(src);
    const map = {};
    src.forEach(r => {
      if (!map[r.customs]) map[r.customs] = { name: r.customs, vol: 0 };
      map[r.customs].vol += r.vol;
    });
    return Object.values(map).sort((a, b) => b.vol - a.vol).slice(0, 12);
  }, [selFamily, selOrigin, selSupplier, filterByPeriod]);

  // KPI totals
  const totals = useMemo(() => {
    const src = filterByPeriod(selOrigin ? moData : mfData);
    const vol = src.reduce((s, r) => s + r.vol, 0);
    const val = src.reduce((s, r) => s + r.val, 0);
    const txn = src.reduce((s, r) => s + (r.txn || 0), 0);
    return { vol, val, txn, avg: vol > 0 ? Math.round(val / vol) : 0, origins: originData.length };
  }, [mfData, moData, selOrigin, originData, filterByPeriod]);

  const clearFilters = () => { setSelFamily(null); setSelOrigin(null); setSelPeriod(null); setSelSupplier(null); };

  const tickFormatter = (v) => {
    if (timeMode === "month") { const parts = v.split("-"); return `${parts[1]}/${parts[0].slice(2)}`; }
    return v;
  };

  const priceTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,.1)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {payload.filter(p => p.value != null).map(p => (
          <div key={p.dataKey} style={{ fontSize: 11, color: p.color, display: "flex", gap: 8 }}>
            <span>{p.dataKey}:</span>
            <span style={{ fontWeight: 600 }}>${fmtN(p.value)}/mt</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", padding: isMobile ? "14px 12px" : "20px 28px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: 700, letterSpacing: -0.5 }}>Mexico Steel Import Statistics</div>
            {!isMobile && <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>Flat Products — Volume, Price & Origin Intelligence ({DATA.meta.dateRange[0].slice(0,4)})</div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ color: "#60a5fa", fontWeight: 600, fontSize: isMobile ? 16 : 20 }}>{fmt(totals.vol)} mt</div>
            <div style={{ fontSize: isMobile ? 10 : 12, color: "#94a3b8" }}>{selFamily || "All Products"}{selPeriod ? ` · ${selPeriod}` : ""}{selOrigin ? ` · ${selOrigin}` : ""}{selSupplier ? ` · ${selSupplier}` : ""}</div>
          </div>
        </div>
      </div>

      {/* Product Family Selector */}
      <div style={{ background: "#fff", padding: `10px ${pad}px`, borderBottom: "1px solid #e2e8f0", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginRight: 4 }}>Product:</span>
        <Pill label="All" active={!selFamily} onClick={() => { setSelFamily(null); setSelOrigin(null); setSelPeriod(null); setSelSupplier(null); }} />
        {families.map(f => <Pill key={f} label={f.replace("Coated — ", "")} active={selFamily === f} onClick={() => { setSelFamily(f); setSelOrigin(null); setSelPeriod(null); setSelSupplier(null); }} color={FAMILY_COLORS[f]} />)}
        <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 4px" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginRight: 4 }}>Origin:</span>
        <select value={selOrigin || ""} onChange={e => setSelOrigin(e.target.value || null)} style={{
          padding: "5px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12,
          background: selOrigin ? "#dbeafe" : "#fff", color: selOrigin ? "#2563eb" : "#475569",
          fontWeight: selOrigin ? 600 : 400, cursor: "pointer", minHeight: 30,
          outline: "none", appearance: "auto"
        }}>
          <option value="">All Countries</option>
          {DATA.meta.origins.map(o => <option key={o} value={o}>{o.charAt(0) + o.slice(1).toLowerCase()}</option>)}
        </select>
        <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 4px" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginRight: 4 }}>Supplier:</span>
        <select value={selSupplier || ""} onChange={e => setSelSupplier(e.target.value || null)} style={{
          padding: "5px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12,
          background: selSupplier ? "#dbeafe" : "#fff", color: selSupplier ? "#2563eb" : "#475569",
          fontWeight: selSupplier ? 600 : 400, cursor: "pointer", minHeight: 30, maxWidth: 220,
          outline: "none", appearance: "auto"
        }}>
          <option value="">All Suppliers</option>
          {DATA.meta.suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 4px" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginRight: 4 }}>Period:</span>
        <Toggle options={[{ label: "Monthly", value: "month" }, { label: "Quarterly", value: "quarter" }, { label: "Yearly", value: "year" }]} value={timeMode} onChange={v => { setTimeMode(v); setSelPeriod(null); }} />
        {selPeriod && (
          <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 500, marginLeft: 4 }}>
            {selPeriod}
            <span onClick={() => setSelPeriod(null)} style={{ cursor: "pointer", marginLeft: 4, fontWeight: 700 }}>&times;</span>
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: `16px ${pad}px` }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: isMobile ? 6 : 12, marginBottom: 16 }}>
          <KPI value={fmt(totals.vol)} label="Total Volume" sub="metric tons" color="#2563eb" compact={isMobile} />
          <KPI value={`$${fmt(totals.val)}`} label="CIF Value" sub="USD" color="#16a34a" compact={isMobile} />
          <KPI value={`$${fmtN(totals.avg)}`} label="Avg CIF Price" sub="per mt" color="#d97706" compact={isMobile} />
          {!isMobile && <KPI value={fmtN(totals.txn)} label="Transactions" color="#7c3aed" compact={isMobile} />}
          <KPI value={totals.origins} label="Origins" sub="countries" color="#0891b2" compact={isMobile} />
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 16 }}>

          {/* Volume + Price Trend */}
          <Card title="Volume & Price Trend" style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
            <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
              <ComposedChart data={volumeTime} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={tickFormatter} />
                <YAxis yAxisId="vol" tick={{ fontSize: 10 }} tickFormatter={fmt} />
                <YAxis yAxisId="price" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v, n) => [n === "avg_price" ? `$${fmtN(v)}/mt` : `${fmtN(v)} mt`, n === "avg_price" ? "Avg CIF Price" : "Volume"]} />
                <Bar yAxisId="vol" dataKey="vol" radius={[4, 4, 0, 0]} name="Volume" onClick={handleBarClick} style={{ cursor: "pointer" }}>
                  {volumeTime.map((entry) => (
                    <Cell key={entry.period} fill="#2563eb" opacity={!selPeriod ? 0.8 : entry.period === selPeriod ? 1 : 0.25} />
                  ))}
                </Bar>
                <Line yAxisId="price" dataKey="avg_price" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} name="avg_price" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Stacked Volume by Family (only when no family selected) */}
          {!selFamily && stackedTime && (
            <Card title="Volume by Product Family" style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
                <BarChart data={stackedTime} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={tickFormatter} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
                  <Tooltip formatter={(v, n) => [`${fmtN(v)} mt`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {families.map(f => <Bar key={f} dataKey={f} stackId="a" fill={FAMILY_COLORS[f] || "#6b7280"} name={f.replace("Coated — ", "")} />)}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Price by Origin */}
          <Card title={`CIF Price by Origin ($/mt)${selFamily ? " — " + selFamily : ""}`} style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 260}>
              <LineChart data={priceByOrigin.data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} tickFormatter={tickFormatter} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                <Tooltip content={priceTooltip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {priceByOrigin.origins.map((o, i) => (
                  <Line key={o} dataKey={o} stroke={ORIGIN_COLORS[i]} strokeWidth={2} dot={{ r: 2 }} connectNulls name={o} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Product Family Pie (when all selected) */}
          {!selFamily ? (
            <Card title="Volume by Product Family">
              <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row" }}>
                <ResponsiveContainer width={isMobile ? "100%" : "50%"} height={200}>
                  <PieChart>
                    <Pie data={familyPie} dataKey="value" cx="50%" cy="50%" outerRadius={isMobile ? 70 : 80} innerRadius={isMobile ? 35 : 40} paddingAngle={2}>
                      {familyPie.map(d => <Cell key={d.name} fill={FAMILY_COLORS[d.name] || "#6b7280"} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${fmt(v)} mt`]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, width: isMobile ? "100%" : "auto" }}>
                  {familyPie.map(d => (
                    <div key={d.name} onClick={() => setSelFamily(d.name)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "3px 4px", borderRadius: 4 }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: FAMILY_COLORS[d.name] || "#6b7280", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#475569", flex: 1 }}>{d.name.replace("Coated — ", "")}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#1e3a5f" }}>{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : subtypeData && subtypeData.length > 1 ? (
            <Card title={`${selFamily} — Sub-types`}>
              <MiniBar data={subtypeData} />
            </Card>
          ) : null}

          {/* Origin Breakdown */}
          <Card title={`Top Origins by Volume${selFamily ? " — " + selFamily.replace("Coated — ", "") : ""}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {originData.slice(0, 12).map((d, i) => (
                <div key={d.name} onClick={() => setSelOrigin(d.name === selOrigin ? null : d.name)}
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "2px 0", borderRadius: 4 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ width: 110, fontSize: 11, color: selOrigin === d.name ? "#2563eb" : "#475569", fontWeight: selOrigin === d.name ? 600 : 400, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{d.name}</div>
                  <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 4, height: 20, overflow: "hidden" }}>
                    <div style={{ width: `${(d.vol / originData[0].vol) * 100}%`, background: ORIGIN_COLORS[i % ORIGIN_COLORS.length], height: "100%", borderRadius: 4, opacity: selOrigin && selOrigin !== d.name ? 0.3 : 1 }} />
                  </div>
                  <div style={{ width: 55, fontSize: 11, color: "#64748b", textAlign: "right", flexShrink: 0 }}>{fmt(d.vol)}</div>
                  <div style={{ width: 55, fontSize: 10, color: "#94a3b8", textAlign: "right", flexShrink: 0 }}>${fmtN(d.avg_price)}/mt</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Top Importers */}
          <Card title={`Top Importers${selFamily ? " — " + selFamily.replace("Coated — ", "") : ""}`}>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ textAlign: "left", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>Company</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>Volume</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>$/mt</th>
                  </tr>
                </thead>
                <tbody>
                  {topImporters.map((d, i) => (
                    <tr key={d.name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "5px 4px", color: "#334155", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: "#475569", fontWeight: 500 }}>{fmt(d.vol)}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: "#94a3b8" }}>{fmtN(d.avg_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Top Suppliers */}
          <Card title={`Top Suppliers${selFamily ? " — " + selFamily.replace("Coated — ", "") : ""}`}>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ textAlign: "left", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>Supplier</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>Volume</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>$/mt</th>
                  </tr>
                </thead>
                <tbody>
                  {topSuppliers.map((d, i) => (
                    <tr key={d.name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "5px 4px", color: "#334155", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: "#475569", fontWeight: 500 }}>{fmt(d.vol)}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: "#94a3b8" }}>{fmtN(d.avg_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Customs Ports */}
          <Card title={`Top Entry Ports${selFamily ? " — " + selFamily.replace("Coated — ", "") : ""}`}>
            <MiniBar data={topPorts} color="#7c3aed" />
          </Card>

          {/* Origin Price Table */}
          <Card title={`Origin Price Comparison ($/mt CIF)${selFamily ? " — " + selFamily.replace("Coated — ", "") : ""}`}>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ textAlign: "left", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>Origin</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>Vol (mt)</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>Avg $/mt</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", color: "#64748b", fontWeight: 600 }}>CIF Value</th>
                  </tr>
                </thead>
                <tbody>
                  {originData.slice(0, 20).map(d => (
                    <tr key={d.name} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                      onClick={() => setSelOrigin(d.name === selOrigin ? null : d.name)}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "5px 4px", color: selOrigin === d.name ? "#2563eb" : "#334155", fontWeight: selOrigin === d.name ? 600 : 400 }}>{d.name}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: "#475569" }}>{fmtN(d.vol)}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", fontWeight: 600, color: d.avg_price > 800 ? "#dc2626" : d.avg_price > 600 ? "#d97706" : "#16a34a" }}>${fmtN(d.avg_price)}</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", color: "#94a3b8" }}>${fmt(d.val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Footer note */}
        <div style={{ marginTop: 16, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: isMobile ? "10px 14px" : "14px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 4 }}>Data Notes</div>
          <div style={{ fontSize: 11, color: "#78350f", lineHeight: 1.5 }}>
            Source: Mexico customs import records ({DATA.meta.dateRange[0]} to {DATA.meta.dateRange[1]}). {fmtN(DATA.meta.totalRows)} transactions.
            HS chapters: 7208 (Heavy Plate), 7209 (CRC), 7210 (Coated non-alloy), 7225.92 (Coated alloy steel).
            Magnelis (ZnAlMg) is included within HDG — HS code does not distinguish coating chemistry.
            CIF prices are declared import values and may not reflect spot market pricing.
            Product taxonomy will expand as additional HS chapters (HRC coils, longs, pipes, stainless) are added.
          </div>
        </div>
      </div>
    </div>
  );
}
