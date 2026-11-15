# Tutorial Chapter 2: The Document Object Model (DOM) & UI State Management 🖥️

> **Target Audience:** Java engineers familiar with Swing, JavaFX, or Android layouts.  
> **Goal:** Master how the browser renders elements, handles user interaction, and updates the screen without full-page reloads.

---

## 1. What is the DOM? (JavaFX Comparison)

In JavaFX, your interface is defined in an `.fxml` file or composed of `Node` objects arranged in a hierarchical Scene Graph:
```java
// JavaFX:
VBox root = new VBox();
Label label = new Label("Epoch timestamp");
TextField input = new TextField();
root.getChildren().addAll(label, input);
```

In the browser:
- The browser parses `index.html` into a tree of C++ objects called the **Document Object Model (DOM)**.
- JavaScript can inspect, create, remove, or modify these nodes live in memory:

```javascript
// ChronoLens converter.js:
const el = document.createElement("div");
el.className = "tz-row";

const label = document.createElement("span");
label.className = "tz-out-label";
label.textContent = "Format A · YYYY-MM-DDTHH:mm:ss.SSS";

el.appendChild(label);
tzList.appendChild(el);
```

---

## 2. Selecting Elements from the Page

In JavaFX, you might look up an element by its `fx:id` using `@FXML private TextField epochInput;`.

In JavaScript, we query the DOM using CSS selectors or IDs:

```javascript
// 1. By ID (Fastest, like finding a unique component)
const epochInput = document.getElementById("epoch-input");

// 2. By CSS Query Selector (Single match)
const activeTab = document.querySelector(".nav-tab.active");

// 3. By CSS Query Selector All (Returns a NodeList / List<Element>)
const segInputs = document.querySelectorAll("#segmented-dt .seg");
segInputs.forEach(seg => {
  console.log(seg.dataset.part); // "year", "month", etc.
});
```

---

## 3. Event Listeners: The Java `ActionListener` Equivalent

In Java Swing or JavaFX:
```java
convertBtn.setOnAction(event -> doConvert());
```

In JavaScript:
```javascript
const convertBtn = document.getElementById("convert-btn");
convertBtn.addEventListener("click", (event) => {
  event.preventDefault(); // Prevents default browser form submission
  doConvert();
});
```

### Event Delegation & Clipboard Paste Interception
In `screenshot-inspector.js`, we intercept global image pastes:
```javascript
document.addEventListener("paste", (e) => {
  // Only handle paste if the Screenshot tab is active
  if (!isScreenshotActive()) return;

  const clipboardData = e.clipboardData;
  if (!clipboardData) return;

  const items = clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.startsWith("image/")) {
      const file = items[i].getAsFile(); // Raw binary image blob
      e.preventDefault();                // Stop browser from pasting text
      setImage(file);                    // Run OCR automatically!
      return;
    }
  }
});
```

---

## 4. Segmented Wall-Clock Input: Auto-Advance & Arrow Navigation

One of the polished UX features in ChronoLens is the segmented date/time input box (`YYYY-MM-DDTHH:mm:ss.SSS`).

### How It Works Under the Hood (`converter.js`):
1. **Digit Limitation & Auto-Advance:**
   When you type `2`, `0`, `2`, `5` into the 4-character `YYYY` block, the `input` event triggers:
   ```javascript
   seg.addEventListener("input", () => {
     // Strip non-numeric characters using regex:
     seg.value = seg.value.replace(/\D/g, "").slice(0, maxLen[part]);
     // Once full, automatically move cursor focus to the next block (Month):
     if (seg.value.length >= maxLen[part] && i < segs.length - 1) {
       segs[i + 1].focus();
       segs[i + 1].select();
     }
   });
   ```

2. **Cross-Field Arrow & Backspace Navigation:**
   Listening to the `keydown` event allows smooth keyboard navigation across blocks:
   - When cursor reaches the right boundary $\rightarrow$ jumps focus to the next block.
   - When pressing `Backspace` on an empty block $\rightarrow$ jumps back to the previous block.

3. **Direct Paste Parsing:**
   If a user pastes a full ISO string (e.g., `2025-01-01T14:30:00Z`), the paste event intercepts the string, extracts each token using regex, populates the respective blocks, and triggers `doConvert()`.

---

## 5. UI State Management Without Heavy Frameworks

Modern web apps often pull in React, Angular, or Vue (which require Node.js, Webpack, and 500 MB of `node_modules`).

ChronoLens uses a lightweight **Plain Old JavaScript Object (POJO)** for state:

```javascript
// The central application state:
const state = {
  mode: "epoch",                     // "epoch" or "datetime"
  instantMs: null,                   // UTC milliseconds instant
  sourceTz: "UTC",                   // Timezone of the wall-clock input
  dstChoice: null,                   // "first" or "second" during fall-back
  rows: [{ tz: "UTC" }, { tz: "Asia/Kolkata" }], // Target rows to display
};
```

Whenever the user changes an input or adds a timezone row, the flow is predictable and unidirectional:
```
User Action (Click / Type) ➔ Update `state` ➔ Call `renderTargetRows()`
```
Because the DOM updates are lightweight, re-rendering the output rows takes less than **1 millisecond**.
