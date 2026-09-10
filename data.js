/* DataArt HCLS — synthetic in-memory dataset. No network calls, no external deps. */

// Deterministic PRNG so the demo looks the same every time it's opened.
function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(88172645);
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function randInt(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function randFloat(min, max, digits) {
  const v = rng() * (max - min) + min;
  return Number(v.toFixed(digits === undefined ? 2 : digits));
}

const DATA = {};

/* ---------------------------------------------------------------------- */
/* CANDIDATE EXPLORER                                                      */
/* ---------------------------------------------------------------------- */

const TARGETS = ["EGFR","KRAS","BRCA1","TP53","PIK3CA","ALK","MET","BRAF","ERBB2","VEGFR2","CDK4/6","JAK2","BTK","PARP1","MTOR","PDGFRA","IDH1","FGFR2","SMO","NTRK1"];
const MODALITIES = ["Small molecule","mAb","ADC","Bispecific","PROTAC","siRNA","CAR-T construct"];
const STAGES = ["Discovery","Lead Optimization","Preclinical","IND-Enabling","Phase I","Phase II"];
const RISKS = ["Low","Medium","High"];

function buildCandidates() {
  const list = [];
  const used = new Set();
  function nextId(fixed) {
    if (fixed !== undefined) { used.add(fixed); return "DA-" + String(fixed).padStart(4, "0"); }
    let n;
    do { n = randInt(100, 9999); } while (used.has(n));
    used.add(n);
    return "DA-" + String(n).padStart(4, "0");
  }

  // Anchor records referenced explicitly by the Research Copilot.
  list.push({
    id: nextId(417), target: "EGFR", modality: "Small molecule", stage: "Preclinical",
    pKd: 9.8, novelty: 94, risk: "Low", openQC: 0,
    samples: ["BX-2024-0138", "BX-2024-0139", "BX-2024-0201"],
    summary: "Fragment-derived hinge binder occupying the EGFR ATP pocket with a halogen-bond handle into the back pocket; selective over wild-type EGFR family members.",
  });
  list.push({
    id: nextId(512), target: "KRAS", modality: "PROTAC", stage: "Discovery",
    pKd: 6.9, novelty: 71, risk: "High", openQC: 2,
    samples: ["BX-2024-0304", "BX-2024-0305"],
    summary: "Bifunctional degrader tethering KRAS G12C to CRBN; early cell data shows off-target ubiquitination signal that needs resolving before advancement.",
  });
  list.push({
    id: nextId(288), target: "PARP1", modality: "Small molecule", stage: "Phase I",
    pKd: 9.1, novelty: 58, risk: "Low", openQC: 0,
    samples: ["BX-2023-0951", "BX-2023-0952"],
    summary: "Clinical-stage PARP1/2 inhibitor with BRCA1/2-mutant selective cytotoxicity; well-characterized PK/PD from Phase I dose escalation.",
  });
  list.push({
    id: nextId(360), target: "BTK", modality: "Small molecule", stage: "IND-Enabling",
    pKd: 8.7, novelty: 66, risk: "Medium", openQC: 1,
    samples: ["BX-2024-0044"],
    summary: "Covalent BTK inhibitor (Cys481) with reduced off-target kinase liability versus first-generation chemotypes; one open QC flag on a stability re-test.",
  });

  const namePrefixCounts = { DA: 0 };
  while (list.length < 408) {
    const target = pick(TARGETS);
    const stage = pick(STAGES);
    const risk = pick(RISKS);
    const pKdBase = risk === "Low" ? randFloat(7.6, 9.75, 1) : risk === "Medium" ? randFloat(6.8, 9.0, 1) : randFloat(5.8, 8.2, 1);
    list.push({
      id: nextId(),
      target,
      modality: pick(MODALITIES),
      stage,
      pKd: pKdBase,
      novelty: randInt(28, 97),
      risk,
      openQC: risk === "Low" ? randInt(0, 1) : risk === "Medium" ? randInt(0, 2) : randInt(1, 4),
      samples: [`BX-202${randInt(3, 4)}-${String(randInt(1, 999)).padStart(4, "0")}`, `BX-202${randInt(3, 4)}-${String(randInt(1, 999)).padStart(4, "0")}`],
      summary: `${pick(MODALITIES)} candidate against ${target}, currently in ${stage.toLowerCase()}; profile generated from internal screening cascade.`,
    });
  }
  // rank + percentile by pKd
  const sorted = [...list].sort((a, b) => b.pKd - a.pKd);
  sorted.forEach((c, i) => { c.rankPercentile = Math.round((1 - i / sorted.length) * 100); });
  return list;
}
DATA.candidates = buildCandidates();

/* ---------------------------------------------------------------------- */
/* MULTI-OMICS / BIOMARKER EXPLORER                                        */
/* ---------------------------------------------------------------------- */

const GENES = ["BRCA1","BRCA2","TP53","EGFR","KRAS","PIK3CA","PTEN","ALK","MET","BRAF","ERBB2","APC","SMAD4","CDKN2A","STK11","NF1","RB1","VHL","ATM","MYC","CCND1","MDM2","NRAS","IDH1","IDH2","FGFR2","NTRK1","ROS1","RET","KIT"];
const COHORTS = ["Breast-Ovarian Cohort A","NSCLC Cohort B","Colorectal Cohort C","Pancreatic Cohort D"];
const TISSUES = ["Tumor","Adjacent Normal","Metastasis","Liquid Biopsy"];
const MUT_STATUS = ["Mutant","Wild-type","VUS"];
const HGVS_C = ["c.68_69delAG","c.5266dupC","c.181T>G","c.3810_3811insC","c.35G>A","c.1799T>A","c.215_216insGA","c.742C>T","c.1624G>A"];
const HGVS_P = ["p.Glu23ValfsTer17","p.Gln1756ProfsTer74","p.Cys61Gly","p.Gly12Asp","p.Val600Glu","p.Arg273His","p.Leu858Arg","p.His1047Arg"];

function buildOmics() {
  const rows = [];
  // Anchor: BRCA1 strongly significant hit, referenced by copilot.
  rows.push({
    gene: "BRCA1", variantC: "c.68_69delAG", variantP: "p.Glu23ValfsTer17",
    cohort: "Breast-Ovarian Cohort A", tissue: "Tumor", mutation: "Mutant",
    log2fc: 3.2, negLogP: 8.1, sampleId: "BX-2024-0138", sampleN: 14, anchor: true,
  });
  let n = 0;
  while (rows.length < 480) {
    const gene = pick(GENES);
    const mutation = pick(MUT_STATUS);
    const log2fc = mutation === "Mutant" ? randFloat(-4.2, 4.5, 2) : randFloat(-1.8, 1.8, 2);
    const sig = Math.abs(log2fc) > 1.5 ? randFloat(2.5, 9.5, 2) : randFloat(0.05, 2.2, 2);
    rows.push({
      gene,
      variantC: pick(HGVS_C),
      variantP: pick(HGVS_P),
      cohort: pick(COHORTS),
      tissue: pick(TISSUES),
      mutation,
      log2fc,
      negLogP: sig,
      sampleId: `BX-202${randInt(3,4)}-${String(randInt(1,999)).padStart(4,"0")}`,
      sampleN: randInt(3, 22),
      anchor: false,
    });
    n++;
  }
  return rows;
}
DATA.omics = buildOmics();

/* ---------------------------------------------------------------------- */
/* DATA PIPELINE & QUALITY MONITOR                                         */
/* ---------------------------------------------------------------------- */

DATA.sources = [
  { name: "Genomic Sequencing Pipeline", icon: "dna", status: "Synced", lastSync: "2 min ago", rows: "48.2M variant calls" },
  { name: "Proteomics / Mass-Spec", icon: "flask", status: "Syncing", lastSync: "in progress", rows: "3.7M spectra" },
  { name: "Clinical / EDC", icon: "clip", status: "Synced", lastSync: "12 min ago", rows: "182K patient records" },
  { name: "LIMS", icon: "grid", status: "Delayed", lastSync: "26 hours ago", rows: "94K sample records" },
  { name: "Imaging (Histopathology / Radiology)", icon: "image", status: "Synced", lastSync: "45 min ago", rows: "61K studies" },
];

function buildDatasets() {
  const base = [
    { name: "Genomic Variant Calls v4", source: "Genomic Sequencing Pipeline", completeness: 96, freshness: 0.5, schema: 99, rows: "48,214,003" },
    { name: "Proteomics MS Runs", source: "Proteomics / Mass-Spec", completeness: 88, freshness: 1.2, schema: 94, rows: "3,701,442" },
    { name: "Clinical EDC Extract", source: "Clinical / EDC", completeness: 91, freshness: 0.2, schema: 97, rows: "182,003" },
    { name: "LIMS Sample Registry", source: "LIMS", completeness: 78, freshness: 26, schema: 90, rows: "94,118" },
    { name: "Imaging DICOM Index", source: "Imaging (Histopathology / Radiology)", completeness: 93, freshness: 0.75, schema: 96, rows: "61,022" },
    { name: "Candidate Screening Panel", source: "Genomic Sequencing Pipeline", completeness: 97, freshness: 0.3, schema: 99, rows: "408" },
    { name: "Multi-Omics Cohort Matrix", source: "Proteomics / Mass-Spec", completeness: 85, freshness: 3.4, schema: 92, rows: "480" },
    { name: "Adverse Event Narratives", source: "Clinical / EDC", completeness: 74, freshness: 8.1, schema: 88, rows: "9,442" },
    { name: "Batch QC Ledger", source: "LIMS", completeness: 95, freshness: 0.9, schema: 98, rows: "22,910" },
    { name: "Slide Annotation Set", source: "Imaging (Histopathology / Radiology)", completeness: 82, freshness: 5.6, schema: 91, rows: "14,077" },
    { name: "Structural Variant Calls", source: "Genomic Sequencing Pipeline", completeness: 89, freshness: 1.8, schema: 95, rows: "6,304,118" },
    { name: "Copy Number Segments", source: "Genomic Sequencing Pipeline", completeness: 92, freshness: 0.9, schema: 97, rows: "2,118,440" },
    { name: "Germline Panel Results", source: "Genomic Sequencing Pipeline", completeness: 94, freshness: 2.1, schema: 98, rows: "182,003" },
    { name: "Variant Annotation Cache", source: "Genomic Sequencing Pipeline", completeness: 90, freshness: 4.6, schema: 93, rows: "48,214,003" },
    { name: "Peptide Quantification Matrix", source: "Proteomics / Mass-Spec", completeness: 86, freshness: 2.0, schema: 91, rows: "1,842,207" },
    { name: "PTM Site Calls", source: "Proteomics / Mass-Spec", completeness: 79, freshness: 6.3, schema: 89, rows: "308,552" },
    { name: "Isobaric Labeling QC", source: "Proteomics / Mass-Spec", completeness: 91, freshness: 1.4, schema: 96, rows: "18,904" },
    { name: "Protein Abundance Panel", source: "Proteomics / Mass-Spec", completeness: 87, freshness: 3.9, schema: 92, rows: "612,330" },
    { name: "Vital Signs Extract", source: "Clinical / EDC", completeness: 96, freshness: 0.4, schema: 98, rows: "241,880" },
    { name: "Lab Values Extract", source: "Clinical / EDC", completeness: 93, freshness: 0.6, schema: 97, rows: "1,204,551" },
    { name: "Concomitant Medications Log", source: "Clinical / EDC", completeness: 81, freshness: 4.2, schema: 90, rows: "77,308" },
    { name: "Enrollment Roster", source: "Clinical / EDC", completeness: 98, freshness: 0.1, schema: 99, rows: "12,447" },
    { name: "Reagent Lot Tracking", source: "LIMS", completeness: 92, freshness: 1.1, schema: 95, rows: "8,214" },
    { name: "Freezer Inventory Snapshot", source: "LIMS", completeness: 88, freshness: 3.0, schema: 93, rows: "31,006" },
    { name: "Chain of Custody Log", source: "LIMS", completeness: 96, freshness: 0.8, schema: 99, rows: "94,118" },
    { name: "Instrument Calibration Records", source: "LIMS", completeness: 84, freshness: 9.4, schema: 88, rows: "4,552" },
    { name: "Radiology Series Index", source: "Imaging (Histopathology / Radiology)", completeness: 91, freshness: 1.6, schema: 95, rows: "38,904" },
    { name: "Annotation QC Overlay", source: "Imaging (Histopathology / Radiology)", completeness: 80, freshness: 7.2, schema: 90, rows: "14,077" },
    { name: "Whole Slide Thumbnail Cache", source: "Imaging (Histopathology / Radiology)", completeness: 95, freshness: 0.5, schema: 97, rows: "61,022" },
    { name: "Radiologist Read Reports", source: "Imaging (Histopathology / Radiology)", completeness: 83, freshness: 5.0, schema: 91, rows: "22,318" },
  ];
  return base;
}
DATA.datasets = buildDatasets();

/* ---------------------------------------------------------------------- */
/* MODEL & PIPELINE GOVERNANCE                                             */
/* ---------------------------------------------------------------------- */

function buildMetricSeries(startVal, endVal, n, noise) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = startVal + (endVal - startVal) * t;
    arr.push(Number((base + randFloat(-noise, noise, 2)).toFixed(2)));
  }
  return arr;
}

DATA.models = [
  {
    name: "TumorGrade-CNN", version: "v3.2", status: "Drifting", metricName: "Validation Accuracy (%)",
    series: buildMetricSeries(96.4, 91.2, 30, 0.6),
    audit: [
      { version: "v3.2", date: "2026-09-08", author: "M. Alaoui", note: "Deployed retrain on Q3 slide batch; drift monitor triggered day 6." },
      { version: "v3.1", date: "2026-07-14", author: "M. Alaoui", note: "Patched normalization for imaging pipeline v2 update." },
      { version: "v3.0", date: "2026-05-02", author: "R. Chen", note: "Validated for production; accuracy 96.8% on holdout." },
    ],
  },
  {
    name: "VariantPathogenicity-XGB", version: "v2.1", status: "Validated", metricName: "AUROC",
    series: buildMetricSeries(0.971, 0.974, 30, 0.003),
    audit: [
      { version: "v2.1", date: "2026-08-21", author: "S. Okafor", note: "Added ClinVar 2026Q2 refresh to training set." },
      { version: "v2.0", date: "2026-04-11", author: "S. Okafor", note: "Re-validated after feature set expansion (+12 annotations)." },
    ],
  },
  {
    name: "DoseResponse-LSTM", version: "v1.4", status: "In Review", metricName: "MAE (log IC50)",
    series: buildMetricSeries(0.41, 0.33, 30, 0.02),
    audit: [
      { version: "v1.4", date: "2026-09-05", author: "J. Park", note: "Submitted for validation review; pending sign-off from bio-stats." },
      { version: "v1.3", date: "2026-06-30", author: "J. Park", note: "Retrained on expanded dose-response panel (n=1,204)." },
    ],
  },
  {
    name: "AdverseEventNLP-BERT", version: "v5.0", status: "Validated", metricName: "F1 (event extraction)",
    series: buildMetricSeries(0.912, 0.918, 30, 0.004),
    audit: [
      { version: "v5.0", date: "2026-07-29", author: "L. Fischer", note: "Upgraded tokenizer; validated on 2026 MedDRA release." },
      { version: "v4.2", date: "2026-03-18", author: "L. Fischer", note: "Production baseline." },
    ],
  },
  {
    name: "CellSegmentation-UNet", version: "v2.0", status: "Validated", metricName: "Mean IoU",
    series: buildMetricSeries(0.887, 0.891, 30, 0.003),
    audit: [
      { version: "v2.0", date: "2026-08-02", author: "R. Chen", note: "Retrained with augmented staining variation set." },
      { version: "v1.6", date: "2026-02-09", author: "R. Chen", note: "Production baseline for histopathology pipeline." },
    ],
  },
  {
    name: "ProteinFold-Transformer", version: "v1.1", status: "In Review", metricName: "TM-score",
    series: buildMetricSeries(0.79, 0.83, 30, 0.01),
    audit: [
      { version: "v1.1", date: "2026-09-01", author: "S. Okafor", note: "Extended context window; awaiting benchmark sign-off." },
    ],
  },
];

/* ---------------------------------------------------------------------- */
/* COMMAND CENTER                                                          */
/* ---------------------------------------------------------------------- */

function buildSparkline(n, base, noise, drift) {
  const arr = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v += randFloat(-noise, noise, 2) + drift;
    arr.push(Number(v.toFixed(1)));
  }
  return arr;
}

DATA.kpis = [
  { label: "Active Pipelines", tip: "How many research pipelines are currently running.", value: "18", raw: 18, kind: "int", live: true, delta: "+2 vs last week", trend: buildSparkline(14, 15, 0.6, 0.05), color: "sky" },
  { label: "Models in Production", tip: "AI models currently deployed and making real predictions.", value: "7", raw: 7, kind: "int", live: false, delta: "steady", trend: buildSparkline(14, 6.5, 0.3, 0.02), color: "turquoise" },
  { label: "Data Quality Score", tip: "An overall score for how complete, fresh, and correctly formatted the platform's data is.", value: "92%", raw: 92, kind: "pct", live: true, delta: "-1.4 pts vs last week", trend: buildSparkline(14, 93, 0.4, -0.05), color: "yellow" },
  { label: "Samples Processed (7d)", tip: "Total lab samples processed across all pipelines in the last 7 days.", value: "1,284", raw: 1284, kind: "comma", live: true, delta: "+9% vs last week", trend: buildSparkline(14, 1100, 30, 6), color: "sky" },
  { label: "Candidates Under Review", tip: "Drug candidates currently being evaluated by the research team.", value: "23", raw: 23, kind: "int", live: true, delta: "+4 vs last week", trend: buildSparkline(14, 19, 1, 0.25), color: "blue" },
];

function buildThroughput() {
  const days = [];
  const values = [];
  const today = new Date("2026-09-10T09:00:00");
  let v = 380;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    v += randFloat(-25, 30, 0);
    if (i === 6) v += 140; // annotated peak: weekly batch release
    v = Math.max(220, v);
    days.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    values.push(Math.round(v));
  }
  return { days, values, peakIndex: 23 };
}
DATA.throughput = buildThroughput();

DATA.activity = [
  { type: "success", time: "8:41 AM", text: "Candidate DA-0417 cleared automated QC — top 5% binding affinity, no open flags." },
  { type: "warning", time: "8:15 AM", text: "TumorGrade-CNN v3.2 drift monitor triggered — validation accuracy 91.2% (threshold 93%)." },
  { type: "info", time: "7:58 AM", text: "Batch BX-2024-0391 completed proteomics QC — 412 spectra processed." },
  { type: "warning", time: "7:30 AM", text: "LIMS sync delayed 26h — Sample Registry completeness down to 78%." },
  { type: "info", time: "7:02 AM", text: "Multi-Omics Cohort Matrix refreshed — Breast-Ovarian Cohort A now includes 14 new BRCA1-mutant samples." },
  { type: "success", time: "6:44 AM", text: "VariantPathogenicity-XGB v2.1 re-validated — AUROC 0.974 on holdout set." },
  { type: "info", time: "Yesterday, 9:12 PM", text: "Imaging pipeline ingested 1,204 new histopathology slides (Slide Annotation Set)." },
  { type: "warning", time: "Yesterday, 6:20 PM", text: "Candidate DA-0512 flagged High risk — off-target ubiquitination signal in early cell data." },
  { type: "success", time: "Yesterday, 3:47 PM", text: "AdverseEventNLP-BERT v5.0 passed quarterly revalidation — F1 0.918." },
  { type: "info", time: "Yesterday, 1:05 PM", text: "Clinical/EDC extract synced — 182,003 patient records, schema validity 97%." },
  { type: "warning", time: "Yesterday, 11:30 AM", text: "Adverse Event Narratives dataset completeness at 74% — missing coder fields in 3 sites." },
  { type: "success", time: "Yesterday, 9:18 AM", text: "DoseResponse-LSTM v1.4 submitted for governance review." },
  { type: "info", time: "2 days ago, 4:52 PM", text: "408 candidates re-ranked after weekly binding-affinity refresh." },
  { type: "success", time: "2 days ago, 2:10 PM", text: "CellSegmentation-UNet v2.0 revalidated — mean IoU 0.891." },
  { type: "info", time: "2 days ago, 10:00 AM", text: "Weekly batch release processed 1,284 samples across 5 connected sources." },
  { type: "info", time: "3 days ago, 5:40 PM", text: "Structural Variant Calls dataset refreshed — 6.3M records ingested from Genomic Sequencing Pipeline." },
  { type: "warning", time: "3 days ago, 3:12 PM", text: "PTM Site Calls completeness dipped to 79% — three proteomics runs missing site-level confidence scores." },
  { type: "success", time: "3 days ago, 1:05 PM", text: "ProteinFold-Transformer v1.1 extended context window — TM-score improved to 0.83 on internal benchmark." },
  { type: "info", time: "3 days ago, 11:30 AM", text: "Radiology Series Index synced — 38,904 studies indexed, schema validity 95%." },
  { type: "success", time: "3 days ago, 9:15 AM", text: "Candidate targeting BRAF cleared preclinical tox screen with no new risk flags." },
  { type: "info", time: "4 days ago, 6:48 PM", text: "Copy Number Segments dataset refreshed from Genomic Sequencing Pipeline — 2.1M segments called." },
  { type: "warning", time: "4 days ago, 4:22 PM", text: "Annotation QC Overlay freshness at 7.2h — histopathology annotation queue running behind schedule." },
  { type: "info", time: "4 days ago, 2:00 PM", text: "Multi-Omics Explorer cohort refresh added 22 new NSCLC Cohort B samples with EGFR variant calls." },
  { type: "success", time: "4 days ago, 10:40 AM", text: "VariantPathogenicity-XGB v2.1 flagged 3 new likely-pathogenic TP53 variants for curator review." },
  { type: "info", time: "4 days ago, 8:05 AM", text: "Enrollment Roster synced — 12,447 patients, completeness 98%." },
  { type: "warning", time: "5 days ago, 7:15 PM", text: "Instrument Calibration Records completeness at 84% — two mass-spec instruments overdue for recalibration." },
  { type: "success", time: "5 days ago, 5:02 PM", text: "Candidate targeting PARP1 advanced from Lead Optimization to Preclinical after selectivity panel passed." },
  { type: "info", time: "5 days ago, 2:30 PM", text: "Reagent Lot Tracking dataset synced from LIMS — 8,214 lots reconciled, no expired reagents in active use." },
  { type: "success", time: "5 days ago, 11:18 AM", text: "AdverseEventNLP-BERT v5.0 processed 1,140 new adverse-event narratives with F1 0.918." },
  { type: "info", time: "5 days ago, 9:00 AM", text: "Whole Slide Thumbnail Cache refreshed — 61,022 slides available for review." },
  { type: "warning", time: "6 days ago, 6:35 PM", text: "Concomitant Medications Log completeness at 81% — coding backlog identified at two clinical sites." },
  { type: "success", time: "6 days ago, 4:10 PM", text: "CellSegmentation-UNet v2.0 retrained with augmented staining variation set ahead of scheduled revalidation." },
  { type: "info", time: "6 days ago, 1:45 PM", text: "Peptide Quantification Matrix updated — 1.84M peptide-level quantifications across active cohorts." },
  { type: "success", time: "6 days ago, 10:20 AM", text: "Candidate targeting ALK cleared automated QC with zero open flags." },
  { type: "info", time: "6 days ago, 8:00 AM", text: "Chain of Custody Log reconciled against Batch QC Ledger — no discrepancies found." },
  { type: "warning", time: "7 days ago, 5:55 PM", text: "Freezer Inventory Snapshot flagged 12 sample vials nearing capacity threshold in Cold Storage Unit 3." },
  { type: "success", time: "7 days ago, 3:30 PM", text: "DoseResponse-LSTM v1.4 retrained on expanded dose-response panel (n=1,204) ahead of governance review." },
  { type: "info", time: "7 days ago, 1:12 PM", text: "Radiologist Read Reports synced — 22,318 reports linked to Imaging DICOM Index." },
  { type: "success", time: "7 days ago, 9:40 AM", text: "Candidate targeting MET advanced to IND-Enabling after tox panel review." },
  { type: "info", time: "8 days ago, 6:20 PM", text: "Germline Panel Results refreshed — 182,003 records, schema validity 98%." },
  { type: "warning", time: "8 days ago, 2:48 PM", text: "Isobaric Labeling QC flagged batch drift on 2 proteomics runs — reprocessing scheduled." },
  { type: "info", time: "9 days ago, 11:05 AM", text: "Protein Abundance Panel synced — 612,330 abundance calls across NSCLC Cohort B and Pancreatic Cohort D." },
  { type: "success", time: "9 days ago, 8:30 AM", text: "Candidate targeting JAK2 cleared automated QC with zero open flags." },
  { type: "warning", time: "10 days ago, 3:05 PM", text: "VariantPathogenicity-XGB v2.1 flagged a PIK3CA VUS for manual curator review in Colorectal Cohort C." },
  { type: "info", time: "10 days ago, 9:50 AM", text: "Lab Values Extract synced — 1,204,551 records, freshness 0.6h." },
];

/* ---------------------------------------------------------------------- */
/* RESEARCH COPILOT                                                        */
/* ---------------------------------------------------------------------- */

DATA.copilot = [
  {
    q: "Which candidate should we prioritize this week?",
    a: "DA-0417 (EGFR, small molecule) is the strongest near-term pick: it ranks in the top 5% of the portfolio for binding affinity (pKd 9.8), carries zero open QC flags, and just cleared automated QC this morning — see the Recent Activity feed. It's still in Preclinical, so the natural next step is IND-enabling tox. By contrast, DA-0512 (KRAS PROTAC) scores well on novelty (71) but has an open High-risk flag for off-target ubiquitination — hold that one for follow-up assays before advancing. Both are visible in Candidate Explorer with full detail panels.",
    module: "candidates",
  },
  {
    q: "What's driving the drift alert on our production model?",
    a: "TumorGrade-CNN v3.2 is the model in question. Validation accuracy has slid from 96.4% to 91.2% over the last 30 days, crossing the 93% governance threshold 6 days after its last retrain (deployed 2026-09-08 by M. Alaoui). The audit trail in Model Governance shows this retrain used the Q3 slide batch — likely a distribution shift from the new imaging pipeline v2 normalization. Recommended action: pull a fresh holdout from the current Slide Annotation Set (82% complete) and re-check calibration before the next scheduled inference run.",
    module: "governance",
  },
  {
    q: "Any data quality issues blocking analysis right now?",
    a: "Yes — two worth flagging. LIMS Sample Registry completeness has dropped to 78% with a 26-hour sync delay (see Data Pipeline & Quality Monitor), which is the same delay called out in this morning's activity feed. Separately, Adverse Event Narratives sits at 74% completeness due to missing coder fields at three sites. Neither blocks the genomic or proteomics pipelines, which are both above 88% completeness and syncing normally — but any analysis joining against LIMS sample metadata should wait for the next sync or filter to samples registered before yesterday.",
    module: "pipeline",
  },
  {
    q: "What does the BRCA1-mutant cohort show?",
    a: "In Breast-Ovarian Cohort A, BRCA1 c.68_69delAG (p.Glu23ValfsTer17) is the standout signal: log2 fold-change of 3.2 at -log10(p) of 8.1 across 14 tumor samples — the annotated point in the Multi-Omics volcano plot. That's a strong, statistically robust hit consistent with loss-of-function BRCA1 truncation. Sample BX-2024-0138 anchors this cluster and also appears in Candidate Explorer as a related sample for DA-0417, which is worth cross-checking if you're building a combination hypothesis around this cohort.",
    module: "omics",
  },
  {
    q: "How's overall pipeline health this week?",
    a: "Portfolio-level, it's a mixed-but-healthy picture: 18 active pipelines (+2 week over week), 7 models in production, and 1,284 samples processed in the last 7 days (+9%). Data Quality Score has slipped slightly to 92% (-1.4 pts), driven mainly by the LIMS delay noted above — worth watching but not yet critical. Candidates under review rose to 23 (+4), reflecting the weekly binding-affinity re-rank across all 408 tracked candidates. Full detail is on the Command Center dashboard.",
    module: "command",
  },
  {
    q: "Which targets have the most candidates in the pipeline?",
    a: "Across the 408 tracked candidates, EGFR, KRAS, and BRAF carry the largest active counts, spanning modalities from small molecules to PROTACs and bispecifics. EGFR is currently the strongest target overall on a risk-adjusted basis, anchored by DA-0417's top-5% binding affinity with zero QC flags. Use the Target filter in Candidate Explorer to see the live ranked-bar breakdown — it recomputes instantly as you narrow by stage or risk level.",
    module: "candidates",
  },
];
