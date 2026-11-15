# Tutorial Chapter 6: GitHub Pages Deployment, Actions CI/CD & Production Topology 🌐

> **Target Audience:** Backend engineers accustomed to Maven/Gradle builds, Docker containers, and Kubernetes deployments.  
> **Goal:** Understand static site deployment, Edge CDN delivery, and how ChronoLens runs indefinitely at \$0 operating cost.

---

## 1. Static Web Hosting vs. Server-Side JVM Deployments

In enterprise Java, deploying a service usually involves:
```
Java Code ➔ Maven/Gradle ➔ Docker Image ➔ Kubernetes Pod ➔ JVM Startup (1-2 GB RAM) ➔ Reverse Proxy / Ingress
```
Every running instance consumes memory, CPU, and cloud infrastructure budget.

### How ChronoLens Runs on GitHub Pages:
ChronoLens has **no server runtime**.
- The entire application consists of static files: `index.html`, `styles.css`, and vanilla ES6 JavaScript modules.
- When you deploy to GitHub Pages, GitHub uploads these files to an **Edge Content Delivery Network (CDN)** powered by Fastly/Cloudflare.
- When someone visits `https://Shivang20k.github.io/ChronoLens/`:
  1. The CDN sends the HTML/CSS/JS files directly to their browser in milliseconds.
  2. The user's **own device** (CPU and RAM) executes the JavaScript and WebAssembly.
  3. No server process is running on your behalf!

---

## 2. GitHub Actions CI/CD Pipeline Walkthrough

In `.github/workflows/deploy.yml`, we created an automated deployment pipeline. Here is how each block works:

### Triggers (`on:`)
```yaml
on:
  push:
    branches:
      - main        # Deploys on any git push to branch 'main'
  workflow_dispatch: # Allows manual trigger button from GitHub Actions UI
```

### Security Permissions
```yaml
permissions:
  contents: read    # Read code from repository
  pages: write       # Permission to update the Pages site
  id-token: write    # OpenID Connect (OIDC) token for secure GitHub deployment
```

### Build & Deploy Steps
```yaml
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload static website artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'   # Uploads current directory (index.html at root)

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## 3. GitHub Pages Quotas, Limits & Longevity

A common question from engineers used to cloud hosting trials: **"Will this trial expire or shut down?"**

| Metric | GitHub Pages Limit | ChronoLens Usage |
| :--- | :--- | :--- |
| **Cost** | **$0 / Free Forever** | $0 |
| **Expiration Date** | **Never** | Unlimited |
| **Bandwidth** | 100 GB per month | ChronoLens is ~50 KB gzip $\rightarrow$ Can serve **2,000,000+ page views** monthly without hitting limits! |
| **Request Rate Limit** | 10,000 requests per hour | Ample for team usage |
| **Site Size Limit** | 1 GB max repository size | ChronoLens is ~100 KB total |

---

## 4. Local Development: Zero-Dependency `serve.js`

To test ChronoLens locally without requiring external tools like Apache or Nginx, we authored [`serve.js`](file:///c:/Users/Shivang/Downloads/chronolens/serve.js) using native Node.js core libraries (`http`, `fs`, `path`).

To run locally anytime:
```bash
npm start
# or: node serve.js
# Open http://localhost:5173/ in your browser
```
It reads local files, maps appropriate MIME types (`.html` $\rightarrow$ `text/html`, `.js` $\rightarrow$ `application/javascript`, `.wasm` $\rightarrow$ `application/wasm`), and serves them with zero external npm dependencies.
