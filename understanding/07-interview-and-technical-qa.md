# Technical Interview & Team Q&A Guide 🎤

> **Format:** Conversational Question & Answer (FAQ)  
> **Audience:** Developers, Architects, Interviewers, and You (for quick revision).  
> **Purpose:** Clear, direct answers to common questions about why technologies were chosen, what each file does, and how they compare to Java.

---

## ❓ 1. Foundation Questions (HTML, CSS, JavaScript)

### Q1: What is "Vanilla JavaScript" and why didn't we use React, Angular, or Vue?
**Answer:**  
"Vanilla JavaScript" means using the native JavaScript engine built into the browser without any third-party frameworks (like React, Angular, Vue) or build tooling (like Webpack, Vite, Babel).
* **In Java terms:** It is the equivalent of writing clean standard Java SE with the JDK core libraries (`java.time`, `java.util`, `java.net`) instead of pulling in Spring Boot, Lombok, and 40 external Maven dependencies for a simple CLI or desktop utility.
* **Why we chose Vanilla JS:**
  1. **Instant Loading & Zero Build Step:** There is no `npm run build` or compilation step. Any browser opens `index.html` immediately.
  2. **Longevity & Zero Maintenance:** Frameworks deprecate versions every 2 years. Vanilla JavaScript written to ECMAScript standards will still run unchanged 15 years from now.
  3. **Performance:** The entire app download size is under 50 KB.

### Q2: What is the role of HTML, CSS, and JS in this project?
**Answer:**
* **HTML (`index.html`):** The **Skeleton / Structure** (equivalent to JavaFX `.fxml` or Android XML layout). It defines buttons, inputs, tables, and dropdowns.
* **CSS (`styles.css`):** The **Visual Skin / Styling** (equivalent to JavaFX CSS stylesheets). It defines colors, dark/light tones, card drop shadows, badge pills, and responsive mobile layouts.
* **JavaScript (`js/*.js`):** The **Brain / Business Logic** (equivalent to Java Controller and Service classes). It handles button clicks, timezone arithmetic, JSON recursive parsing, and OCR candidate extraction.

---

## ❓ 2. File-by-File Technical Map: "Which File Does What?"

### Q3: Can you walk me through the repository structure and what each file owns?
**Answer:**

| File Path | Core Responsibility | Key Java / Backend Parallel |
| :--- | :--- | :--- |
| **`index.html`** | Single-page UI layout, segmented date inputs, tables, and modal cards. | JavaFX `MainWindow.fxml` |
| **`styles.css`** | Dev-tool theme, typography, badges, flex/grid layouts, responsive breakpoints. | JavaFX `application.css` |
| **`js/app.js`** | Top-level routing between "Time Converter" and "Inspector" tabs. | Main Window Router / View Coordinator |
| **`js/converter.js`** | Epoch parsing (seconds & ms), segmented wall-clock input, `Intl` timezone math, and DST handling. | `TimeService.java` (`java.time.ZonedDateTime`) |
| **`js/json-inspector.js`** | Recursive JSON tree traversal (DFS), timestamp key heuristics, and target-tz table formatting. | `JsonTraversalService.java` (Jackson AST) |
| **`js/screenshot-inspector.js`** | Intercepts <kbd>Ctrl</kbd>+<kbd>V</kbd> image pastes, triggers Tesseract WASM OCR, and regex candidate extraction. | `OcrService.java` (Tesseract JNI bindings) |
| **`serve.js`** | Native, zero-dependency Node.js HTTP server for local testing. | Embedded Netty / HttpServer in Java |
| **`.github/workflows/deploy.yml`** | Automated CI/CD script that publishes to GitHub Pages on every push. | Jenkinsfile / GitLab CI YAML pipeline |

---

## ❓ 3. Core Engine & Timezone Questions

### Q4: Why is timezone conversion tricky, and how did we solve it without a backend server?
**Answer:**  
In Java, we rely on `java.time.ZoneId` backed by the IANA timezone database. In the browser, developers historically used heavy libraries like `Moment.js` or sent requests to a backend server.

We solved this 100% client-side using the native **`Intl.DateTimeFormat`** API:
1. When you enter an Epoch millisecond instant, `Intl` formats it directly into any target zone (e.g. `Asia/Kolkata`, `America/New_York`) with zero server round-trips.
2. For wall-clock inputs without an offset, our custom resolver scans a $\pm 24$-hour candidate window to detect **Daylight Saving Time (DST)** anomalies:
   - **Spring-forward:** Rejects nonexistent gap times (e.g., 2:30 AM during spring forward).
   - **Fall-back:** Detects ambiguous times (occurring twice) and prompts the user to select the 1st or 2nd occurrence.

### Q5: How does the application differentiate 10-digit vs 13-digit Epoch timestamps?
**Answer:**  
* **10-digit numbers ($\sim 10^9$):** Represent **Unix seconds** (used by C, Python, Postgres, Kafka). E.g., `1735689600`.
* **13-digit numbers ($\sim 10^{12}$):** Represent **Java / JavaScript milliseconds** (used by `System.currentTimeMillis()`, Jackson, and JS `Date.now()`). E.g., `1735689600000`.

ChronoLens automatically checks the digit count:
- If 12–14 digits: parses as milliseconds.
- If 10 digits: multiplies by 1000 to obtain milliseconds.
- In both cases, the output card displays **both formats** with independent copy buttons.

---

## ❓ 4. Image OCR & WebAssembly Questions

### Q6: How can OCR read text from an image without sending it to an AWS/cloud server?
**Answer:**  
We use **WebAssembly (WASM)**.
1. The official Google Tesseract OCR engine is written in C++.
2. Through WebAssembly, that C++ code was compiled into binary instructions that run directly inside the browser's execution engine.
3. The image is read into browser memory via `URL.createObjectURL()`. The pixels are processed by Tesseract's WASM engine inside a background **Web Worker** thread.
4. **Result:** Production database logs and private customer screenshots never leave the developer's laptop.

### Q7: What is `eng.traineddata.gz` and why did the status show "0%" on the first run?
**Answer:**  
* `eng.traineddata.gz` (~4 MB) is the neural-network dictionary that allows Tesseract to recognize English glyphs and numbers.
* On the **first run**, the browser downloads this file from a CDN (`jsdelivr.net`).
* Immediately upon download, it is saved into **IndexedDB** (the browser's local embedded disk database).
* On all subsequent OCR runs, it is retrieved from IndexedDB with **zero network traffic**, allowing OCR to run completely offline.

---

## ❓ 5. JSON Inspector Questions

### Q8: How does the JSON Inspector find timestamps in deeply nested JSON?
**Answer:**  
It uses a **Depth-First Search (DFS)** recursive algorithm (`scan(obj, path)`), exactly like traversing a `JsonNode` tree in Jackson:
1. If the node is an array, it recurses into each index `[0]`, `[1]`.
2. If the node is an object, it evaluates each key-value pair.
3. It checks key names against heuristic timestamp clues (`startTime`, `created_at`, `timestamp`, `epoch`).
4. It tests string and numeric values against regex patterns and plausible epoch bounds (year 1900 to 2200).
5. For each match, it constructs the full JSONPath (`$.metadata.users[0].created_at`) and provides a **`⚡ Convert`** button to pipe the value into the Time Converter.

---

## ❓ 6. Deployment & Cost Questions

### Q9: Does hosting on GitHub Pages cost anything, and will it expire after a trial period?
**Answer:**  
**It is 100% free forever with no expiration date.**
* GitHub Pages is free for all public repositories.
* Because ChronoLens is purely client-side static code, GitHub serves it via global Edge CDNs.
* Bandwidth quota is **100 GB per month** (sufficient for over 2,000,000 page views monthly).
* Operating cost: **$0.00**.
