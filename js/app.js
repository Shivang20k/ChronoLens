/* ===========================================================
   ChronoLens — app.js
   Top-level navigation (Time Converter / Inspector),
   Inspector sub-tabs (JSON / Screenshot). Other modules are
   initialized via their own DOMContentLoaded listeners.
   =========================================================== */

(function () {
  "use strict";

  window.CHRONOLENS = window.CHRONOLENS || {};

  function setView(view) {
    document.querySelectorAll(".nav-tab").forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById("view-" + view);
    if (target) {
      target.classList.add("active");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setInspectorTab(tab) {
    document.querySelectorAll(".mode-tab[data-inspector]").forEach((b) => {
      const on = b.dataset.inspector === tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.getElementById("json-panel").classList.toggle("hidden", tab !== "json");
    document.getElementById("screenshot-panel").classList.toggle("hidden", tab !== "screenshot");
  }

  window.CHRONOLENS.setView = setView;
  window.CHRONOLENS.setInspectorTab = setInspectorTab;

  function init() {
    document.querySelectorAll(".nav-tab").forEach((b) =>
      b.addEventListener("click", () => setView(b.dataset.view)));
    document.querySelectorAll(".mode-tab[data-inspector]").forEach((b) =>
      b.addEventListener("click", () => setInspectorTab(b.dataset.inspector)));

    // start on converter
    setView("converter");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
