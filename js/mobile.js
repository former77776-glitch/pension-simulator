    function isMobileLayout() {
      return window.matchMedia("(max-width: 768px)").matches;
    }

    function activateTab(tabName, { scroll = false } = {}) {
      document.body.dataset.mobileView = tabName;
      document.querySelectorAll(".tab, .mobile-nav-btn").forEach((button) => {
        const active = (button.dataset.tab || button.dataset.mobileView) === tabName;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      document.querySelectorAll(".panel").forEach((item) => item.classList.toggle("active", item.id === `${tabName}Panel`));
      if (tabName === "pension") renderCharts();
      if (tabName === "housePlan") renderHousePlan();
      if (tabName === "retirement") renderRetirementPlan();
      if (tabName === "assets") renderAssetCharts();
      if (tabName === "labDashboard") {
        renderLabDashboard();
        drawAssetMixChart();
      }
      if (scroll) window.scrollTo({ top: 0 });
    }

    function syncResponsiveDetails() {
      const mobile = isMobileLayout();
      const pensionDetails = document.getElementById("pensionInputDetails");
      if (pensionDetails && syncResponsiveDetails.lastIsMobile !== mobile) pensionDetails.open = !mobile;
      syncResponsiveDetails.lastIsMobile = mobile;
    }
