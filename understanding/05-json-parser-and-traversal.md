# Tutorial Chapter 5: Recursive AST JSON Traversal & Heuristic Parsing 🌲

> **Target Audience:** Backend engineers accustomed to parsing JSON using Jackson, Gson, or fastjson.  
> **Goal:** Understand how ChronoLens scans deeply nested JSON payloads and reliably identifies timestamps without knowing the schema ahead of time.

---

## 1. The Challenge: Schema-Agnostic Timestamp Discovery

In a standard Java backend application, you deserialize JSON into strongly-typed DTO records using Jackson:

```java
public record OrderEvent(
    String orderId,
    @JsonFormat(shape = JsonFormat.Shape.STRING) Instant createdAt,
    long epochStartTime
) {}
```
Jackson knows how to parse fields because you gave it explicit annotations and types.

**In ChronoLens, we do not know the schema!**
A developer might paste:
- A Kubernetes pod event payload.
- A Stripe webhook payment record.
- A Kafka topic event with nested metadata arrays.
- An arbitrary database row dump.

ChronoLens must dynamically explore the payload, locate any timestamp-like value, determine whether it represents seconds, milliseconds, or ISO-8601 strings, and construct a readable JSONPath (e.g. `$.data.orders[0].created_at`).

---

## 2. Recursive Depth-First Search (DFS) Implementation

In `json-inspector.js`, we implement a recursive tree traversal function `scan(obj, path, out, sourceTz)`:

```
                          JSON ROOT ($)
                               │
               ┌───────────────┴───────────────┐
         "productId"                      "metadata"
       ("SKU-1001" ❌)                         │
                                   ┌───────────┴───────────┐
                             "lastRefreshedAt"       "retryCount"
                       ("2025-01-02T08:30:15Z" ✅)     (3 ❌)
```

### The Traversal Code Walkthrough:

```javascript
function scan(obj, path, out, sourceTz) {
  // Base case: null or primitive non-object
  if (obj === null || obj === undefined) return;

  // Case 1: Array handling ➔ append array index to JSONPath
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scan(v, `${path}[${i}]`, out, sourceTz));
    return;
  }

  // Case 2: Object handling ➔ iterate over all keys
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const nextPath = path ? `${path}.${k}` : `$.${k}`;
      const keyHint = TIMESTAMP_KEYS.has(k.toLowerCase());

      // Attempt interpretation on the value:
      const interp = interpret(v, keyHint, sourceTz);
      if (interp.ok) {
        out.push({
          path: nextPath,
          value: v,
          ms: interp.ms,
          type: interp.type,
        });
      }

      // If the value is a nested object/array, recurse deeper!
      if (typeof v === "object" && v !== null) {
        scan(v, nextPath, out, sourceTz);
      }
    }
    return;
  }
}
```

---

## 3. Heuristic Value Disambiguation (`interpret`)

How does ChronoLens know whether a number is a timestamp or just an order count, price, or ID?

We use a combination of **key name heuristics** and **numerical bounds checking**:

### Heuristic 1: Key Name Clues
```javascript
const TIMESTAMP_KEYS = new Set([
  "timestamp", "epoch", "starttime", "endtime",
  "createdat", "updatedat", "effectivedate", "lastrefreshedat"
]);
```

### Heuristic 2: Numerical Bounds & Digit Length
- If a number is an integer with **10 digits** (e.g. `1735689600`), it is classified as `epoch-sec`.
- If a number is an integer with **13 digits** (e.g. `1735689600000`), it is classified as `epoch-ms`.
- **Plausible Range Filtering:** ChronoLens ensures the timestamp falls between year 1900 and 2200 (`-2208988800000 <= ms <= 7258204800000`). A number like `100000000000` outside this range is rejected so phone numbers or user IDs do not produce false positives.

### Heuristic 3: Numeric String Disambiguation
If a value is a numeric string like `"1735689600"`, ChronoLens only treats it as an epoch timestamp if the key name explicitly suggests it (e.g. `"created_at": "1735689600"`). If the key was `"zipcode": "1735689600"`, it is ignored.

---

## 4. Timezone-Aware Cross-Piping to Time Converter

Once the scan completes:
1. Every row renders its original value, type badge (`ISO`, `epoch·s`, `epoch·ms`), interpreted UTC string, and the target timezone converted string.
2. Clicking **`⚡ Convert`** triggers `window.CHRONOLENS.loadCandidateIntoConverter(row)`.
3. The application switches to the Time Converter tab, automatically sets the epoch input or segmented inputs, selects the source timezone, and computes conversions across all configured target rows.
