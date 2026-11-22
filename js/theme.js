(function () {
  const preferenceKey = "pensionLabTheme";
  const root = document.documentElement;
  try {
    root.dataset.theme = localStorage.getItem(preferenceKey) === "light" ? "light" : "dark";
  } catch {
    root.dataset.theme = "dark";
  }
  document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll("[data-lab-theme]");
    const syncButtons = () => buttons.forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.labTheme === root.dataset.theme));
    });
    syncButtons();
    buttons.forEach(button => button.addEventListener("click", () => {
      const next = button.dataset.labTheme;
      if (root.dataset.theme === next) return;
      root.dataset.theme = next;
      try { localStorage.setItem(preferenceKey, next); } catch { /* Apply for this session. */ }
      syncButtons();
      if (typeof refreshChartTheme !== "function") return;
      refreshChartTheme();
      const active = document.querySelector(".panel.active")?.id;
      if (active === "assetsPanel") renderAssetCharts();
      if (active === "pensionPanel") renderCharts();
      if (active === "housePlanPanel") {
        const { p, labels, sell, keep } = housePlanRoadmap();
        renderHousePlanChart(labels, p.scenario === "keep" ? keep : sell);
      }
      if (active === "retirementPanel") renderRetirementTargetChart();
    }));
  });
})();
