# Tutorial Chapter 4: Client-Side OCR, WebAssembly & IndexedDB 🧠

> **Target Audience:** Engineers curious about client-side machine learning, privacy, and WebAssembly.  
> **Goal:** Understand how ChronoLens extracts text from images without uploading a single byte to an external server.

---

## 1. The Architectural Philosophy: Why Client-Side?

Most enterprise developer tools use a traditional client-server architecture:
```
User pastes screenshot ➔ Upload HTTP POST (Multipart) ➔ Cloud Server / AWS S3 ➔ Python/OCR Worker ➔ JSON Response
```

### Why this is problematic for developers:
1. **Security & Compliance:** Developers frequently paste screenshots of production databases, customer logs, internal IP addresses, or auth headers. Uploading these to third-party web servers violates enterprise confidentiality and GDPR/SOC2 compliance.
2. **Infrastructure Costs:** Running OCR servers (EC2 instances with GPU/CPU) costs real money every month.
3. **Latency:** Network round-trips add latency.

### The ChronoLens Architecture:
```
Clipboard Paste (Ctrl+V) ➔ In-Memory Blob ➔ Background Web Worker (WASM) ➔ Tesseract C++ Engine ➔ Regex Extraction
```
**Zero bytes are sent over the network.** The image exists only in local device RAM.

---

## 2. What is WebAssembly (WASM)?

To understand `Tesseract.js`, you must understand **WebAssembly (WASM)**.

Traditionally, web browsers could only execute JavaScript. While modern JavaScript engines (like Google Chrome's V8) are fast, they are dynamically typed and not optimized for heavy image processing or matrix arithmetic.

* **WebAssembly** is a standard binary format supported by Chrome, Edge, Firefox, and Safari.
* Developers can take battle-tested **C and C++ codebases** (like Google's open-source Tesseract OCR engine) and compile them with `Emscripten` into a `.wasm` binary.
* The browser runs this `.wasm` binary inside a sandboxed virtual machine at near-native C++ execution speed!

---

## 3. Web Workers: True Multithreading in the Browser

Because JavaScript is single-threaded, if you tried to run intensive OCR image processing on the main thread, the entire browser tab would **freeze**—buttons would not click, animations would halt, and the browser would show a *"Page Unresponsive"* dialog.

ChronoLens avoids this by using a **Web Worker**:
- A Web Worker is an isolated background operating system thread running inside the browser.
- The main UI thread passes the image pixels to the worker via message passing.
- The worker runs Tesseract WASM in the background and reports progress updates (`m.progress * 100`) back to the main thread:

```javascript
// ChronoLens screenshot-inspector.js:
Tesseract.recognize(currentFile, "eng", {
  logger: (m) => {
    if (m && m.status && typeof m.progress === "number") {
      setStatus(`OCR: ${m.status} (${Math.round(m.progress * 100)}%)`);
    }
  },
})
.then(({ data }) => {
  const text = data.text; // Extracted plain text!
  const candidates = extractCandidates(text, sourceTz);
  renderCandidates(candidates);
});
```

---

## 4. The `eng.traineddata.gz` File & IndexedDB Caching

When you first open ChronoLens and paste an image, you may observe the status message:
```
OCR: loading language traineddata (0%... 100%)
```

### What is `eng.traineddata.gz`?
OCR engines require a pre-trained neural network / statistical dictionary that tells the engine how English letters (`A-Z, 0-9, symbols`) look under various fonts, kerning, and rotations. This file is approximately **4 Megabytes** compressed.

### How Caching Works with IndexedDB:
1. **First Execution:**
   - Tesseract checks the local browser storage.
   - Finding nothing, it downloads `eng.traineddata.gz` from the fast global CDN (`jsdelivr.net`).
2. **Storage in IndexedDB:**
   - IndexedDB is an embedded NoSQL database built into your browser (similar to SQLite / RocksDB on a mobile phone or local disk).
   - Tesseract saves the 4 MB trained data binary directly into the browser's IndexedDB.
3. **Subsequent Executions:**
   - The browser detects that `eng.traineddata.gz` already exists locally in IndexedDB.
   - It reads directly from your hard drive with **zero network requests**! Even if you are completely offline, OCR will execute seamlessly.

---

## 5. Candidate Extraction & Precision Handling

OCR output from messy database screenshots contains noise, column headers, and IDs. 

ChronoLens applies targeted regex filters (`extractCandidates` in `screenshot-inspector.js`):

```javascript
// 1. ISO Timestamps with arbitrary subsecond precision (ms / microseconds) and offsets:
const ISO_RE = /\b\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?\b/gi;

// 2. Plausible 10-digit Unix Epoch Seconds (years 2001 to 2090+):
const EPOCH10_RE = /\b[12]\d{9}\b/g;

// 3. Plausible 13-digit Java/JS Epoch Milliseconds:
const EPOCH13_RE = /\b[12]\d{12}\b/g;

// 4. Slash Dates:
const SLASH_RE = /\b\d{1,2}\/\d{1,2}\/\d{4}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?\b/gi;
```

Each extracted candidate is converted to an absolute instant and presented with the **`⚡ Convert`** button, allowing developers to load any detected value into the main converter with one click.
