/* ===========================================================
   ChronoLens — converter.js (v2)
   - Integer-only epoch seconds input
   - Segmented keyboard-friendly date/time (ISO) input
   - Source timezone + DST handling
   - Multiple target timezone rows (DST auto)
   - Epoch-seconds OUTPUT when input is a date/time string
   - Live current epoch seconds clock in the header
   - Shared tz/format helpers exposed on window.CHRONOLENS
   =========================================================== */

(function () {
  "use strict";

  const userLocalTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (_) {
      return "UTC";
    }
  })();

  const RAW_TZ_LIST = [
    { label: `Local (${userLocalTz})`, tz: userLocalTz, isLocal: true },
    { label: "UTC (Coordinated Universal Time)", tz: "UTC" },
    { label: "India Standard Time (IST)", tz: "Asia/Kolkata" },
    { label: "US Eastern (New York)", tz: "America/New_York" },
    { label: "US Central (Chicago)", tz: "America/Chicago" },
    { label: "US Mountain (Denver)", tz: "America/Denver" },
    { label: "US Pacific (Los Angeles / SF)", tz: "America/Los_Angeles" },
    { label: "UK / London (GMT/BST)", tz: "Europe/London" },
    { label: "Central Europe (Paris / Amsterdam)", tz: "Europe/Paris" },
    { label: "Central Europe (Berlin / Frankfurt)", tz: "Europe/Berlin" },
    { label: "Gulf Standard Time (Dubai)", tz: "Asia/Dubai" },
    { label: "Singapore / Hong Kong", tz: "Asia/Singapore" },
    { label: "Japan Standard Time (Tokyo)", tz: "Asia/Tokyo" },
    { label: "Australia (Sydney / Melbourne)", tz: "Australia/Sydney" },
  ];

  const seenTz = new Set();
  const TZ_LIST = [];
  for (const item of RAW_TZ_LIST) {
    if (item.isLocal || !seenTz.has(item.tz)) {
      TZ_LIST.push(item);
      seenTz.add(item.tz);
    }
  }

  const TIMESTAMP_KEYS = new Set([
    "timestamp", "epoch", "starttime", "endtime",
    "createdat", "updatedat", "effectivedate", "lastrefreshedat",
  ]);

  window.CHRONOLENS = window.CHRONOLENS || {};
  window.CHRONOLENS.TZ_LIST = TZ_LIST;
  window.CHRONOLENS.TIMESTAMP_KEYS = TIMESTAMP_KEYS;

  // ---- State ----
  const state = {
    mode: "epoch",
    instantMs: null,
    sourceTz: "UTC",
    dstChoice: null,
    rows: [{ tz: "UTC" }, { tz: userLocalTz !== "UTC" ? userLocalTz : "Asia/Kolkata" }],
  };

  const $ = (id) => document.getElementById(id);
  let epochInput, epochError, epochDetectedBadge, dtError, sourceTzSel, tzList, tzEmpty,
      epochOutputCard, epochOutputValue, epochOutputMsValue;

  // ---- TZ helpers (shared via window.CHRONOLENS) ----
  function pad(n, w = 2) { return String(n).padStart(w, "0"); }

  function partsInTz(ms, tz) {
    const dt = new Date(ms);
    const opts = {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false, timeZone: tz === "UTC" ? "UTC" : tz,
    };
    const fmt = new Intl.DateTimeFormat("en-US", opts);
    const parts = {};
    for (const p of fmt.formatToParts(dt)) parts[p.type] = p.value;
    let h = parseInt(parts.hour, 10);
    if (h === 24) h = 0;
    return {
      year: parts.year,
      month: pad(parseInt(parts.month, 10)),
      day: pad(parseInt(parts.day, 10)),
      hour: pad(h),
      minute: parts.minute,
      second: parts.second,
      ms: pad(ms % 1000, 3),
    };
  }

  function fmtA(ms, tz) {
    const p = partsInTz(ms, tz);
    const s = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.ms}`;
    return tz === "UTC" ? s + "Z" : s;
  }
  function fmtB(ms, tz) {
    const p = partsInTz(ms, tz);
    const s = `${p.day}/${p.month}/${p.year}T${p.hour}:${p.minute}:${p.second}.${p.ms}`;
    return tz === "UTC" ? s + "Z" : s;
  }
  // Human "DD Mon YYYY, HH:mm:ss.SSS UTC"
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtHumanUtc(ms) {
    const d = new Date(ms);
    return `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ` +
           `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)} UTC`;
  }
  function fmtHumanTz(ms, tz) {
    if (tz === "UTC") return fmtHumanUtc(ms);
    const p = partsInTz(ms, tz);
    const m = parseInt(p.month, 10) - 1;
    return `${p.day} ${MON[m]} ${p.year}, ${p.hour}:${p.minute}:${p.second}.${p.ms} (${tz})`;
  }

  // ISO 8601 with explicit offset, copy-pasteable & machine-parseable.
  // UTC  -> "YYYY-MM-DDTHH:mm:ss.SSSZ"
  // zone -> "YYYY-MM-DDTHH:mm:ss.SSS+HH:MM"  (offset computed from instant, incl. DST)
  function fmtIsoUtc(ms) {
    const d = new Date(ms);
    return d.toISOString();
  }
  function tzOffsetString(ms, tz) {
    // Intl gives the offset via formatToParts with timeZoneName shortOffset
    const dt = new Date(ms);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, timeZoneName: "shortOffset",
    });
    const parts = fmt.formatToParts(dt);
    let off = parts.find((p) => p.type === "timeZoneName");
    if (!off || off.value === "GMT" || off.value === "UTC") return "Z";
    // off.value like "GMT+5:30" or "GMT-7"
    const m = off.value.match(/GMT([+-])(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return "Z";
    const sign = m[1];
    const hh = pad(parseInt(m[2], 10));
    const mm = m[3] ? pad(parseInt(m[3], 10)) : "00";
    return `${sign}${hh}:${mm}`;
  }
  function fmtIso(ms, tz) {
    if (tz === "UTC") return fmtIsoUtc(ms);
    const p = partsInTz(ms, tz);
    const body = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.ms}`;
    return body + tzOffsetString(ms, tz);
  }

  window.CHRONOLENS.fmtA = fmtA;
  window.CHRONOLENS.fmtB = fmtB;
  window.CHRONOLENS.fmtHumanUtc = fmtHumanUtc;
  window.CHRONOLENS.fmtHumanTz = fmtHumanTz;
  window.CHRONOLENS.fmtIsoUtc = fmtIsoUtc;
  window.CHRONOLENS.fmtIso = fmtIso;
  window.CHRONOLENS.tzOffsetString = tzOffsetString;
  window.CHRONOLENS.partsInTz = partsInTz;

  // ---- Epoch parsing (seconds & milliseconds supported) ----
  function parseEpoch(str) {
    if (str === null || str === undefined || String(str).trim() === "") {
      return { ok: false, err: "Enter an epoch timestamp (seconds or milliseconds)." };
    }
    const t = String(str).trim();
    if (!/^-?\d+$/.test(t)) {
      return { ok: false, err: "Integer numbers only. No decimals. Example: 1735689600" };
    }
    const val = parseInt(t, 10);
    if (!Number.isSafeInteger(val)) return { ok: false, err: "Number out of range." };

    // Auto-detect seconds (10 digits) vs milliseconds (12-14 digits)
    const isMs = String(Math.abs(val)).length >= 12;
    if (isMs) {
      if (!inPlausibleRange(val)) return { ok: false, err: "Timestamp out of plausible range." };
      return { ok: true, ms: val, unit: "ms", orig: val };
    } else {
      const ms = val * 1000;
      if (!inPlausibleRange(ms)) return { ok: false, err: "Timestamp out of plausible range." };
      return { ok: true, ms: ms, unit: "s", orig: val };
    }
  }

  function inPlausibleRange(ms) {
    return ms >= -2208988800000 && ms <= 7258204800000;
  }
  window.CHRONOLENS.inPlausibleRange = inPlausibleRange;

  // ---- Segmented date/time parsing ----
  function getSegValues() {
    const segs = document.querySelectorAll("#segmented-dt .seg");
    const v = {};
    segs.forEach((s) => { v[s.dataset.part] = s.value.trim(); });
    return v;
  }
  function segsComplete(v) {
    return v.year && v.month && v.day && v.hour && v.minute && v.second &&
      v.year.length === 4 && v.month.length === 2 && v.day.length === 2 &&
      v.hour.length === 2 && v.minute.length === 2 && v.second.length === 2;
  }
  function isValidCalendarDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    let maxDay = dim[m - 1];
    if (m === 2 && leap) maxDay = 29;
    return d <= maxDay;
  }
  function isValidTime(h, m, s) {
    return h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60;
  }

  // Resolve wall-clock (in tz) → UTC instant(s).
  // Returns { ok, candidates?[], err? }
  function wallClockToInstant(v, tz) {
    const year = parseInt(v.year, 10);
    const month = parseInt(v.month, 10);
    const day = parseInt(v.day, 10);
    const hour = parseInt(v.hour, 10);
    const minute = parseInt(v.minute, 10);
    const second = parseInt(v.second, 10);
    const ms = v.ms ? parseInt(v.ms.padEnd(3, "0"), 10) : 0;

    if (!isValidCalendarDate(year, month, day)) return { ok: false, err: "Invalid calendar date (check month/day and leap year)." };
    if (!isValidTime(hour, minute, second)) return { ok: false, err: "Invalid time of day." };

    if (tz === "UTC") {
      return { ok: true, candidates: [Date.UTC(year, month - 1, day, hour, minute, second, ms)] };
    }

    const want = {
      year, month: pad(month), day: pad(day),
      hour: pad(hour), minute: pad(minute), second: pad(second),
    };
    const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    const dayMs = 86400000;
    const start = naiveUtcMs - dayMs;
    const end = naiveUtcMs + dayMs;
    const matches = new Set();
    for (let t = start; t <= end; t += 60000) {
      const p = partsInTz(t, tz);
      if (p.year === String(want.year) && p.month === want.month &&
          p.day === want.day && p.hour === want.hour &&
          p.minute === want.minute && p.second === want.second) {
        if (Math.floor(t % 1000) === ms) matches.add(t);
      }
    }
    if (matches.size === 0) {
      return { ok: false, err: "This wall-clock time does not exist in " + tz + " (spring-forward gap)." };
    }
    return { ok: true, candidates: Array.from(matches) };
  }

  // ---- Rendering ----
  function renderTargetRows() {
    if (!tzList) return;
    tzList.innerHTML = "";
    state.rows.forEach((row, idx) => {
      const el = document.createElement("div");
      el.className = "tz-row";
      el.dataset.idx = idx;

      const sel = document.createElement("select");
      sel.className = "select-input";
      TZ_LIST.forEach((t) => {
        const o = document.createElement("option");
        o.value = t.tz;
        o.textContent = `${t.label} — ${t.tz}`;
        if (t.tz === row.tz) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", () => { row.tz = sel.value; renderTargetRows(); });

      const outA = document.createElement("div");
      outA.className = "tz-out";
      const outB = document.createElement("div");
      outB.className = "tz-out";
      const outHuman = document.createElement("div");
      outHuman.className = "tz-out";

      const actions = document.createElement("div");
      actions.className = "row-actions";
      const rm = document.createElement("button");
      rm.className = "btn-icon btn-danger";
      rm.type = "button";
      rm.textContent = "✕ Remove";
      rm.title = "Remove this row";
      rm.addEventListener("click", () => { state.rows.splice(idx, 1); renderTargetRows(); });
      actions.appendChild(rm);

      el.appendChild(sel);

      if (state.instantMs !== null) {
        const aVal = fmtA(state.instantMs, row.tz);
        const bVal = fmtB(state.instantMs, row.tz);
        const hVal = fmtHumanTz(state.instantMs, row.tz);

        outA.innerHTML = `<span class="tz-out-label">Format A · YYYY-MM-DDTHH:mm:ss.SSS</span>`;
        const va = document.createElement("div");
        va.className = "tz-out-value";
        const spanA = document.createElement("span");
        spanA.textContent = aVal;
        const cpA = makeCopyBtn(aVal);
        va.appendChild(spanA); va.appendChild(cpA);
        outA.appendChild(va);

        outB.innerHTML = `<span class="tz-out-label">Format B · DD/MM/YYYYTHH:mm:ss.SSS</span>`;
        const vb = document.createElement("div");
        vb.className = "tz-out-value";
        const spanB = document.createElement("span");
        spanB.textContent = bVal;
        const cpB = makeCopyBtn(bVal);
        vb.appendChild(spanB); vb.appendChild(cpB);
        outB.appendChild(vb);

        outHuman.innerHTML = `<span class="tz-out-label">Human Date &amp; Time</span>`;
        const vh = document.createElement("div");
        vh.className = "tz-out-value";
        const spanH = document.createElement("span");
        spanH.textContent = hVal;
        spanH.title = hVal;
        const cpH = makeCopyBtn(hVal);
        vh.appendChild(spanH); vh.appendChild(cpH);
        outHuman.appendChild(vh);
      } else {
        outA.innerHTML = `<span class="tz-out-label">Format A</span><div class="tz-out-value"><span class="muted">—</span></div>`;
        outB.innerHTML = `<span class="tz-out-label">Format B</span><div class="tz-out-value"><span class="muted">—</span></div>`;
        outHuman.innerHTML = `<span class="tz-out-label">Human Date &amp; Time</span><div class="tz-out-value"><span class="muted">—</span></div>`;
      }

      el.appendChild(outA);
      el.appendChild(outB);
      el.appendChild(outHuman);
      el.appendChild(actions);
      tzList.appendChild(el);
    });
    if (tzEmpty) tzEmpty.style.display = state.rows.length ? "none" : "block";
  }

  function makeCopyBtn(text) {
    const b = document.createElement("button");
    b.className = "copy-inline";
    b.type = "button";
    b.textContent = "⧉";
    b.title = "Copy";
    b.addEventListener("click", (e) => { e.preventDefault(); copyText(text); });
    return b;
  }

  function copyText(text) {
    const done = () => toast("Copied");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, cb) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); cb(); } catch (_) {}
    document.body.removeChild(ta);
  }
  window.CHRONOLENS.copyText = copyText;

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1400);
  }
  window.CHRONOLENS.toast = toast;

  // ---- Live epoch clock ----
  let liveTimer = null;
  let lastLiveEpoch = 0;
  function startLiveClock() {
    const el = document.getElementById("live-epoch");
    if (!el) return;
    const tick = () => {
      const secs = Math.floor(Date.now() / 1000);
      lastLiveEpoch = secs;
      el.textContent = secs.toLocaleString("en-US");
    };
    tick();
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = setInterval(tick, 1000);
    const cp = document.getElementById("live-copy");
    if (cp) cp.addEventListener("click", () => copyText(String(lastLiveEpoch)));
  }

  // ---- Epoch output (datetime mode) ----
  function renderEpochOutput() {
    if (!epochOutputCard) return;
    if (state.mode !== "datetime" || state.instantMs === null) {
      epochOutputCard.classList.add("hidden");
      return;
    }
    const secs = Math.floor(state.instantMs / 1000);
    const ms = state.instantMs;
    if (epochOutputValue) epochOutputValue.textContent = secs.toLocaleString("en-US");
    if (epochOutputMsValue) epochOutputMsValue.textContent = ms.toLocaleString("en-US");
    epochOutputCard.classList.remove("hidden");
  }

  // ---- Convert action ----
  function doConvert() {
    clearErrors();
    if (state.mode === "epoch") {
      const r = parseEpoch(epochInput.value);
      if (!r.ok) { showEpochError(r.err); return; }
      state.instantMs = r.ms;
      if (epochDetectedBadge) {
        if (r.unit === "ms") {
          const secs = Math.floor(r.orig / 1000);
          epochDetectedBadge.textContent = `Auto-detected: Milliseconds (13 digits) · Equivalent to ${secs.toLocaleString("en-US")} seconds`;
          epochDetectedBadge.classList.remove("hidden");
        } else {
          epochDetectedBadge.textContent = `Auto-detected: Unix seconds (10 digits) · Equivalent to ${(r.orig * 1000).toLocaleString("en-US")} ms`;
          epochDetectedBadge.classList.remove("hidden");
        }
      }
    } else {
      const v = getSegValues();
      if (!segsComplete(v)) { showDtError("Fill all date/time segments (YYYY-MM-DDTHH:mm:ss.SSS)."); return; }
      const r = wallClockToInstant(v, state.sourceTz);
      if (!r.ok) { showDtError(r.err); return; }
      const cands = r.candidates;
      if (cands.length > 1) {
        if (state.dstChoice === null) { renderDstChoice(cands); return; }
        state.instantMs = cands[state.dstChoice === "first" ? 0 : 1];
      } else {
        state.dstChoice = null;
        hideDstChoice();
        state.instantMs = cands[0];
      }
    }
    renderTargetRows();
    renderEpochOutput();
  }

  function renderDstChoice(cands) {
    const dst = document.getElementById("dst-choice");
    const opts = document.getElementById("dst-options");
    dst.classList.remove("hidden");
    opts.innerHTML = "";
    const makeOpt = (label, val) => {
      const b = document.createElement("button");
      b.className = "opt-btn";
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        opts.querySelectorAll(".opt-btn").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        state.dstChoice = val;
        doConvert();
      });
      return b;
    };
    opts.appendChild(makeOpt("First occurrence → " + new Date(cands[0]).toISOString(), "first"));
    opts.appendChild(makeOpt("Second occurrence → " + new Date(cands[1]).toISOString(), "second"));
  }
  function hideDstChoice() {
    const dst = document.getElementById("dst-choice");
    if (dst) dst.classList.add("hidden");
  }

  function showEpochError(msg) {
    epochError.textContent = msg;
    epochError.hidden = false;
    epochInput.setAttribute("aria-invalid", "true");
    if (epochDetectedBadge) epochDetectedBadge.classList.add("hidden");
  }
  function showDtError(msg) {
    dtError.textContent = msg;
    dtError.hidden = false;
  }
  function clearErrors() {
    epochError.hidden = true; epochError.textContent = "";
    dtError.hidden = true; dtError.textContent = "";
    epochInput.removeAttribute("aria-invalid");
    if (epochDetectedBadge) epochDetectedBadge.classList.add("hidden");
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".mode-tab[data-mode]").forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.getElementById("epoch-panel").classList.toggle("hidden", mode !== "epoch");
    document.getElementById("datetime-panel").classList.toggle("hidden", mode !== "datetime");
    hideDstChoice();
    state.dstChoice = null;
    clearErrors();
    renderEpochOutput();
  }

  // ---- Paste support for segmented datetime ----
  function handleSegmentedPaste(e) {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text) return;
    const clean = text.trim();
    // Matches YYYY-MM-DDTHH:mm:ss... or DD/MM/YYYY...
    const isoMatch = clean.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(.*)$/);
    if (isoMatch) {
      e.preventDefault();
      const segs = {};
      document.querySelectorAll("#segmented-dt .seg").forEach((s) => (segs[s.dataset.part] = s));
      if (segs.year) segs.year.value = isoMatch[1];
      if (segs.month) segs.month.value = isoMatch[2];
      if (segs.day) segs.day.value = isoMatch[3];
      if (segs.hour) segs.hour.value = isoMatch[4];
      if (segs.minute) segs.minute.value = isoMatch[5];
      if (segs.second) segs.second.value = isoMatch[6] || "00";
      if (segs.ms) segs.ms.value = (isoMatch[7] || "0").slice(0, 3).padEnd(3, "0");

      const rest = (isoMatch[8] || "").trim();
      if (rest === "Z" || rest === "z") {
        if (sourceTzSel) sourceTzSel.value = "UTC";
        state.sourceTz = "UTC";
      }
      doConvert();
      toast("Pasted & converted date/time");
    }
  }

  // ---- Segmented input behavior ----
  function initSegmentedInput() {
    const container = document.getElementById("segmented-dt");
    if (container) container.addEventListener("paste", handleSegmentedPaste);

    const segs = Array.from(document.querySelectorAll("#segmented-dt .seg"));
    const maxLen = { year: 4, month: 2, day: 2, hour: 2, minute: 2, second: 2, ms: 3 };
    segs.forEach((seg, i) => {
      const part = seg.dataset.part;
      seg.addEventListener("input", () => {
        seg.value = seg.value.replace(/\D/g, "").slice(0, maxLen[part]);
        if (seg.value.length >= maxLen[part] && i < segs.length - 1) {
          segs[i + 1].focus();
          segs[i + 1].select();
        }
      });
      seg.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" && (seg.selectionStart === seg.value.length || seg.value === "")) {
          if (i < segs.length - 1) { e.preventDefault(); segs[i + 1].focus(); segs[i + 1].select(); }
        } else if (e.key === "ArrowLeft" && (seg.selectionStart === 0 || seg.value === "")) {
          if (i > 0) { e.preventDefault(); segs[i - 1].focus(); segs[i - 1].select(); }
        } else if (e.key === "Backspace" && seg.value === "" && i > 0) {
          e.preventDefault(); segs[i - 1].focus();
        }
      });
    });
  }

  // ---- Populate tz selects ----
  function populateTzSelect(sel, selected) {
    if (!sel) return;
    sel.innerHTML = "";
    TZ_LIST.forEach((t) => {
      const o = document.createElement("option");
      o.value = t.tz;
      o.textContent = `${t.label} — ${t.tz}`;
      sel.appendChild(o);
    });
    sel.value = selected;
  }

  function doClear() {
    epochInput.value = "";
    document.querySelectorAll("#segmented-dt .seg").forEach((s) => (s.value = ""));
    state.instantMs = null;
    state.dstChoice = null;
    clearErrors();
    hideDstChoice();
    renderTargetRows();
    renderEpochOutput();
  }

  // ---- Load candidate into Time Converter (from OCR or JSON) ----
  function loadCandidateIntoConverter(cand) {
    if (!cand) return;
    if (window.CHRONOLENS && window.CHRONOLENS.setView) {
      window.CHRONOLENS.setView("converter");
    }
    if (cand.type === "epoch-sec" || cand.type === "epoch-str") {
      setMode("epoch");
      epochInput.value = cand.raw || String(Math.floor(cand.ms / 1000));
      doConvert();
    } else if (cand.type === "epoch-ms") {
      setMode("epoch");
      epochInput.value = cand.raw || String(cand.ms);
      doConvert();
    } else if (cand.ms !== null && cand.ms !== undefined) {
      setMode("datetime");
      const p = partsInTz(cand.ms, "UTC");
      const segs = {};
      document.querySelectorAll("#segmented-dt .seg").forEach((s) => (segs[s.dataset.part] = s));
      if (segs.year) segs.year.value = p.year;
      if (segs.month) segs.month.value = p.month;
      if (segs.day) segs.day.value = p.day;
      if (segs.hour) segs.hour.value = p.hour;
      if (segs.minute) segs.minute.value = p.minute;
      if (segs.second) segs.second.value = p.second;
      if (segs.ms) segs.ms.value = p.ms;
      if (sourceTzSel) {
        sourceTzSel.value = "UTC";
        state.sourceTz = "UTC";
      }
      doConvert();
    }
    toast("Loaded timestamp into Time Converter");
  }
  window.CHRONOLENS.loadCandidateIntoConverter = loadCandidateIntoConverter;

  // ---- Init ----
  function init() {
    epochInput = $("epoch-input");
    epochError = $("epoch-error");
    epochDetectedBadge = $("epoch-detected-badge");
    dtError = $("dt-error");
    sourceTzSel = $("source-tz");
    tzList = $("tz-list");
    tzEmpty = $("tz-empty");
    epochOutputCard = $("epoch-output-card");
    epochOutputValue = $("epoch-output-value");
    epochOutputMsValue = $("epoch-output-ms-value");

    if (!epochInput) return;

    populateTzSelect(sourceTzSel, "UTC");
    sourceTzSel.addEventListener("change", () => {
      state.sourceTz = sourceTzSel.value;
      state.dstChoice = null;
      hideDstChoice();
    });

    initSegmentedInput();

    document.querySelectorAll(".mode-tab[data-mode]").forEach((b) => {
      b.addEventListener("click", () => setMode(b.dataset.mode));
    });

    $("convert-btn").addEventListener("click", doConvert);
    $("clear-btn").addEventListener("click", doClear);
    $("epoch-current").addEventListener("click", () => {
      const now = Math.floor(Date.now() / 1000);
      epochInput.value = String(now);
      setMode("epoch");
      doConvert();
    });
    $("add-tz").addEventListener("click", () => {
      const used = new Set(state.rows.map((r) => r.tz));
      const next = TZ_LIST.find((t) => !used.has(t.tz)) || TZ_LIST[0];
      state.rows.push({ tz: next.tz });
      renderTargetRows();
    });

    epochInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doConvert(); }
    });
    epochInput.addEventListener("input", () => {
      // strip anything that isn't an optional leading minus + digits
      epochInput.value = epochInput.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
    });

    const cpSec = $("epoch-output-copy");
    if (cpSec) cpSec.addEventListener("click", () => copyText(epochOutputValue.textContent.replace(/,/g, "")));
    const cpMs = $("epoch-output-ms-copy");
    if (cpMs) cpMs.addEventListener("click", () => copyText(epochOutputMsValue.textContent.replace(/,/g, "")));

    startLiveClock();

    // prefill sample so the prototype looks alive
    epochInput.value = "1735689600";
    doConvert();

    window.CHRONOLENS.converter = { doConvert, setMode, state, populateTzSelect };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
