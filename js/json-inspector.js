/* ===========================================================
   ChronoLens — json-inspector.js (v2)
   - Recursive JSON scan, timestamp-like key/value detection
   - Distinguishes ISO-string vs epoch-number vs epoch-string
   - Source timezone (for ISO strings without offset)
   - Target timezone → "In target tz" column
   - Type badges + copy buttons
   =========================================================== */

(function () {
  "use strict";

  const TIMESTAMP_KEYS = (window.CHRONOLENS && window.CHRONOLENS.TIMESTAMP_KEYS) || new Set([
    "timestamp", "epoch", "starttime", "endtime",
    "createdat", "updatedat", "effectivedate", "lastrefreshedat",
  ]);

  const ISO_RE = /^\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i;
  const EPOCH_10_RE = /^\d{10}$/;
  const EPOCH_13_RE = /^\d{13}$/;

  const SAMPLE = `{
  "productId": "SKU-1001",
  "unit": "cases",
  "quantity": 50,
  "startTime": 1735689600,
  "endTime": "2025-01-01T13:45:00Z",
  "effectiveDate": "2025-01-01 09:00:00",
  "metadata": {
    "lastRefreshedAt": "2025-01-02T08:30:15.123Z"
  }
}`;

  // ---- Interpretation ----
  // Returns { ok, ms, type } where type is "iso" | "epoch-sec" | "epoch-ms" | "epoch-str"
  // `keyHint` = true if the key name suggests a timestamp.
  // `sourceTz` = IANA tz used to interpret ISO strings that have NO offset/Z.
  function interpret(value, keyHint, sourceTz) {
    if (typeof value === "number") {
      let ms, type;
      if (Number.isInteger(value) && EPOCH_10_RE.test(String(value))) { ms = value * 1000; type = "epoch-sec"; }
      else if (Number.isInteger(value) && EPOCH_13_RE.test(String(value))) { ms = value; type = "epoch-ms"; }
      else return { ok: false };
      if (!inPlausibleRange(ms)) return { ok: false };
      return { ok: true, ms, type };
    }
    if (typeof value === "string") {
      const s = value.trim();
      if (!s) return { ok: false };
      // numeric string -> only if key hints at a timestamp
      if (EPOCH_10_RE.test(s) && keyHint) {
        const ms = parseInt(s, 10) * 1000;
        if (!inPlausibleRange(ms)) return { ok: false };
        return { ok: true, ms, type: "epoch-str" };
      }
      if (EPOCH_13_RE.test(s) && keyHint) {
        const ms = parseInt(s, 10);
        if (!inPlausibleRange(ms)) return { ok: false };
        return { ok: true, ms, type: "epoch-ms" };
      }
      if (ISO_RE.test(s)) {
        const iso = s.replace(" ", "T");
        const hasOffset = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso);
        if (hasOffset) {
          const ms = Date.parse(iso);
          if (!isNaN(ms)) return { ok: true, ms, type: "iso" };
        } else {
          // no offset -> interpret with sourceTz
          const ms = wallToMs(iso, sourceTz || "UTC");
          if (ms !== null) return { ok: true, ms, type: "iso" };
        }
      }
    }
    return { ok: false };
  }

  function inPlausibleRange(ms) {
    // 1900-01-01 .. 2200-01-01
    return ms >= -2208988800000 && ms <= 7258204800000;
  }

  // Convert "YYYY-MM-DDTHH:mm:ss(.SSS)" (no offset) interpreted in sourceTz → ms.
  // Uses the shared wall-clock resolver; returns null on failure (spring-forward gap).
  function wallToMs(iso, tz) {
    const m = iso.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
    if (!m) return null;
    const v = {
      year: m[1], month: m[2], day: m[3],
      hour: m[4], minute: m[5], second: m[6],
      ms: (m[7] || "0").slice(0, 3).padEnd(3, "0"),
    };
    // Inline resolver (same algorithm as converter.js)
    const y = parseInt(v.year, 10), mo = parseInt(v.month, 10), d = parseInt(v.day, 10);
    const h = parseInt(v.hour, 10), mi = parseInt(v.minute, 10), s = parseInt(v.second, 10);
    const ms = parseInt(v.ms, 10);
    // basic validation
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    let maxDay = dim[mo - 1];
    if (mo === 2 && leap) maxDay = 29;
    if (d > maxDay) return null;
    if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return null;

    if (tz === "UTC") return Date.UTC(y, mo - 1, d, h, mi, s, ms);

    const partsInTz = window.CHRONOLENS.partsInTz;
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    const want = { year: y, month: pad(mo), day: pad(d), hour: pad(h), minute: pad(mi), second: pad(s) };
    const naive = Date.UTC(y, mo - 1, d, h, mi, s, ms);
    const dayMs = 86400000;
    for (let t = naive - dayMs; t <= naive + dayMs; t += 60000) {
      const p = partsInTz(t, tz);
      if (p.year === String(want.year) && p.month === want.month &&
          p.day === want.day && p.hour === want.hour &&
          p.minute === want.minute && p.second === want.second) {
        if (Math.floor(t % 1000) === ms) return t;
      }
    }
    return null; // nonexistent (spring-forward gap)
  }

  // ---- Recursive traversal ----
  function scan(obj, path, out, sourceTz) {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => scan(v, `${path}[${i}]`, out, sourceTz));
      return;
    }
    if (typeof obj === "object") {
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        const next = path ? `${path}.${k}` : `$.${k}`;
        const keyHint = TIMESTAMP_KEYS.has(k.toLowerCase());
        const interp = interpret(v, keyHint, sourceTz);
        if (interp.ok) {
          out.push({ path: next, value: v, ms: interp.ms, type: interp.type });
        }
        if (typeof v === "object" && v !== null) scan(v, next, out, sourceTz);
      }
      return;
    }
    const interp = interpret(obj, false, sourceTz);
    if (interp.ok) out.push({ path: path || "$", value: obj, ms: interp.ms, type: interp.type });
  }

  // ---- DOM ----
  let jsonInput, jsonError, jsonResultsBody, jsonEmpty, sourceTzSel, targetTzSel;

  function typeBadge(type) {
    if (type === "iso") return `<span class="badge badge-iso">ISO</span>`;
    if (type === "epoch-sec") return `<span class="badge badge-epoch">epoch·s</span>`;
    if (type === "epoch-ms") return `<span class="badge badge-epoch">epoch·ms</span>`;
    if (type === "epoch-str") return `<span class="badge badge-epoch">epoch·str</span>`;
    return "";
  }

  function doScan() {
    if (!jsonInput) return;
    jsonError.hidden = true; jsonError.textContent = "";
    const raw = jsonInput.value.trim();
    if (!raw) { showJsonError("Paste some JSON first (or click Load sample)."); return; }
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      showJsonError("Invalid JSON: " + e.message);
      return;
    }
    const sourceTz = sourceTzSel ? sourceTzSel.value : "UTC";
    const out = [];
    scan(obj, "$", out, sourceTz);
    renderResults(out);
  }

  function renderResults(rows) {
    jsonResultsBody.innerHTML = "";
    jsonEmpty.style.display = rows.length ? "none" : "block";
    if (!rows.length) {
      jsonEmpty.textContent = "No timestamp-like fields detected in this JSON.";
      return;
    }
    const targetTz = targetTzSel ? targetTzSel.value : "UTC";
    const fmtIso = window.CHRONOLENS.fmtIso;
    const fmtIsoUtc = window.CHRONOLENS.fmtIsoUtc;
    rows.forEach((r) => {
      const tr = document.createElement("tr");

      const tdPath = document.createElement("td");
      tdPath.className = "path";
      tdPath.textContent = r.path;

      const tdVal = document.createElement("td");
      tdVal.className = "value";
      tdVal.textContent = formatValue(r.value);

      const tdType = document.createElement("td");
      tdType.className = "col-type";
      tdType.innerHTML = typeBadge(r.type);

      const tdInt = document.createElement("td");
      tdInt.className = "interpreted";
      tdInt.textContent = fmtIsoUtc(r.ms);

      const tdTz = document.createElement("td");
      tdTz.className = "in-tz";
      tdTz.textContent = fmtIso(r.ms, targetTz);

      const tdCp = document.createElement("td");
      tdCp.className = "col-copy";
      const actionWrap = document.createElement("div");
      actionWrap.className = "action-btns";

      const bConv = document.createElement("button");
      bConv.className = "btn-icon btn-accent";
      bConv.type = "button";
      bConv.textContent = "⚡ Convert";
      bConv.title = "Load this timestamp into Time Converter";
      bConv.addEventListener("click", () => {
        if (window.CHRONOLENS && window.CHRONOLENS.loadCandidateIntoConverter) {
          window.CHRONOLENS.loadCandidateIntoConverter(r);
        }
      });

      const b = document.createElement("button");
      b.className = "btn-icon";
      b.type = "button";
      b.textContent = "⧉ Copy";
      b.title = "Copy target-tz ISO value";
      b.addEventListener("click", () => window.CHRONOLENS.copyText(fmtIso(r.ms, targetTz)));

      actionWrap.appendChild(bConv);
      actionWrap.appendChild(b);
      tdCp.appendChild(actionWrap);

      tr.appendChild(tdPath);
      tr.appendChild(tdVal);
      tr.appendChild(tdType);
      tr.appendChild(tdInt);
      tr.appendChild(tdTz);
      tr.appendChild(tdCp);
      jsonResultsBody.appendChild(tr);
    });
  }

  function formatValue(v) {
    if (typeof v === "string") return `"${v}"`;
    return String(v);
  }
  function showJsonError(msg) { jsonError.textContent = msg; jsonError.hidden = false; }

  function doClear() {
    jsonInput.value = "";
    jsonResultsBody.innerHTML = "";
    jsonEmpty.style.display = "block";
    jsonEmpty.textContent = "No JSON scanned yet.";
    jsonError.hidden = true;
  }
  function loadSample() { jsonInput.value = SAMPLE; doScan(); }

  function init() {
    jsonInput = document.getElementById("json-input");
    jsonError = document.getElementById("json-error");
    jsonResultsBody = document.querySelector("#json-results tbody");
    jsonEmpty = document.getElementById("json-empty");
    sourceTzSel = document.getElementById("json-source-tz");
    targetTzSel = document.getElementById("json-target-tz");
    if (!jsonInput) return;

    if (window.CHRONOLENS.converter && window.CHRONOLENS.converter.populateTzSelect) {
      window.CHRONOLENS.converter.populateTzSelect(sourceTzSel, "UTC");
      window.CHRONOLENS.converter.populateTzSelect(targetTzSel, "Asia/Kolkata");
    }
    // re-scan on tz change
    if (sourceTzSel) sourceTzSel.addEventListener("change", doScan);
    if (targetTzSel) targetTzSel.addEventListener("change", doScan);

    document.getElementById("scan-json").addEventListener("click", doScan);
    document.getElementById("clear-json").addEventListener("click", doClear);
    document.getElementById("load-sample").addEventListener("click", loadSample);

    window.CHRONOLENS.jsonInspector = { doScan, interpret, wallToMs };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
