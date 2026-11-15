/* ===========================================================
   ChronoLens — screenshot-inspector.js (v2)
   - Image input: Ctrl+V paste (primary), drag & drop, browse
   - AUTO-OCR on paste/drop/browse (no separate preview step)
   - Source timezone (for ISO strings without offset)
   - Target timezone conversion of detected timestamps
   - Type badges; epoch numbers flagged "epoch?" (could be ordinary numbers)
   - Small thumbnail preview; raw OCR under <details>
   - All processing local; image never uploaded.
   =========================================================== */

(function () {
  "use strict";

  let dropzone, fileInput, browseBtn, previewWrap, previewImg,
      runOcrBtn, removeImgBtn, ocrStatus, ocrResultsWrap, ocrResultsBody,
      rawOcrWrap, rawOcrPre, sourceTzSel, targetTzSel;

  let currentFile = null;
  let currentObjectUrl = null;
  let ocrBusy = false;
  let lastResults = [];     // last extracted candidates (so tz changes re-render)
  let lastOcrText = "";

  // ---- Candidate extraction ----
  // We match, in order:
  //  1. ISO-like strings:        YYYY-MM-DDTHH:mm:ss(.SSS)?(Z|[+-]HH:MM)?   OR with space sep
  //  2. 10-digit epoch seconds (treated as possibly-epoch; uncertain)
  //  3. 13-digit epoch ms (treated as possibly-epoch; uncertain)
  //  4. Slash dates: DD/MM/YYYY or YYYY/MM/DD [ HH:mm:ss(.SSS)?]
  const ISO_RE = /\b\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?\b/gi;
  const EPOCH10_RE = /\b[12]\d{9}\b/g;
  const EPOCH13_RE = /\b[12]\d{12}\b/g;
  const SLASH_RE = /\b\d{1,2}\/\d{1,2}\/\d{4}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?\b/gi;
  const YMD_SLASH_RE = /\b\d{4}\/\d{2}\/\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?\b/gi;

  function extractCandidates(text, sourceTz) {
    const found = new Map(); // key raw -> candidate
    function add(raw, ms, type, certain) {
      if (found.has(raw)) return;
      found.set(raw, { raw, ms, type, certain });
    }
    let m;
    // ISO
    ISO_RE.lastIndex = 0;
    while ((m = ISO_RE.exec(text)) !== null) {
      const raw = m[0];
      const interp = interpretIso(raw, sourceTz);
      if (interp.ok) {
        add(raw, interp.ms, "iso", true);
      } else {
        // ISO-shaped but failed calendar validation (likely OCR misread of a digit).
        // Keep it as an uncertain candidate so the user can review, with ms=null.
        add(raw, null, "iso?", false);
      }
    }
    // slash dates DD/MM/YYYY
    SLASH_RE.lastIndex = 0;
    while ((m = SLASH_RE.exec(text)) !== null) {
      const raw = m[0];
      const interp = interpretSlash(raw, sourceTz);
      if (interp.ok) add(raw, interp.ms, "iso", true);
      else add(raw, null, "iso?", false);
    }
    // slash dates YYYY/MM/DD
    YMD_SLASH_RE.lastIndex = 0;
    while ((m = YMD_SLASH_RE.exec(text)) !== null) {
      const raw = m[0];
      const interp = interpretIso(raw.replace(/\//g, "-"), sourceTz);
      if (interp.ok) add(raw, interp.ms, "iso", true);
      else add(raw, null, "iso?", false);
    }
    // 10-digit epoch seconds (uncertain — could be an ordinary number)
    EPOCH10_RE.lastIndex = 0;
    while ((m = EPOCH10_RE.exec(text)) !== null) {
      const raw = m[0];
      const ms = parseInt(raw, 10) * 1000;
      if (inPlausibleRange(ms)) add(raw, ms, "epoch-sec", false);
    }
    // 13-digit epoch ms
    EPOCH13_RE.lastIndex = 0;
    while ((m = EPOCH13_RE.exec(text)) !== null) {
      const raw = m[0];
      const ms = parseInt(raw, 10);
      if (inPlausibleRange(ms)) add(raw, ms, "epoch-ms", false);
    }

    return Array.from(found.values());
  }

  function inPlausibleRange(ms) {
    return ms >= -2208988800000 && ms <= 7258204800000;
  }

  function interpretIso(raw, sourceTz) {
    const s = raw.replace(" ", "T");
    const hasOffset = /[Zz]|[+-]\d{2}:?\d{2}$/.test(s);
    if (hasOffset) {
      const ms = Date.parse(s);
      if (!isNaN(ms)) return { ok: true, ms };
      return { ok: false };
    }
    // no offset -> use sourceTz via json-inspector's wallToMs helper
    const helper = window.CHRONOLENS.jsonInspector && window.CHRONOLENS.jsonInspector.wallToMs;
    const ms = helper ? helper(s, sourceTz || "UTC") : null;
    if (ms !== null) return { ok: true, ms };
    return { ok: false };
  }

  function interpretSlash(raw, sourceTz) {
    // DD/MM/YYYY -> ISO
    const mm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?$/);
    if (!mm) return { ok: false };
    const dd = mm[1].padStart(2, "0"), mo = mm[2].padStart(2, "0"), yy = mm[3];
    const HH = mm[4] || "00", Mi = mm[5] || "00", Ss = mm[6] || "00";
    const ms3 = (mm[7] || "0").slice(0, 3).padEnd(3, "0");
    const iso = `${yy}-${mo}-${dd}T${HH}:${Mi}:${Ss}.${ms3}`;
    return interpretIso(iso, sourceTz);
  }

  // ---- Image handling ----
  function setImage(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      setStatus("That file is not an image.", true);
      return;
    }
    removeImage(false);
    currentFile = file;
    currentObjectUrl = URL.createObjectURL(file);
    previewImg.src = currentObjectUrl;
    previewWrap.classList.remove("hidden");
    ocrResultsWrap.classList.add("hidden");
    rawOcrWrap.classList.add("hidden");
    ocrResultsBody.innerHTML = "";
    lastResults = [];
    lastOcrText = "";
    setStatus("Image loaded. Running OCR automatically…");
    // auto-OCR
    runOCR();
  }

  function removeImage(resetStatus) {
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    currentFile = null;
    if (previewImg) previewImg.removeAttribute("src");
    if (previewWrap) previewWrap.classList.add("hidden");
    if (ocrResultsWrap) ocrResultsWrap.classList.add("hidden");
    if (rawOcrWrap) rawOcrWrap.classList.add("hidden");
    if (ocrResultsBody) ocrResultsBody.innerHTML = "";
    if (rawOcrPre) rawOcrPre.textContent = "";
    lastResults = [];
    lastOcrText = "";
    if (resetStatus !== false) setStatus("");
  }

  function setStatus(msg, isErr) {
    ocrStatus.textContent = msg || "";
    ocrStatus.style.color = isErr ? "var(--danger)" : "var(--text-soft)";
  }

  // ---- OCR ----
  function runOCR() {
    if (ocrBusy) return;
    if (!currentFile) { setStatus("Load an image first.", true); return; }
    if (typeof Tesseract === "undefined") {
      setStatus("Tesseract.js library not loaded yet (check network/CDN). Try again in a moment.", true);
      return;
    }
    ocrBusy = true;
    runOcrBtn.disabled = true;
    setStatus("Running OCR… first run downloads language data (a few seconds).");

    Tesseract.recognize(currentFile, "eng", {
      logger: (m) => {
        if (m && m.status && typeof m.progress === "number") {
          setStatus(`OCR: ${m.status} (${Math.round(m.progress * 100)}%)`);
        }
      },
    })
      .then(({ data }) => {
        const text = (data && data.text) ? data.text : "";
        lastOcrText = text;
        if (rawOcrPre) rawOcrPre.textContent = text || "(no text recognized)";
        if (rawOcrWrap) rawOcrWrap.classList.remove("hidden");
        const sourceTz = sourceTzSel ? sourceTzSel.value : "UTC";
        const cands = extractCandidates(text, sourceTz);
        lastResults = cands;
        renderCandidates(cands);
        if (cands.length) {
          setStatus(`Found ${cands.length} candidate(s). Review carefully — OCR can misread 0/O, 1/I.`);
        } else {
          setStatus("OCR finished. No timestamp-like values detected. See raw text below.");
        }
      })
      .catch((err) => {
        setStatus("OCR failed: " + (err && err.message ? err.message : String(err)), true);
      })
      .finally(() => {
        ocrBusy = false;
        if (runOcrBtn) runOcrBtn.disabled = false;
      });
  }

  function renderCandidates(cands) {
    if (!ocrResultsBody) return;
    ocrResultsBody.innerHTML = "";
    if (ocrResultsWrap) ocrResultsWrap.classList.remove("hidden");
    if (!cands.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "empty-state";
      td.textContent = "No timestamp candidates detected.";
      tr.appendChild(td);
      ocrResultsBody.appendChild(tr);
      return;
    }
    const targetTz = targetTzSel ? targetTzSel.value : "UTC";
    const fmtIso = window.CHRONOLENS.fmtIso;
    const fmtIsoUtc = window.CHRONOLENS.fmtIsoUtc;
    cands.forEach((c) => {
      const tr = document.createElement("tr");

      const tdRaw = document.createElement("td");
      tdRaw.className = "value";
      tdRaw.textContent = c.raw;

      const tdType = document.createElement("td");
      tdType.className = "col-type";
      if (c.type === "iso") tdType.innerHTML = `<span class="badge badge-iso">ISO</span>`;
      else if (c.type === "iso?") tdType.innerHTML = `<span class="badge badge-warn">ISO?</span>`;
      else if (c.type === "epoch-sec") tdType.innerHTML = `<span class="badge badge-warn">epoch?</span>`;
      else if (c.type === "epoch-ms") tdType.innerHTML = `<span class="badge badge-warn">epoch·ms?</span>`;

      const tdInt = document.createElement("td");
      tdInt.className = "interpreted";
      tdInt.textContent = c.ms === null ? "— (calendar invalid; check OCR)" : fmtIsoUtc(c.ms);

      const tdTz = document.createElement("td");
      tdTz.className = "in-tz";
      tdTz.textContent = c.ms === null ? "—" : fmtIso(c.ms, targetTz);

      const tdCp = document.createElement("td");
      tdCp.className = "col-copy";
      if (c.ms === null) {
        tdCp.textContent = "";
      } else {
        const actionWrap = document.createElement("div");
        actionWrap.className = "action-btns";

        const bConv = document.createElement("button");
        bConv.className = "btn-icon btn-accent";
        bConv.type = "button";
        bConv.textContent = "⚡ Convert";
        bConv.title = "Load this timestamp into Time Converter";
        bConv.addEventListener("click", () => {
          if (window.CHRONOLENS && window.CHRONOLENS.loadCandidateIntoConverter) {
            window.CHRONOLENS.loadCandidateIntoConverter(c);
          }
        });

        const b = document.createElement("button");
        b.className = "btn-icon";
        b.type = "button";
        b.textContent = "⧉ Copy";
        b.title = "Copy target-tz ISO value";
        b.addEventListener("click", () => window.CHRONOLENS.copyText(fmtIso(c.ms, targetTz)));

        actionWrap.appendChild(bConv);
        actionWrap.appendChild(b);
        tdCp.appendChild(actionWrap);
      }

      tr.appendChild(tdRaw);
      tr.appendChild(tdType);
      tr.appendChild(tdInt);
      tr.appendChild(tdTz);
      tr.appendChild(tdCp);
      ocrResultsBody.appendChild(tr);
    });
  }

  // Re-render last results when tz changes (no re-OCR needed)
  function reRenderFromLast() {
    if (!lastResults.length) return;
    renderCandidates(lastResults);
  }

  // ---- Init / wiring ----
  function init() {
    dropzone = document.getElementById("dropzone");
    fileInput = document.getElementById("file-input");
    browseBtn = document.getElementById("browse-btn");
    previewWrap = document.getElementById("preview-wrap");
    previewImg = document.getElementById("preview-img");
    runOcrBtn = document.getElementById("run-ocr");
    removeImgBtn = document.getElementById("remove-img");
    ocrStatus = document.getElementById("ocr-status");
    ocrResultsWrap = document.getElementById("ocr-results-wrap");
    ocrResultsBody = document.querySelector("#ocr-results tbody");
    rawOcrWrap = document.getElementById("raw-ocr-wrap");
    rawOcrPre = document.getElementById("raw-ocr");
    sourceTzSel = document.getElementById("ocr-source-tz");
    targetTzSel = document.getElementById("ocr-target-tz");

    if (!dropzone) return;

    // populate tz selects
    if (window.CHRONOLENS.converter && window.CHRONOLENS.converter.populateTzSelect) {
      window.CHRONOLENS.converter.populateTzSelect(sourceTzSel, "UTC");
      window.CHRONOLENS.converter.populateTzSelect(targetTzSel, "Asia/Kolkata");
    }
    if (targetTzSel) targetTzSel.addEventListener("change", reRenderFromLast);
    if (sourceTzSel) sourceTzSel.addEventListener("change", () => {
      // re-extract using new source tz
      if (lastOcrText) {
        const cands = extractCandidates(lastOcrText, sourceTzSel.value);
        lastResults = cands;
        renderCandidates(cands);
      }
    });

    browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files[0]) setImage(fileInput.files[0]);
      fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.add("dragover");
      }));
    ["dragleave", "drop"].forEach((ev) =>
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.remove("dragover");
      }));
    dropzone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) setImage(dt.files[0]);
    });

    runOcrBtn.addEventListener("click", runOCR);
    removeImgBtn.addEventListener("click", () => removeImage(true));

    // Clipboard paste — only when Screenshot tab is active
    document.addEventListener("paste", (e) => {
      if (!isScreenshotActive()) return;
      const cd = e.clipboardData;
      if (!cd) return;
      const target = e.target;
      if (target && target.tagName === "TEXTAREA") return;
      if (target && target.tagName === "INPUT") return;
      const items = cd.items || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) { e.preventDefault(); setImage(file); return; }
        }
      }
    });

    window.CHRONOLENS.screenshotInspector = { setImage, removeImage, runOCR, extractCandidates };
  }

  function isScreenshotActive() {
    const viewInspector = document.getElementById("view-inspector");
    if (!viewInspector || !viewInspector.classList.contains("active")) return false;
    const tab = document.querySelector('.mode-tab[data-inspector="screenshot"]');
    return !!(tab && tab.classList.contains("active"));
  }
  window.CHRONOLENS.isScreenshotActive = isScreenshotActive;

  document.addEventListener("DOMContentLoaded", init);
})();
