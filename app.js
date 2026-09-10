/* DataArt HCLS — client-side app logic. Everything below runs against the in-memory DATA object from data.js. */

(function () {
  "use strict";

  const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const ACTIVITY_ICON = { info: "i", success: "✓", warning: "!" };

  /* ============================================================= */
  /* THEME (light / dark)                                           */
  /* ============================================================= */

  const THEME_KEY = "hcls-theme";
  const THEME_COLORS = {
    light: { text: "#5b6778", strong: "#0d1420", grid: "rgba(13,20,32,.06)", brand: "#284086", info: "#0e7ba0", critical: "#d33a26" },
    dark: { text: "#96a2b8", strong: "#eef1f5", grid: "rgba(248,250,250,.10)", brand: "#8fb2f0", info: "#5fd0f0", critical: "#ff8a75" },
  };
  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function themeColors() { return THEME_COLORS[currentTheme()]; }

  function refreshAllCharts() {
    if (typeof Chart === "undefined" || !Chart.instances) return;
    const t = themeColors();
    Object.values(Chart.instances).forEach((chart) => {
      const scales = (chart.options && chart.options.scales) || {};
      Object.keys(scales).forEach((key) => {
        const scale = scales[key];
        if (scale.ticks) scale.ticks.color = t.text;
        if (scale.grid) scale.grid.color = t.grid;
        if (scale.title) scale.title.color = t.text;
      });
      chart.update();
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private browsing / restricted storage */ }
    Chart.defaults.color = themeColors().text;
    refreshAllCharts();
  }

  function initTheme() {
    let saved = "light";
    try { saved = localStorage.getItem(THEME_KEY) || "light"; } catch (e) { /* ignore */ }
    document.documentElement.setAttribute("data-theme", saved);
    const btn = $("#theme-toggle");
    if (btn) btn.addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));
  }
  // Restore the saved theme immediately (before any chart is created) so first-paint colors are correct.
  initTheme();

  Chart.defaults.font.family = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
  Chart.defaults.color = themeColors().text;
  Chart.defaults.animation = REDUCED_MOTION ? false : { duration: 500 };

  // Shared plugin used to draw a small text annotation next to one data point.
  // ann.role picks a theme-aware color at draw time so annotations stay legible after a theme toggle.
  const boothAnnotations = {
    id: "boothAnnotations",
    afterDatasetsDraw(chart) {
      const list = chart.$annotations;
      if (!list) return;
      const ctx = chart.ctx;
      const t = themeColors();
      list.forEach((ann) => {
        const meta = chart.getDatasetMeta(ann.datasetIndex);
        const pt = meta && meta.data && meta.data[ann.dataIndex];
        if (!pt) return;
        ctx.save();
        ctx.font = "700 11px Arial, Helvetica, sans-serif";
        ctx.fillStyle = ann.color || t[ann.role || "brand"] || t.brand;
        ctx.textAlign = ann.align || "center";
        ctx.fillText(ann.text, pt.x + (ann.dx || 0), pt.y + (ann.dy === undefined ? -12 : ann.dy));
        ctx.restore();
      });
    },
  };
  Chart.register(boothAnnotations);

  /* ============================================================= */
  /* NAVIGATION                                                     */
  /* ============================================================= */

  const VIEW_INIT = {}; // view id -> init function, called once, lazily, on first visit
  const VIEW_READY = {};
  let currentViewId = "command";

  function goToView(viewId) {
    currentViewId = viewId;
    $all(".nav-item").forEach((btn) => {
      const on = btn.dataset.view === viewId;
      btn.classList.toggle("active", on);
      if (on) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
    });
    $all(".view").forEach((sec) => sec.classList.toggle("active", sec.id === "view-" + viewId));
    if (!VIEW_READY[viewId] && VIEW_INIT[viewId]) {
      VIEW_INIT[viewId]();
      VIEW_READY[viewId] = true;
    }
    document.getElementById("content").scrollTop = 0;
  }

  $all(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => { exitTour(); goToView(btn.dataset.view); });
  });

  /* ============================================================= */
  /* COMMAND PALETTE (⌘K / Ctrl+K) — global jump-to-anything search */
  /* ============================================================= */

  const CATEGORY_ORDER = ["Modules", "Candidates", "Genes", "Models", "Datasets", "Copilot"];
  const CATEGORY_ICON = { Modules: "MD", Candidates: "CX", Genes: "GN", Models: "ML", Datasets: "DS", Copilot: "AI" };

  let paletteIndex = null;
  let paletteResults = [];
  let paletteActiveIndex = 0;

  function scrollToMatch(selector) {
    setTimeout(() => {
      const el = document.querySelector(selector);
      if (el) el.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "center" });
    }, 0);
  }

  function buildPaletteIndex() {
    const items = [];
    const MODULES = [
      { view: "command", label: "Command Center", sub: "Portfolio dashboard" },
      { view: "candidates", label: "Candidate Explorer", sub: DATA.candidates.length + " tracked candidates" },
      { view: "omics", label: "Multi-Omics Explorer", sub: "Volcano plot & biomarkers" },
      { view: "pipeline", label: "Data & Quality Monitor", sub: "Pipeline health & dataset quality" },
      { view: "governance", label: "Model Governance", sub: "Validation status & drift" },
      { view: "copilot", label: "Research Copilot", sub: "Ask a question" },
    ];
    MODULES.forEach((m) => items.push({
      category: "Modules", keywords: m.label.toLowerCase(),
      label: m.label, sub: m.sub,
      action: () => goToView(m.view),
    }));
    items.push({
      category: "Modules", keywords: "take a tour guided walkthrough",
      label: "Take a Tour", sub: "Guided walkthrough of all 6 modules",
      action: () => startTour(),
    });

    DATA.candidates.forEach((c) => items.push({
      category: "Candidates", keywords: (c.id + " " + c.target + " " + c.modality).toLowerCase(),
      label: c.id, sub: `${c.target} · ${c.modality} · pKd ${c.pKd.toFixed(1)}`,
      action: () => {
        goToView("candidates");
        const fs = $("#f-search"); if (fs) { fs.value = c.id; applyCandidateFilters(); }
        openCandidateDetail(c.id);
      },
    }));

    const seenGenes = new Set();
    DATA.omics.forEach((o) => {
      if (seenGenes.has(o.gene)) return; // one entry per gene symbol, not per row
      seenGenes.add(o.gene);
      items.push({
        category: "Genes", keywords: (o.gene + " " + o.variantC + " " + o.cohort).toLowerCase(),
        label: o.gene, sub: `${o.variantC} · ${o.cohort}`,
        action: () => { goToView("omics"); openOmicsDetail(o); },
      });
    });

    DATA.models.forEach((m) => items.push({
      category: "Models", keywords: (m.name + " " + m.status).toLowerCase(),
      label: m.name, sub: `${m.version} · ${m.status}`,
      action: () => { goToView("governance"); scrollToMatch(`.model-card[data-model-name="${CSS.escape(m.name)}"]`); },
    }));

    DATA.datasets.forEach((d) => items.push({
      category: "Datasets", keywords: (d.name + " " + d.source).toLowerCase(),
      label: d.name, sub: `${d.source} · ${d.completeness}% complete`,
      action: () => { goToView("pipeline"); scrollToMatch(`tr[data-dataset-name="${CSS.escape(d.name)}"]`); },
    }));

    DATA.copilot.forEach((q, i) => items.push({
      category: "Copilot", keywords: q.q.toLowerCase(),
      label: q.q, sub: "Research Copilot question",
      action: () => { goToView("copilot"); setTimeout(() => askCopilot(i), 0); },
    }));

    return items;
  }
  function getPaletteIndex() {
    if (!paletteIndex) paletteIndex = buildPaletteIndex();
    return paletteIndex;
  }

  function paletteMatchScore(item, q) {
    const label = item.label.toLowerCase();
    if (label === q) return 0;
    if (label.startsWith(q)) return 1;
    if (item.keywords.startsWith(q)) return 2;
    if (item.keywords.includes(q)) return 3;
    return -1;
  }

  function searchPalette(query) {
    const q = query.trim().toLowerCase();
    const all = getPaletteIndex();
    if (!q) return all.filter((it) => it.category === "Modules");

    // Group by category, but rank categories by their best-matching item first —
    // an exact hit in one category (e.g. a gene symbol) should outrank loose
    // substring hits in another (e.g. candidates whose target happens to contain it).
    const byCategory = {};
    all.forEach((it) => {
      const s = paletteMatchScore(it, q);
      if (s < 0) return;
      (byCategory[it.category] = byCategory[it.category] || []).push({ it, s });
    });
    const categories = Object.keys(byCategory).map((cat) => {
      const list = byCategory[cat].sort((a, b) => a.s - b.s);
      return { cat, bestScore: list[0].s, items: list.slice(0, 6).map((x) => x.it) };
    });
    categories.sort((a, b) => a.bestScore - b.bestScore || CATEGORY_ORDER.indexOf(a.cat) - CATEGORY_ORDER.indexOf(b.cat));

    const out = [];
    categories.forEach((c) => out.push(...c.items));
    return out.slice(0, 30);
  }

  function renderPaletteResults() {
    const container = $("#cmdk-results");
    if (!paletteResults.length) {
      container.innerHTML = `<div class="cmdk-empty">No matches. Try a candidate ID, gene symbol, model, or dataset name.</div>`;
      return;
    }
    let lastCat = null;
    const rows = [];
    paletteResults.forEach((it, i) => {
      if (it.category !== lastCat) { rows.push(`<div class="cmdk-group-label">${it.category}</div>`); lastCat = it.category; }
      rows.push(`
        <div class="cmdk-item${i === paletteActiveIndex ? " active" : ""}" data-index="${i}">
          <span class="cmdk-item-icon cat-${it.category.toLowerCase()}">${CATEGORY_ICON[it.category]}</span>
          <span class="cmdk-item-text">
            <div class="cmdk-item-label">${escapeHtml(it.label)}</div>
            <div class="cmdk-item-sub">${escapeHtml(it.sub || "")}</div>
          </span>
        </div>`);
    });
    container.innerHTML = rows.join("");
    $all(".cmdk-item", container).forEach((el) => {
      el.addEventListener("mouseenter", () => { paletteActiveIndex = Number(el.dataset.index); updatePaletteHighlight(); });
      el.addEventListener("click", () => activatePaletteItem(Number(el.dataset.index)));
    });
  }

  function updatePaletteHighlight() {
    const container = $("#cmdk-results");
    $all(".cmdk-item", container).forEach((el) => el.classList.toggle("active", Number(el.dataset.index) === paletteActiveIndex));
    const activeEl = container.querySelector(`.cmdk-item[data-index="${paletteActiveIndex}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function activatePaletteItem(index) {
    const item = paletteResults[index];
    if (!item) return;
    closePalette();
    item.action();
  }

  function openPalette() {
    $("#palette-overlay").classList.add("visible");
    $("#cmdk").classList.add("open");
    $("#cmdk").setAttribute("aria-hidden", "false");
    const input = $("#cmdk-input");
    input.value = "";
    paletteResults = searchPalette("");
    paletteActiveIndex = 0;
    renderPaletteResults();
    setTimeout(() => input.focus(), 0);
  }
  function closePalette() {
    $("#palette-overlay").classList.remove("visible");
    $("#cmdk").classList.remove("open");
    $("#cmdk").setAttribute("aria-hidden", "true");
    $("#global-search").blur();
  }
  function isPaletteOpen() { return $("#cmdk").classList.contains("open"); }
  function togglePalette() { if (isPaletteOpen()) closePalette(); else openPalette(); }

  function initPalette() {
    $("#search-hint").textContent = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl+K";
    $("#global-search").addEventListener("focus", (e) => { e.target.blur(); openPalette(); });
    $("#palette-overlay").addEventListener("click", closePalette);
    $("#cmdk-input").addEventListener("input", (e) => {
      paletteResults = searchPalette(e.target.value);
      paletteActiveIndex = 0;
      renderPaletteResults();
    });
    $("#cmdk-input").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); paletteActiveIndex = Math.min(paletteActiveIndex + 1, paletteResults.length - 1); updatePaletteHighlight(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); paletteActiveIndex = Math.max(paletteActiveIndex - 1, 0); updatePaletteHighlight(); }
      else if (e.key === "Enter") { e.preventDefault(); activatePaletteItem(paletteActiveIndex); }
      else if (e.key === "Escape") { closePalette(); }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); togglePalette(); }
    });
  }

  /* ============================================================= */
  /* COMMAND CENTER                                                 */
  /* ============================================================= */

  function sparklineSvg(trend, color) {
    const w = 72, h = 26, pad = 3;
    const min = Math.min.apply(null, trend), max = Math.max.apply(null, trend);
    const range = max - min || 1;
    const pts = trend.map((v, i) => {
      const x = pad + (i / (trend.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    const last = pts[pts.length - 1].split(",");
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="${color}"/>
    </svg>`;
  }
  const KPI_COLORS = { sky: "#21b9ec", turquoise: "#08a8a4", yellow: "#f2c012", blue: "#3453ad" };

  function fmtKpiValue(k) {
    if (k.kind === "pct") return (Math.round(k.raw * 10) / 10) + "%";
    if (k.kind === "comma") return Math.round(k.raw).toLocaleString("en-US");
    return String(Math.round(k.raw));
  }
  function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function initCommandCenter() {
    const row = $("#kpi-row");
    row.innerHTML = DATA.kpis.map((k, i) => {
      const color = KPI_COLORS[k.color] || KPI_COLORS.blue;
      return `<div class="kpi-tile" data-kpi-index="${i}">
        <div class="kpi-label" data-tip="${escapeHtml(k.tip)}" tabindex="0">${escapeHtml(k.label)}</div>
        <div class="kpi-value" id="kpi-value-${i}">${escapeHtml(k.value)}</div>
        <div class="kpi-foot">
          <span class="kpi-delta">${escapeHtml(k.delta)}</span>
          <span class="kpi-spark" id="kpi-spark-${i}">${sparklineSvg(k.trend, color)}</span>
        </div>
      </div>`;
    }).join("");

    const t = DATA.throughput;
    const ctx = $("#chart-throughput").getContext("2d");
    const chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: t.days,
        datasets: [{
          label: "Samples processed",
          data: t.values,
          borderColor: "#3453ad",
          backgroundColor: "rgba(52,83,173,0.10)",
          pointRadius: t.values.map((_, i) => (i === t.peakIndex ? 5 : 0)),
          pointBackgroundColor: t.values.map((_, i) => (i === t.peakIndex ? "#21b9ec" : "#3453ad")),
          pointBorderColor: "#0d1420",
          fill: true,
          tension: 0.3,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.parsed.y + " samples" } } },
        scales: {
          x: { ticks: { color: themeColors().text, maxRotation: 0, autoSkip: true, font: { size: 10.5 } }, grid: { display: false } },
          y: { ticks: { color: themeColors().text }, grid: { color: themeColors().grid }, title: { display: true, text: "Samples / day", color: themeColors().text, font: { size: 11 } } },
        },
      },
    });
    chart.$annotations = [{ datasetIndex: 0, dataIndex: t.peakIndex, text: "Weekly batch release", role: "brand", dy: -14 }];
    chart.update();

    const feed = $("#activity-feed");
    feed.innerHTML = DATA.activity.map((a) => `
      <li class="activity-item">
        <span class="activity-icon ${a.type}">${ACTIVITY_ICON[a.type]}</span>
        <span class="activity-text">${escapeHtml(a.text)}<span class="activity-time">${escapeHtml(a.time)}</span></span>
      </li>`).join("");

    startLiveFeel();
  }
  VIEW_INIT.command = initCommandCenter;

  /* ---- "Live" feel: periodically nudge KPIs and drop in a new activity item ---- */

  function tickKpis() {
    const liveIdx = DATA.kpis.map((k, i) => (k.live ? i : -1)).filter((i) => i >= 0);
    const i = randomChoice(liveIdx);
    const k = DATA.kpis[i];
    const step = k.kind === "comma" ? randomChoice([-4, -2, 2, 3, 5, 8]) : k.kind === "pct" ? (Math.random() - 0.5) * 0.6 : randomChoice([-1, 0, 1]);
    k.raw = Math.max(0, k.raw + step);
    k.trend = k.trend.slice(1).concat([Number(k.raw.toFixed(2))]);
    k.value = fmtKpiValue(k);

    const valueEl = $("#kpi-value-" + i);
    const sparkEl = $("#kpi-spark-" + i);
    if (!valueEl || !sparkEl) return; // Command Center not currently mounted; DATA is still updated for next visit.
    valueEl.textContent = k.value;
    sparkEl.innerHTML = sparklineSvg(k.trend, KPI_COLORS[k.color] || KPI_COLORS.blue);
    if (!REDUCED_MOTION) {
      valueEl.classList.remove("is-live");
      void valueEl.offsetWidth; // restart the flash animation
      valueEl.classList.add("is-live");
    }
  }

  const LIVE_EVENT_TEMPLATES = [
    () => { const c = randomChoice(DATA.candidates); return { type: "success", text: `Candidate ${c.id} (${c.target}) cleared automated QC — pKd ${c.pKd.toFixed(1)}.` }; },
    () => { const c = randomChoice(DATA.candidates); return { type: "info", text: `Candidate ${c.id} moved to ${c.stage} after internal review.` }; },
    () => { const m = randomChoice(DATA.models); return { type: "info", text: `${m.name} ${m.version} completed a scheduled inference run.` }; },
    () => { const d = randomChoice(DATA.datasets); return { type: "info", text: `${d.name} sync completed — ${d.rows} rows refreshed.` }; },
    () => { const o = randomChoice(DATA.omics); return { type: "success", text: `New variant reviewed: ${o.gene} ${o.variantC} in ${o.cohort}.` }; },
    () => { const s = randomChoice(DATA.sources); return { type: "warning", text: `${s.name} sync running slower than usual — monitoring.` }; },
    () => { const c = randomChoice(DATA.candidates); return { type: "warning", text: `Candidate ${c.id} flagged for a follow-up QC re-test.` }; },
  ];
  const ACTIVITY_FEED_CAP = 60;

  function showToast(entry) {
    const stack = $("#toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="activity-icon ${entry.type}">${ACTIVITY_ICON[entry.type]}</span><span class="activity-text">${escapeHtml(entry.text)}</span>`;
    const dismiss = () => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), REDUCED_MOTION ? 0 : 220);
    };
    el.addEventListener("click", dismiss);
    stack.appendChild(el);
    setTimeout(dismiss, 5000);
  }

  function tickActivity() {
    const event = randomChoice(LIVE_EVENT_TEMPLATES)();
    const entry = { type: event.type, time: "Just now", text: event.text };
    DATA.activity.unshift(entry);
    if (DATA.activity.length > ACTIVITY_FEED_CAP) DATA.activity.length = ACTIVITY_FEED_CAP;

    // Show a toast whenever the visitor isn't already looking at the feed, so the "live" feel
    // is visible from any module, not just Command Center.
    if (currentViewId !== "command" && toastsEnabled) showToast(entry);

    const feed = $("#activity-feed");
    if (!feed) return; // Command Center not currently mounted; DATA is still updated for next visit.
    const li = document.createElement("li");
    li.className = "activity-item" + (REDUCED_MOTION ? "" : " is-new");
    li.innerHTML = `<span class="activity-icon ${entry.type}">${ACTIVITY_ICON[entry.type]}</span>
      <span class="activity-text">${escapeHtml(entry.text)}<span class="activity-time">${escapeHtml(entry.time)}</span></span>`;
    feed.insertBefore(li, feed.firstChild);
    while (feed.children.length > ACTIVITY_FEED_CAP) feed.removeChild(feed.lastChild);
  }

  function startLiveFeel() {
    if (REDUCED_MOTION) return; // respect prefers-reduced-motion: freeze the feed at its initial state
    setInterval(tickKpis, 5000);
    setInterval(tickActivity, 8000);
  }

  /* ============================================================= */
  /* CANDIDATE EXPLORER                                             */
  /* ============================================================= */

  let candidateChart = null;
  const compareSelection = new Set();
  const COMPARE_MAX = 4;
  const CANDIDATE_TOP_N = 10;

  function riskColor(risk) { return risk === "Low" ? "#08a8a4" : risk === "Medium" ? "#f2c012" : "#d33a26"; }
  function riskBadgeClass(risk) { return risk === "Low" ? "badge-low" : risk === "Medium" ? "badge-medium" : "badge-high"; }
  function qcClass(n) { return n === 0 ? "zero" : n <= 2 ? "some" : "many"; }

  function populateSelect(sel, values) {
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
  }

  function getCandidateFilters() {
    return {
      target: $("#f-target").value,
      stage: $("#f-stage").value,
      risk: $("#f-risk").value,
      search: $("#f-search").value.trim().toLowerCase(),
    };
  }

  function filteredCandidates() {
    const f = getCandidateFilters();
    return DATA.candidates.filter((c) => {
      if (f.target && c.target !== f.target) return false;
      if (f.stage && c.stage !== f.stage) return false;
      if (f.risk && c.risk !== f.risk) return false;
      if (f.search && !(c.id.toLowerCase().includes(f.search) || c.target.toLowerCase().includes(f.search))) return false;
      return true;
    });
  }

  function renderCandidateTable(list) {
    const tbody = $("#candidate-table tbody");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:26px;">No candidates match the current filters.</td></tr>`;
      return;
    }
    const sorted = [...list].sort((a, b) => b.pKd - a.pKd).slice(0, CANDIDATE_TOP_N);
    tbody.innerHTML = sorted.map((c) => `
      <tr tabindex="0" data-id="${c.id}">
        <td class="td-compare"><input type="checkbox" class="compare-checkbox" data-compare-id="${c.id}" aria-label="Select ${c.id} to compare" ${compareSelection.has(c.id) ? "checked" : ""}></td>
        <td class="mono">${c.id}</td>
        <td>${escapeHtml(c.target)}</td>
        <td>${escapeHtml(c.modality)}</td>
        <td>${escapeHtml(c.stage)}</td>
        <td class="mono">${c.pKd.toFixed(1)}</td>
        <td><span class="badge ${riskBadgeClass(c.risk)}">${c.risk}</span></td>
        <td class="qc-flag ${qcClass(c.openQC)}">${c.openQC === 0 ? "None" : c.openQC + " open"}</td>
      </tr>`).join("");
    $all("tr[data-id]", tbody).forEach((row) => {
      row.addEventListener("click", () => openCandidateDetail(row.dataset.id));
      row.addEventListener("keydown", (e) => { if (e.key === "Enter") openCandidateDetail(row.dataset.id); });
    });
    $all(".compare-checkbox", tbody).forEach((box) => {
      box.addEventListener("click", (e) => e.stopPropagation());
      box.addEventListener("change", () => toggleCompareSelection(box.dataset.compareId, box));
    });
  }

  function renderCandidateChart(list) {
    const sorted = [...list].sort((a, b) => b.pKd - a.pKd).slice(0, CANDIDATE_TOP_N);
    const ctx = $("#chart-candidates").getContext("2d");
    if (candidateChart) { candidateChart.destroy(); candidateChart = null; }
    if (!sorted.length) return;
    const topIndex = 0;
    candidateChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sorted.map((c) => c.id),
        datasets: [{
          label: "Binding affinity (pKd)",
          data: sorted.map((c) => c.pKd),
          backgroundColor: sorted.map((c) => riskColor(c.risk)),
          borderColor: sorted.map((c, i) => (i === topIndex ? "#21b9ec" : "transparent")),
          borderWidth: sorted.map((c, i) => (i === topIndex ? 3 : 0)),
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => "pKd " + c.parsed.x.toFixed(1) + " · " + sorted[c.dataIndex].target + " · " + sorted[c.dataIndex].risk + " risk" } },
        },
        scales: {
          x: { min: 5, max: 10.5, title: { display: true, text: "pKd (higher = stronger binding)", color: themeColors().text, font: { size: 11 } }, ticks: { color: themeColors().text }, grid: { color: themeColors().grid } },
          y: { ticks: { color: themeColors().strong, font: { family: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", size: 11 } }, grid: { display: false } },
        },
        onClick(evt, elements) {
          if (elements && elements.length) openCandidateDetail(sorted[elements[0].index].id);
        },
      },
    });
    candidateChart.$annotations = [{ datasetIndex: 0, dataIndex: topIndex, text: "Top pick", role: "info", align: "left", dx: 8, dy: 4 }];
    candidateChart.update();
  }

  function applyCandidateFilters() {
    const list = filteredCandidates();
    const shown = Math.min(CANDIDATE_TOP_N, list.length);
    $("#candidate-count").textContent = "Top " + shown + " of " + list.length + " matching (" + DATA.candidates.length + " total)";
    renderCandidateTable(list);
    renderCandidateChart(list);
  }

  /* ---- Stylized rotating 3D-ish molecule viewer (hand-rolled: rotate -> project -> draw) ---- */

  const MOL_ATOM_STYLE = {
    C: { color: "#8a94a6", r: 7 },
    N: { color: "#3453ad", r: 6.5 },
    O: { color: "#d33a26", r: 6 },
    S: { color: "#f2c012", r: 7 },
    backboneA: { color: "#21b9ec", r: 5.5 },
    backboneB: { color: "#08a8a4", r: 5.5 },
  };

  function buildHelixModel() {
    const atoms = [];
    const bonds = [];
    const turns = 2.4, n = 9, radius = 24, heightSpan = 84;
    for (let strand = 0; strand < 2; strand++) {
      const phase = strand * Math.PI;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const angle = t * turns * Math.PI * 2 + phase;
        atoms.push({
          x: radius * Math.cos(angle),
          y: -heightSpan / 2 + t * heightSpan,
          z: radius * Math.sin(angle),
          type: strand === 0 ? "backboneA" : "backboneB",
        });
        if (i > 0) bonds.push([strand * n + i - 1, strand * n + i]);
      }
    }
    for (let i = 1; i < n - 1; i += 2) bonds.push([i, n + i]);
    return { atoms, bonds };
  }

  const MOL_MODELS = {
    ballstick: {
      atoms: [
        { x: 32, y: 0, z: 0, type: "C" },
        { x: 16, y: 0, z: 27.7, type: "C" },
        { x: -16, y: 0, z: 27.7, type: "C" },
        { x: -32, y: 0, z: 0, type: "C" },
        { x: -16, y: 0, z: -27.7, type: "C" },
        { x: 16, y: 0, z: -27.7, type: "C" },
        { x: 51, y: -18, z: 0, type: "N" },
        { x: -25.6, y: 20, z: 44.3, type: "O" },
        { x: -25.6, y: -14, z: -44.3, type: "S" },
      ],
      bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [2, 7], [4, 8]],
    },
    antibody: {
      atoms: [
        { x: 0, y: 8, z: 0, type: "C" },
        { x: -14, y: -10, z: 6, type: "N" },
        { x: -28, y: -28, z: 10, type: "C" },
        { x: -40, y: -46, z: 14, type: "O" },
        { x: 14, y: -10, z: -6, type: "N" },
        { x: 28, y: -28, z: -10, type: "C" },
        { x: 40, y: -46, z: -14, type: "O" },
        { x: 0, y: 26, z: 0, type: "C" },
        { x: 0, y: 44, z: 4, type: "S" },
      ],
      bonds: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [0, 7], [7, 8]],
    },
    helix: buildHelixModel(),
  };

  function modalityToVariant(modality) {
    if (modality === "siRNA") return "helix";
    if (modality === "mAb" || modality === "ADC" || modality === "Bispecific") return "antibody";
    return "ballstick";
  }

  let molFrameHandle = null;
  function stopMolecule() {
    if (molFrameHandle !== null) { cancelAnimationFrame(molFrameHandle); molFrameHandle = null; }
  }

  function renderMolecule(hostEl, variantKey) {
    stopMolecule();
    if (!hostEl) return;
    const model = MOL_MODELS[variantKey] || MOL_MODELS.ballstick;
    const size = 220, cx = size / 2, cy = size / 2, focal = 260;
    hostEl.innerHTML = `<svg class="mol-svg" viewBox="0 0 ${size} ${size}"></svg>`;
    const svg = hostEl.querySelector(".mol-svg");
    const bondLines = model.bonds.map(() => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      svg.appendChild(line);
      return line;
    });
    const atomEls = model.atoms.map((a) => {
      const el = document.createElement("div");
      el.className = "mol-atom";
      el.style.background = (MOL_ATOM_STYLE[a.type] || MOL_ATOM_STYLE.C).color;
      hostEl.appendChild(el);
      return el;
    });

    const tiltX = -0.32; // fixed camera tilt (~-18deg) so the turntable rotation reads as 3D
    const cosT = Math.cos(tiltX), sinT = Math.sin(tiltX);

    function project(p, theta) {
      const cosY = Math.cos(theta), sinY = Math.sin(theta);
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;
      const y2 = p.y * cosT - z1 * sinT;
      const z2 = p.y * sinT + z1 * cosT;
      const scale = focal / (focal + z2);
      return { sx: cx + x1 * scale, sy: cy + y2 * scale, z: z2, scale };
    }

    let theta = 0.6; // pleasant starting angle
    function draw() {
      const projected = model.atoms.map((a) => project(a, theta));
      model.bonds.forEach(([i, j], idx) => {
        const a = projected[i], b = projected[j];
        const line = bondLines[idx];
        line.setAttribute("x1", a.sx.toFixed(1));
        line.setAttribute("y1", a.sy.toFixed(1));
        line.setAttribute("x2", b.sx.toFixed(1));
        line.setAttribute("y2", b.sy.toFixed(1));
        line.setAttribute("stroke-width", (2.2 * ((a.scale + b.scale) / 2)).toFixed(2));
      });
      projected.forEach((pr, i) => {
        const style = MOL_ATOM_STYLE[model.atoms[i].type] || MOL_ATOM_STYLE.C;
        const d = style.r * 2 * pr.scale;
        const el = atomEls[i];
        el.style.width = d.toFixed(1) + "px";
        el.style.height = d.toFixed(1) + "px";
        el.style.left = (pr.sx - d / 2).toFixed(1) + "px";
        el.style.top = (pr.sy - d / 2).toFixed(1) + "px";
        el.style.zIndex = String(Math.round(pr.z * 10) + 1000);
        el.style.opacity = String((0.55 + 0.45 * ((pr.z + 60) / 120)).toFixed(2));
      });
    }

    draw();
    if (REDUCED_MOTION) return; // static single frame, no continuous animation

    let last = null;
    const SPEED = (Math.PI * 2) / 16000; // one full turn every 16s
    function frame(ts) {
      if (last === null) last = ts;
      theta += (ts - last) * SPEED;
      last = ts;
      draw();
      molFrameHandle = requestAnimationFrame(frame);
    }
    molFrameHandle = requestAnimationFrame(frame);
  }

  function openCandidateDetail(id) {
    const c = DATA.candidates.find((x) => x.id === id);
    if (!c) return;
    const ic50 = (Math.pow(10, -c.pKd) * 1e9).toFixed(1);
    $("#candidate-detail-body").innerHTML = `
      <div class="detail-title">${c.id}</div>
      <div class="detail-subtitle">${escapeHtml(c.target)} · ${escapeHtml(c.modality)} · ${escapeHtml(c.stage)}</div>
      <div class="detail-section">
        <h3>Structure Preview <span class="mol-badge">Stylized</span></h3>
        <div class="mol-viewer" id="mol-viewer"></div>
      </div>
      <div class="detail-section">
        <h3>Key Metrics</h3>
        <div class="detail-metric-grid">
          <div class="detail-metric"><div class="detail-metric-label">Binding Affinity</div><div class="detail-metric-value">pKd ${c.pKd.toFixed(1)}</div></div>
          <div class="detail-metric"><div class="detail-metric-label">Est. IC50</div><div class="detail-metric-value">${ic50} nM</div></div>
          <div class="detail-metric"><div class="detail-metric-label">Novelty Score</div><div class="detail-metric-value">${c.novelty}/100</div></div>
          <div class="detail-metric"><div class="detail-metric-label">Percentile Rank</div><div class="detail-metric-value">Top ${100 - c.rankPercentile < 1 ? "1" : (100 - c.rankPercentile)}%</div></div>
        </div>
      </div>
      <div class="detail-section">
        <h3>Risk &amp; QC</h3>
        <div class="detail-metric-grid">
          <div class="detail-metric"><div class="detail-metric-label">Risk Flag</div><div class="detail-metric-value"><span class="badge ${riskBadgeClass(c.risk)}">${c.risk}</span></div></div>
          <div class="detail-metric"><div class="detail-metric-label">Open QC Items</div><div class="detail-metric-value qc-flag ${qcClass(c.openQC)}">${c.openQC}</div></div>
        </div>
      </div>
      <div class="detail-section">
        <h3>Structure Summary</h3>
        <div class="detail-summary">${escapeHtml(c.summary)}</div>
      </div>
      <div class="detail-section">
        <h3>Related Samples</h3>
        <div class="detail-samples">${c.samples.map((s) => `<span class="sample-pill">${s}</span>`).join("")}</div>
      </div>`;
    renderMolecule($("#mol-viewer"), modalityToVariant(c.modality));
    $("#candidate-detail").classList.add("open");
    $("#candidate-detail").setAttribute("aria-hidden", "false");
    $("#detail-overlay").classList.add("visible");
  }
  function closeCandidateDetail() {
    stopMolecule();
    $("#candidate-detail").classList.remove("open");
    $("#candidate-detail").setAttribute("aria-hidden", "true");
    $("#detail-overlay").classList.remove("visible");
  }
  $("#candidate-detail-close").addEventListener("click", closeCandidateDetail);
  $("#detail-overlay").addEventListener("click", closeCandidateDetail);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeCandidateDetail();
    closeCompareModal();
    closePalette();
    closeShortcuts();
    closeAccountModal();
    exitTour();
  });

  /* ---- Side-by-side candidate comparison ---- */

  function toggleCompareSelection(id, checkboxEl) {
    if (checkboxEl.checked) {
      if (compareSelection.size >= COMPARE_MAX) { checkboxEl.checked = false; return; }
      compareSelection.add(id);
    } else {
      compareSelection.delete(id);
    }
    renderCompareBar();
    if ($("#compare-modal").classList.contains("open")) renderCompareTable();
  }

  function renderCompareBar() {
    const bar = $("#compare-bar");
    const ids = [...compareSelection];
    bar.hidden = ids.length === 0;
    $("#compare-bar-chips").innerHTML = ids.map((id) => `
      <span class="compare-chip">${id}<button type="button" data-remove-id="${id}" aria-label="Remove ${id} from comparison">×</button></span>
    `).join("");
    $("#compare-count").textContent = String(ids.length);
    $("#compare-open-btn").disabled = ids.length < 2;
    $all("[data-remove-id]", bar).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.removeId;
        compareSelection.delete(id);
        const box = $(`.compare-checkbox[data-compare-id="${id}"]`);
        if (box) box.checked = false;
        renderCompareBar();
        if ($("#compare-modal").classList.contains("open")) renderCompareTable();
      });
    });
  }

  const COMPARE_ROWS = [
    { label: "Target", tip: "The gene or protein this candidate acts on.", get: (c) => escapeHtml(c.target) },
    { label: "Modality", tip: "The type of drug this candidate is.", get: (c) => escapeHtml(c.modality) },
    { label: "Stage", tip: "Current stage in the development pipeline.", get: (c) => escapeHtml(c.stage) },
    { label: "Binding Affinity (pKd)", tip: "How tightly the drug binds its target. Higher is stronger.", get: (c) => c.pKd.toFixed(1), cls: "mono" },
    { label: "Est. IC50 (nM)", tip: "Estimated concentration needed to block the target by half — lower is more potent.", get: (c) => (Math.pow(10, -c.pKd) * 1e9).toFixed(1), cls: "mono" },
    { label: "Novelty Score", tip: "How unique this candidate's chemistry is compared to existing drugs.", get: (c) => c.novelty + "/100", cls: "mono" },
    { label: "Percentile Rank", tip: "How this candidate ranks against all others by binding affinity.", get: (c) => "Top " + (100 - c.rankPercentile < 1 ? "1" : (100 - c.rankPercentile)) + "%", cls: "mono" },
    { label: "Risk", tip: "Assessed risk level for this candidate.", get: (c) => `<span class="badge ${riskBadgeClass(c.risk)}">${c.risk}</span>` },
    { label: "Open QC Items", tip: "Quality-control flags still open for this candidate.", get: (c) => `<span class="qc-flag ${qcClass(c.openQC)}">${c.openQC}</span>` },
    { label: "Structure Summary", tip: "A short description of this candidate's chemical structure.", get: (c) => escapeHtml(c.summary), cls: "summary-cell" },
  ];

  function renderCompareTable() {
    const cands = [...compareSelection].map((id) => DATA.candidates.find((c) => c.id === id)).filter(Boolean);
    const table = $("#compare-table");
    if (!cands.length) { table.innerHTML = ""; return; }
    table.innerHTML = `
      <thead><tr><th></th>${cands.map((c) => `<th>${c.id}</th>`).join("")}</tr></thead>
      <tbody>
        ${COMPARE_ROWS.map((row) => `
          <tr>
            <td class="row-label" data-tip="${escapeHtml(row.tip)}" tabindex="0">${row.label}</td>
            ${cands.map((c) => `<td class="${row.cls || ""}">${row.get(c)}</td>`).join("")}
          </tr>`).join("")}
      </tbody>`;
  }

  function openCompareModal() {
    if (compareSelection.size < 2) return;
    renderCompareTable();
    $("#compare-modal").classList.add("open");
    $("#compare-modal").setAttribute("aria-hidden", "false");
    $("#compare-overlay").classList.add("visible");
  }
  function closeCompareModal() {
    $("#compare-modal").classList.remove("open");
    $("#compare-modal").setAttribute("aria-hidden", "true");
    $("#compare-overlay").classList.remove("visible");
  }
  $("#compare-open-btn").addEventListener("click", openCompareModal);
  $("#compare-modal-close").addEventListener("click", closeCompareModal);
  $("#compare-overlay").addEventListener("click", closeCompareModal);
  $("#compare-clear-btn").addEventListener("click", () => {
    compareSelection.clear();
    $all(".compare-checkbox").forEach((box) => { box.checked = false; });
    renderCompareBar();
    closeCompareModal();
  });

  function initCandidateExplorer() {
    populateSelect($("#f-target"), [...new Set(DATA.candidates.map((c) => c.target))].sort());
    populateSelect($("#f-stage"), STAGES_ORDER.filter((s) => DATA.candidates.some((c) => c.stage === s)));
    populateSelect($("#f-risk"), ["Low", "Medium", "High"]);
    ["f-target", "f-stage", "f-risk"].forEach((id) => $("#" + id).addEventListener("change", applyCandidateFilters));
    $("#f-search").addEventListener("input", applyCandidateFilters);
    $("#f-reset").addEventListener("click", () => {
      $("#f-target").value = ""; $("#f-stage").value = ""; $("#f-risk").value = ""; $("#f-search").value = "";
      applyCandidateFilters();
    });
    applyCandidateFilters();
  }
  const STAGES_ORDER = ["Discovery", "Lead Optimization", "Preclinical", "IND-Enabling", "Phase I", "Phase II"];
  VIEW_INIT.candidates = initCandidateExplorer;

  /* ============================================================= */
  /* MULTI-OMICS EXPLORER                                           */
  /* ============================================================= */

  let volcanoChart = null;
  const activeMutationChips = new Set();

  function getOmicsFilters() {
    return { cohort: $("#o-cohort").value, tissue: $("#o-tissue").value };
  }
  function filteredOmics() {
    const f = getOmicsFilters();
    return DATA.omics.filter((o) => {
      if (f.cohort && o.cohort !== f.cohort) return false;
      if (f.tissue && o.tissue !== f.tissue) return false;
      if (activeMutationChips.size && !activeMutationChips.has(o.mutation)) return false;
      return true;
    });
  }

  function pointColor(o) {
    const sig = o.negLogP >= 1.3 && Math.abs(o.log2fc) >= 1.5;
    const moderate = o.negLogP >= 1.3 && Math.abs(o.log2fc) >= 0.75;
    return sig ? "#d33a26" : moderate ? "#21b9ec" : "#9aa5b4";
  }

  function renderVolcano(list) {
    const ctx = $("#chart-volcano").getContext("2d");
    if (volcanoChart) { volcanoChart.destroy(); volcanoChart = null; }
    $("#omics-count").textContent = list.length + " of " + DATA.omics.length + " results";
    if (!list.length) return;
    const anchorIdx = list.findIndex((o) => o.anchor);
    volcanoChart = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [{
          label: "Gene comparisons",
          data: list.map((o) => ({ x: o.log2fc, y: o.negLogP })),
          backgroundColor: list.map(pointColor),
          borderColor: list.map((o) => (o.anchor ? "#0d1420" : "transparent")),
          borderWidth: list.map((o) => (o.anchor ? 2 : 0)),
          pointRadius: list.map((o) => (o.anchor ? 8 : 4)),
          pointHoverRadius: list.map((o) => (o.anchor ? 9 : 6)),
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => { const o = list[c.dataIndex]; return `${o.gene} (${o.sampleId}) · log2FC ${o.log2fc.toFixed(2)}, -log10p ${o.negLogP.toFixed(2)}`; } } },
        },
        scales: {
          x: { title: { display: true, text: "log2 Fold-Change", color: themeColors().text, font: { size: 11 } }, ticks: { color: themeColors().text }, grid: { color: themeColors().grid } },
          y: { title: { display: true, text: "-log10(p-value)", color: themeColors().text, font: { size: 11 } }, ticks: { color: themeColors().text }, grid: { color: themeColors().grid }, min: 0 },
        },
        onClick(evt, elements) {
          if (elements && elements.length) openOmicsDetail(list[elements[0].index]);
        },
      },
    });
    if (anchorIdx >= 0) {
      volcanoChart.$annotations = [{ datasetIndex: 0, dataIndex: anchorIdx, text: "BRCA1 c.68_69delAG", role: "brand", dy: -16 }];
      volcanoChart.update();
    }
  }

  function openOmicsDetail(o) {
    $("#omics-detail-empty").hidden = true;
    const body = $("#omics-detail-body");
    body.hidden = false;
    body.innerHTML = `
      <div class="detail-title">${escapeHtml(o.gene)}</div>
      <div class="detail-subtitle">${escapeHtml(o.variantC)} (${escapeHtml(o.variantP)})</div>
      <div class="detail-metric-grid">
        <div class="detail-metric"><div class="detail-metric-label">Sample ID</div><div class="detail-metric-value" style="font-size:13px;">${o.sampleId}</div></div>
        <div class="detail-metric"><div class="detail-metric-label">Cohort samples (n)</div><div class="detail-metric-value">${o.sampleN}</div></div>
        <div class="detail-metric"><div class="detail-metric-label">log2 Fold-Change</div><div class="detail-metric-value">${o.log2fc.toFixed(2)}</div></div>
        <div class="detail-metric"><div class="detail-metric-label">-log10(p)</div><div class="detail-metric-value">${o.negLogP.toFixed(2)}</div></div>
      </div>
      <div class="detail-section" style="margin-top:14px;">
        <h3>Context</h3>
        <div class="detail-summary">Cohort: ${escapeHtml(o.cohort)}<br>Tissue: ${escapeHtml(o.tissue)}<br>Mutation status: ${escapeHtml(o.mutation)}</div>
      </div>`;
  }

  function applyOmicsFilters() { renderVolcano(filteredOmics()); }

  function initOmicsExplorer() {
    populateSelect($("#o-cohort"), COHORTS_LIST);
    populateSelect($("#o-tissue"), TISSUES_LIST);
    $("#o-cohort").addEventListener("change", applyOmicsFilters);
    $("#o-tissue").addEventListener("change", applyOmicsFilters);
    const chipGroup = $("#o-mutation-chips");
    chipGroup.innerHTML = MUT_LIST.map((m) => `<button class="chip-toggle" data-value="${m}" type="button">${m}</button>`).join("");
    $all(".chip-toggle", chipGroup).forEach((chip) => {
      chip.addEventListener("click", () => {
        const v = chip.dataset.value;
        if (activeMutationChips.has(v)) { activeMutationChips.delete(v); chip.classList.remove("active"); }
        else { activeMutationChips.add(v); chip.classList.add("active"); }
        applyOmicsFilters();
      });
    });
    $("#o-reset").addEventListener("click", () => {
      $("#o-cohort").value = ""; $("#o-tissue").value = "";
      activeMutationChips.clear();
      $all(".chip-toggle", chipGroup).forEach((c) => c.classList.remove("active"));
      applyOmicsFilters();
    });
    applyOmicsFilters();
  }
  const COHORTS_LIST = ["Breast-Ovarian Cohort A", "NSCLC Cohort B", "Colorectal Cohort C", "Pancreatic Cohort D"];
  const TISSUES_LIST = ["Tumor", "Adjacent Normal", "Metastasis", "Liquid Biopsy"];
  const MUT_LIST = ["Mutant", "Wild-type", "VUS"];
  VIEW_INIT.omics = initOmicsExplorer;

  /* ============================================================= */
  /* DATA PIPELINE & QUALITY MONITOR                                */
  /* ============================================================= */

  const SOURCE_ICONS = {
    dna: `<path d="M4 3c0 4.5 9 4.5 9 9M4 17c0-4.5 9-4.5 9-9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
    flask: `<path d="M7 2h6M8 2v5.5L4 15a1.5 1.5 0 0 0 1.3 2.2h9.4A1.5 1.5 0 0 0 16 15l-4-7.5V2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
    clip: `<rect x="4" y="3" width="12" height="15" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="7" y="1.5" width="6" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    grid: `<rect x="3" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="11" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="11" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    image: `<rect x="2.5" y="3.5" width="15" height="13" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="8" r="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 15l4-4 3 3 3.5-4.5 4 5.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`,
  };
  function sourceBadgeClass(status) { return status === "Synced" ? "badge-synced" : status === "Syncing" ? "badge-syncing" : "badge-delayed"; }

  function initSourceGrid() {
    $("#source-grid").innerHTML = DATA.sources.map((s) => `
      <div class="source-card">
        <div class="source-card-head">
          <span class="source-icon"><svg viewBox="0 0 20 20" width="18" height="18">${SOURCE_ICONS[s.icon] || ""}</svg></span>
          <span class="source-name">${escapeHtml(s.name)}</span>
        </div>
        <div class="source-row"><span>Status</span><span class="val"><span class="badge ${sourceBadgeClass(s.status)}">${s.status}</span></span></div>
        <div class="source-row"><span>Last sync</span><span class="val">${escapeHtml(s.lastSync)}</span></div>
        <div class="source-row"><span>Volume</span><span class="val">${escapeHtml(s.rows)}</span></div>
      </div>`).join("");
  }

  function scoreClass(v) { return v >= 90 ? "ind-good" : v >= 75 ? "ind-warn" : "ind-bad"; }
  function freshClass(h) { return h <= 2 ? "ind-good" : h <= 12 ? "ind-warn" : "ind-bad"; }
  function indicatorHTML(displayVal, pct, cls) {
    return `<span class="indicator ${cls}"><span class="bar"><span style="width:${Math.min(100, pct)}%"></span></span>${displayVal}</span>`;
  }

  let datasetSort = { key: "completeness", dir: "desc" };
  function renderDatasetTable() {
    const rows = [...DATA.datasets];
    rows.sort((a, b) => {
      let av = a[datasetSort.key], bv = b[datasetSort.key];
      if (datasetSort.key === "rows") { av = parseInt(String(a.rows).replace(/,/g, ""), 10); bv = parseInt(String(b.rows).replace(/,/g, ""), 10); }
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); return datasetSort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); }
      return datasetSort.dir === "asc" ? av - bv : bv - av;
    });
    $("#dataset-table tbody").innerHTML = rows.map((d) => `
      <tr data-dataset-name="${escapeHtml(d.name)}">
        <td>${escapeHtml(d.name)}</td>
        <td>${escapeHtml(d.source)}</td>
        <td>${indicatorHTML(d.completeness + "%", d.completeness, scoreClass(d.completeness))}</td>
        <td>${indicatorHTML(d.freshness < 1 ? (d.freshness * 60).toFixed(0) + "m" : d.freshness.toFixed(1) + "h", 100 - Math.min(100, d.freshness * 4), freshClass(d.freshness))}</td>
        <td>${indicatorHTML(d.schema + "%", d.schema, scoreClass(d.schema))}</td>
        <td class="mono">${escapeHtml(d.rows)}</td>
      </tr>`).join("");
    $all("#dataset-table th[data-key]").forEach((th) => {
      th.querySelector(".sort-arrow") && th.querySelector(".sort-arrow").remove();
      if (th.dataset.key === datasetSort.key) {
        const arrow = document.createElement("span");
        arrow.className = "sort-arrow";
        arrow.textContent = datasetSort.dir === "asc" ? "▲" : "▼";
        th.appendChild(arrow);
      }
    });
  }

  function initPipelineMonitor() {
    initSourceGrid();
    $all("#dataset-table th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (datasetSort.key === key) datasetSort.dir = datasetSort.dir === "asc" ? "desc" : "asc";
        else { datasetSort.key = key; datasetSort.dir = "desc"; }
        renderDatasetTable();
      });
    });
    renderDatasetTable();
  }
  VIEW_INIT.pipeline = initPipelineMonitor;

  /* ============================================================= */
  /* MODEL & PIPELINE GOVERNANCE                                    */
  /* ============================================================= */

  function modelBadgeClass(status) { return status === "Validated" ? "badge-validated" : status === "In Review" ? "badge-review" : "badge-drifting"; }
  function modelLineColor(status) { return status === "Validated" ? "#08a8a4" : status === "In Review" ? "#f2c012" : "#d33a26"; }

  function initGovernance() {
    const grid = $("#model-grid");
    grid.innerHTML = DATA.models.map((m, i) => `
      <div class="model-card" data-model-name="${escapeHtml(m.name)}">
        <div class="model-card-head">
          <div>
            <div class="model-name">${escapeHtml(m.name)}</div>
            <div class="model-version">${escapeHtml(m.version)}</div>
          </div>
          <span class="badge ${modelBadgeClass(m.status)}">${m.status}</span>
        </div>
        <div class="model-metric-name">${escapeHtml(m.metricName)} — last 30 checkpoints</div>
        <div class="model-chart-wrap"><canvas id="model-chart-${i}"></canvas></div>
        <ul class="audit-list">
          ${m.audit.map((a) => `<li class="audit-item"><div class="audit-meta">${a.version} · ${a.date} · ${escapeHtml(a.author)}</div><div class="audit-note">${escapeHtml(a.note)}</div></li>`).join("")}
        </ul>
      </div>`).join("");

    DATA.models.forEach((m, i) => {
      const ctx = document.getElementById("model-chart-" + i).getContext("2d");
      const color = modelLineColor(m.status);
      const flagIndex = m.status === "Drifting" ? m.series.length - 6 : -1;
      const chart = new Chart(ctx, {
        type: "line",
        data: {
          labels: m.series.map((_, idx) => idx + 1),
          datasets: [{
            data: m.series, borderColor: color, backgroundColor: color + "22",
            pointRadius: m.series.map((_, idx) => (idx === flagIndex ? 4 : 0)),
            pointBackgroundColor: "#d33a26",
            fill: true, tension: 0.25, borderWidth: 1.8,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => m.metricName + ": " + c.parsed.y } },
          },
          scales: {
            x: { display: false },
            y: { ticks: { color: themeColors().text, font: { size: 9.5 } }, grid: { color: themeColors().grid } },
          },
        },
      });
      if (flagIndex >= 0) {
        chart.$annotations = [{ datasetIndex: 0, dataIndex: flagIndex, text: "Drift threshold crossed", role: "critical", dy: -10 }];
        chart.update();
      }
    });
  }
  VIEW_INIT.governance = initGovernance;

  /* ============================================================= */
  /* RESEARCH COPILOT                                               */
  /* ============================================================= */

  function buildCiteTokens() {
    const tokens = new Set();
    DATA.candidates.forEach((c) => tokens.add(c.id));
    DATA.models.forEach((m) => tokens.add(m.name));
    DATA.datasets.forEach((d) => tokens.add(d.name));
    tokens.add("BRCA1 c.68_69delAG");
    tokens.add("BX-2024-0138");
    return [...tokens].sort((a, b) => b.length - a.length);
  }
  const CITE_TOKENS = buildCiteTokens();
  const CITE_SPLIT_REGEX = new RegExp("(" + CITE_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
  const CITE_TOKEN_SET = new Set(CITE_TOKENS);

  // Split into {text, cite} runs so a streaming reveal never has to cut a <span> tag mid-way.
  function buildCiteSegments(text) {
    return text.split(CITE_SPLIT_REGEX).filter((s) => s.length > 0).map((s) => ({ text: s, cite: CITE_TOKEN_SET.has(s) }));
  }
  function segmentsToHTML(segments, uptoSegIdx, partialCharIdx) {
    let html = "";
    for (let i = 0; i < uptoSegIdx && i < segments.length; i++) {
      const s = segments[i];
      html += s.cite ? `<span class="cite">${escapeHtml(s.text)}</span>` : escapeHtml(s.text);
    }
    if (uptoSegIdx < segments.length) {
      const cur = segments[uptoSegIdx];
      const shown = cur.text.slice(0, partialCharIdx);
      html += cur.cite ? `<span class="cite">${escapeHtml(shown)}</span>` : escapeHtml(shown);
    }
    return html;
  }

  const MODULE_LABEL = { candidates: "Candidate Explorer", governance: "Model Governance", pipeline: "Data & Quality Monitor", omics: "Multi-Omics Explorer", command: "Command Center" };

  let copilotStreamTimer = null;
  function stopCopilotStream() {
    if (copilotStreamTimer !== null) { clearInterval(copilotStreamTimer); copilotStreamTimer = null; }
  }

  // Reveals `text` a few characters at a time inside `bodyEl` (a fixed child of `.chat-bubble-a`),
  // then calls onDone once the full text is visible. Skips straight to full text if reduced-motion.
  function streamText(bodyEl, text, onDone) {
    const segments = buildCiteSegments(text);
    if (REDUCED_MOTION) {
      bodyEl.innerHTML = segmentsToHTML(segments, segments.length, 0);
      onDone();
      return;
    }
    let segIdx = 0, charIdx = 0;
    const CHARS_PER_TICK = 4;
    copilotStreamTimer = setInterval(() => {
      if (segIdx >= segments.length) { stopCopilotStream(); onDone(); return; }
      charIdx += CHARS_PER_TICK;
      bodyEl.innerHTML = segmentsToHTML(segments, segIdx, charIdx) + '<span class="type-cursor"></span>';
      if (charIdx >= segments[segIdx].text.length) { segIdx++; charIdx = 0; }
    }, 14);
  }

  let copilotGeneration = 0;

  function askCopilot(index) {
    stopCopilotStream();
    const myGeneration = ++copilotGeneration; // invalidates any still-pending "thinking" timeout from a prior question
    const item = DATA.copilot[index];
    const chat = $("#copilot-chat");
    $all(".copilot-q-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.index) === index));
    chat.innerHTML = `<div class="chat-bubble-q">${escapeHtml(item.q)}</div><div class="chat-thinking" id="thinking-node"><span></span><span></span><span></span></div>`;
    const delay = REDUCED_MOTION ? 60 : 750;
    setTimeout(() => {
      if (myGeneration !== copilotGeneration) return; // a newer question was asked in the meantime
      const node = document.getElementById("thinking-node");
      if (!node) return;
      node.outerHTML = `<div class="chat-bubble-a"><span id="copilot-answer-body"></span></div>`;
      const bodyEl = document.getElementById("copilot-answer-body");
      streamText(bodyEl, item.a, () => {
        const bubble = bodyEl.closest(".chat-bubble-a");
        if (!bubble) return;
        bubble.insertAdjacentHTML("beforeend", `<br><button class="jump-link" data-jump="${item.module}">Open ${MODULE_LABEL[item.module]} →</button>`);
        const jumpBtn = bubble.querySelector(".jump-link");
        if (jumpBtn) jumpBtn.addEventListener("click", () => goToView(jumpBtn.dataset.jump));
      });
    }, delay);
  }

  function initCopilot() {
    $("#copilot-suggestions").innerHTML = DATA.copilot.map((c, i) => `<button class="copilot-q-btn" type="button" data-index="${i}">${escapeHtml(c.q)}</button>`).join("");
    $all(".copilot-q-btn").forEach((btn) => btn.addEventListener("click", () => askCopilot(Number(btn.dataset.index))));
  }
  VIEW_INIT.copilot = initCopilot;

  /* ============================================================= */
  /* NOTIFICATIONS (top bar bell)                                   */
  /* ============================================================= */

  function initNotifications() {
    const wrap = $("#notif-wrap");
    const btn = $("#notif-bell");
    const dropdown = $("#notif-dropdown");
    const dot = $("#notif-dot");
    if (!wrap || !btn || !dropdown) return;

    const items = DATA.activity.slice(0, 6);
    $("#notif-list").innerHTML = items.map((a) => `
      <li class="notif-item">
        <span class="activity-icon ${a.type}">${ACTIVITY_ICON[a.type]}</span>
        <span class="activity-text">${escapeHtml(a.text)}<span class="activity-time">${escapeHtml(a.time)}</span></span>
      </li>`).join("");

    let open = false;
    let unread = true;
    function setOpen(next) {
      open = next;
      dropdown.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      if (open && unread) { unread = false; if (dot) dot.hidden = true; }
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!open); });
    document.addEventListener("click", (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });
  }

  /* ============================================================= */
  /* SHORTCUTS CHEAT-SHEET ("?")                                    */
  /* ============================================================= */

  function openShortcuts() {
    $("#shortcuts-overlay").classList.add("visible");
    $("#shortcuts-modal").classList.add("open");
    $("#shortcuts-modal").setAttribute("aria-hidden", "false");
  }
  function closeShortcuts() {
    $("#shortcuts-overlay").classList.remove("visible");
    $("#shortcuts-modal").classList.remove("open");
    $("#shortcuts-modal").setAttribute("aria-hidden", "true");
  }
  function initShortcuts() {
    $("#help-btn").addEventListener("click", openShortcuts);
    $("#shortcuts-close").addEventListener("click", closeShortcuts);
    $("#shortcuts-overlay").addEventListener("click", closeShortcuts);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "?") return;
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return; // don't hijack "?" while typing in a field
      e.preventDefault();
      openShortcuts();
    });
  }

  /* ============================================================= */
  /* BOOT SCREEN                                                    */
  /* ============================================================= */

  function initBootScreen() {
    const screen = $("#boot-screen");
    if (!screen) return;
    function dismiss() {
      if (screen.classList.contains("hide")) return;
      screen.classList.add("hide");
      setTimeout(() => screen.remove(), 450);
    }
    screen.addEventListener("click", dismiss);
    if (REDUCED_MOTION) { dismiss(); return; }

    const statusEl = $("#boot-status");
    const barEl = $("#boot-bar-fill");
    const steps = ["Connecting data sources…", "Loading candidate pipeline…", "Syncing multi-omics cohorts…", "Initializing AI models…", "Ready."];
    let i = 0;
    function nextStep() {
      if (screen.classList.contains("hide")) return; // visitor clicked to skip
      statusEl.textContent = steps[i];
      barEl.style.width = (((i + 1) / steps.length) * 100).toFixed(0) + "%";
      i++;
      if (i < steps.length) setTimeout(nextStep, 420);
      else setTimeout(dismiss, 500);
    }
    nextStep();
  }

  /* ============================================================= */
  /* GUIDED TOUR                                                    */
  /* ============================================================= */

  const TOUR_STEPS = [
    { view: "command", title: "Command Center", text: "A portfolio-level view — KPI trends, a 30-day throughput chart, and a live activity feed across every connected system." },
    { view: "candidates", title: "Candidate Explorer", text: DATA.candidates.length + " tracked drug candidates, ranked by binding affinity. Filter by target, stage, or risk — or compare a few side by side." },
    { view: "omics", title: "Multi-Omics Explorer", text: "A volcano plot over real gene variants across patient cohorts — filterable by tissue type and mutation status." },
    { view: "pipeline", title: "Data & Quality Monitor", text: "Live sync status across five connected data sources, plus a quality score for every dataset feeding the platform." },
    { view: "governance", title: "Model Governance", text: "Every production AI model, tracked for drift and validation status — so a model never quietly degrades unnoticed." },
    { view: "copilot", title: "Research Copilot", text: "Ask a question and get an answer synthesized from real numbers across the platform — not a canned response." },
  ];
  let tourIndex = -1; // -1 = tour not active
  let tourTimer = null;

  function isTourActive() { return tourIndex >= 0; }

  function renderTourStep() {
    const step = TOUR_STEPS[tourIndex];
    goToView(step.view);
    $("#tour-title").textContent = step.title;
    $("#tour-text").textContent = step.text;
    $("#tour-step-label").textContent = (tourIndex + 1) + " / " + TOUR_STEPS.length;
    $("#tour-progress").innerHTML = TOUR_STEPS.map((_, i) => `<span class="${i < tourIndex ? "done" : i === tourIndex ? "current" : ""}"></span>`).join("");
    $("#tour-prev").disabled = tourIndex === 0;
    $("#tour-next").textContent = tourIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next ›";
  }

  function armTourTimer() {
    clearTimeout(tourTimer);
    if (REDUCED_MOTION) return; // still navigable manually, just no auto-advance
    tourTimer = setTimeout(() => {
      if (tourIndex < TOUR_STEPS.length - 1) tourNext(); else exitTour();
    }, 6000);
  }

  function tourNext() {
    if (!isTourActive()) return;
    if (tourIndex >= TOUR_STEPS.length - 1) { exitTour(); return; }
    tourIndex++;
    renderTourStep();
    armTourTimer();
  }
  function tourPrev() {
    if (!isTourActive() || tourIndex === 0) return;
    tourIndex--;
    renderTourStep();
    armTourTimer();
  }
  function startTour() {
    closeCandidateDetail();
    closeCompareModal();
    closePalette();
    closeShortcuts();
    tourIndex = 0;
    $("#tour-caption").hidden = false;
    renderTourStep();
    armTourTimer();
  }
  function exitTour() {
    if (!isTourActive()) return;
    tourIndex = -1;
    clearTimeout(tourTimer);
    $("#tour-caption").hidden = true;
  }
  function initTour() {
    $("#tour-next").addEventListener("click", tourNext);
    $("#tour-prev").addEventListener("click", tourPrev);
    $("#tour-exit").addEventListener("click", exitTour);
  }

  /* ============================================================= */
  /* PROFILE MENU (org chip → dropdown → Profile / Settings / Switch Org / Sign Out) */
  /* ============================================================= */

  // Small abstract logo marks for each fake org — geometric, not literal text, and
  // deliberately distinct from the product's own DNA-strand mark in the top-left.
  const ORG_LOGOS = {
    meridian: '<path d="M12 4a8 8 0 0 1 0 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M12 7a5 5 0 0 1 0 10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="1.3" fill="#fff"/>',
    helix: '<path d="M12 4l6 8-6 8-6-8z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><line x1="6" y1="12" x2="18" y2="12" stroke="#fff" stroke-width="1.3"/>',
    vantage: '<path d="M4 16l5-8 3 4 3-6 5 10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
    northgate: '<path d="M6 20V8a6 6 0 0 1 12 0v12" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><line x1="6" y1="20" x2="6" y2="16" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><line x1="18" y1="20" x2="18" y2="16" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
  };
  const ORG_PROFILES = [
    { org: "Meridian Oncology", name: "M. Reyes", title: "Translational Data Lead", email: "m.reyes@meridianoncology.com", logo: ORG_LOGOS.meridian, color: "#2b6f8f" },
    { org: "Helix Therapeutics", name: "J. Okonkwo", title: "VP, Data Science", email: "j.okonkwo@helixtx.com", logo: ORG_LOGOS.helix, color: "#6b4fa0" },
    { org: "Vantage Biosciences", name: "A. Novak", title: "Chief Data Officer", email: "a.novak@vantagebio.com", logo: ORG_LOGOS.vantage, color: "#c1662f" },
    { org: "NorthGate Pharma", name: "S. Patel", title: "Director, R&D Informatics", email: "s.patel@northgatepharma.com", logo: ORG_LOGOS.northgate, color: "#55606f" },
  ];
  let currentProfileIndex = 0;
  let toastsEnabled = true;

  function orgLogoSvg(p) {
    return `<svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden="true">${p.logo}</svg>`;
  }

  function updateProfileChip() {
    const p = ORG_PROFILES[currentProfileIndex];
    const avatar = $("#profile-avatar");
    avatar.innerHTML = orgLogoSvg(p);
    avatar.style.background = p.color;
    avatar.setAttribute("aria-label", p.org + " logo");
    $("#profile-org-name").textContent = p.org;
    $("#profile-user-name").textContent = `${p.name} · ${p.title}`;
  }

  function renderProfileModal() {
    const p = ORG_PROFILES[currentProfileIndex];
    return `
      <h2 class="account-modal-title">User Profile</h2>
      <div class="profile-card">
        <div class="avatar avatar-lg" style="background:${p.color}" aria-label="${escapeHtml(p.org)} logo">${orgLogoSvg(p)}</div>
        <div>
          <div class="profile-card-name">${escapeHtml(p.name)}</div>
          <div class="profile-card-title">${escapeHtml(p.title)}</div>
        </div>
      </div>
      <div class="detail-metric-grid" style="margin-top:18px;">
        <div class="detail-metric"><div class="detail-metric-label">Organization</div><div class="detail-metric-value" style="font-size:13px;">${escapeHtml(p.org)}</div></div>
        <div class="detail-metric"><div class="detail-metric-label">Email</div><div class="detail-metric-value" style="font-size:13px;">${escapeHtml(p.email)}</div></div>
        <div class="detail-metric"><div class="detail-metric-label">Role</div><div class="detail-metric-value" style="font-size:13px;">Admin</div></div>
        <div class="detail-metric"><div class="detail-metric-label">Member Since</div><div class="detail-metric-value" style="font-size:13px;">Jan 2025</div></div>
      </div>`;
  }

  function renderSettingsModal() {
    return `
      <h2 class="account-modal-title">Settings</h2>
      <div class="settings-row">
        <div><div class="settings-row-label">Dark mode</div><div class="settings-row-sub">Switch the interface theme</div></div>
        <label class="switch"><input type="checkbox" id="settings-dark-toggle" ${currentTheme() === "dark" ? "checked" : ""}><span class="slider"></span></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-label">Live activity toasts</div><div class="settings-row-sub">Show a popup when new activity happens off-screen</div></div>
        <label class="switch"><input type="checkbox" id="settings-toast-toggle" ${toastsEnabled ? "checked" : ""}><span class="slider"></span></label>
      </div>
      <div class="settings-row">
        <div><div class="settings-row-label">Reduced motion</div><div class="settings-row-sub">Following your system setting</div></div>
        <span class="chip chip-muted">${REDUCED_MOTION ? "On" : "Off"}</span>
      </div>`;
  }

  function renderSwitchOrgModal() {
    return `
      <h2 class="account-modal-title">Switch Organization</h2>
      <div class="org-list">
        ${ORG_PROFILES.map((p, i) => `
          <div class="org-option${i === currentProfileIndex ? " current" : ""}" data-org-index="${i}">
            <div class="avatar" style="background:${p.color}" aria-label="${escapeHtml(p.org)} logo">${orgLogoSvg(p)}</div>
            <div>
              <div class="org-option-name">${escapeHtml(p.org)}</div>
              <div class="org-option-sub">${escapeHtml(p.name)} · ${escapeHtml(p.title)}</div>
            </div>
            ${i === currentProfileIndex ? '<span class="org-option-check">✓</span>' : ""}
          </div>`).join("")}
      </div>`;
  }

  function openAccountModal(kind) {
    const body = $("#account-modal-body");
    if (kind === "profile") body.innerHTML = renderProfileModal();
    else if (kind === "settings") body.innerHTML = renderSettingsModal();
    else if (kind === "switch-org") body.innerHTML = renderSwitchOrgModal();
    else return;

    $("#account-modal").classList.add("open");
    $("#account-modal").setAttribute("aria-hidden", "false");
    $("#account-overlay").classList.add("visible");

    if (kind === "settings") {
      $("#settings-dark-toggle").addEventListener("change", (e) => applyTheme(e.target.checked ? "dark" : "light"));
      $("#settings-toast-toggle").addEventListener("change", (e) => { toastsEnabled = e.target.checked; });
    }
    if (kind === "switch-org") {
      $all(".org-option", body).forEach((el) => {
        el.addEventListener("click", () => {
          currentProfileIndex = Number(el.dataset.orgIndex);
          updateProfileChip();
          closeAccountModal();
        });
      });
    }
  }
  function closeAccountModal() {
    $("#account-modal").classList.remove("open");
    $("#account-modal").setAttribute("aria-hidden", "true");
    $("#account-overlay").classList.remove("visible");
  }

  function initProfileMenu() {
    updateProfileChip();
    const wrap = $("#profile-wrap");
    const btn = $("#profile-btn");
    const dropdown = $("#profile-dropdown");
    let open = false;
    function setOpen(next) {
      open = next;
      dropdown.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!open); });
    document.addEventListener("click", (e) => { if (open && !wrap.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });

    $("#profile-open-profile").addEventListener("click", () => { setOpen(false); openAccountModal("profile"); });
    $("#profile-open-settings").addEventListener("click", () => { setOpen(false); openAccountModal("settings"); });
    $("#profile-open-tour").addEventListener("click", () => { setOpen(false); startTour(); });
    $("#profile-open-switch-org").addEventListener("click", () => { setOpen(false); openAccountModal("switch-org"); });
    $("#profile-sign-out").addEventListener("click", () => {
      setOpen(false);
      showToast({ type: "info", text: "Signed out — this is a demo, nothing was affected." });
    });

    $("#account-modal-close").addEventListener("click", closeAccountModal);
    $("#account-overlay").addEventListener("click", closeAccountModal);
  }

  /* ============================================================= */
  /* BOOT                                                           */
  /* ============================================================= */

  initNotifications();
  initPalette();
  initShortcuts();
  initTour();
  initProfileMenu();
  initBootScreen();
  goToView("command");
})();
