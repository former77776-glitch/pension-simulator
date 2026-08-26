    let mobileAssetEditMode = false;

    function isMobileLayout() {
      return window.matchMedia("(max-width: 768px)").matches;
    }

    function activateTab(tabName) {
      document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === tabName));
      document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
      document.getElementById(`${tabName}Panel`)?.classList.add("active");
      if (tabName === "pension") renderCharts();
      if (tabName === "housePlan") renderHousePlan();
      if (tabName === "retirement") renderRetirementPlan();
      if (tabName === "assets") renderAssetCharts();
    }

    function setMobileAssetEditMode(editing) {
      mobileAssetEditMode = isMobileLayout() && !!editing;
      document.body.classList.toggle("mobile-edit-mode", mobileAssetEditMode);
      document.querySelectorAll("[data-mobile-edit-toggle]").forEach((button) => {
        button.textContent = mobileAssetEditMode ? "완료" : "편집";
        button.setAttribute("aria-pressed", String(mobileAssetEditMode));
      });
      const assetDetails = document.getElementById("assetTableDetails");
      if (assetDetails && mobileAssetEditMode && document.body.dataset.mobileView === "assets") assetDetails.open = true;
      renderInvestmentPanel();
    }

    function ensureMobileInvestmentSelection() {
      if (selectedInvestment && selectedRow()) return;
      const row = assetRows.find((item) => isInvestmentRow(item));
      if (!row) return;
      selectedInvestment = { rowId: row.id, period: latestManagedPeriod() };
      resetInvestmentDrafts();
      renderInvestmentPanel();
    }

    function activateMobileView(viewName, { scroll = true } = {}) {
      if (!isMobileLayout()) return;
      document.body.dataset.mobileView = viewName;
      document.querySelectorAll(".mobile-nav-btn").forEach((button) => {
        button.classList.toggle("active", button.dataset.mobileView === viewName);
      });
      if (viewName === "pension") activateTab("pension");
      else if (viewName === "housePlan") activateTab("housePlan");
      else if (viewName === "retirement") activateTab("retirement");
      else {
        activateTab("assets");
        if (viewName === "investment") ensureMobileInvestmentSelection();
      }
      syncResponsiveDetails();
      if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function syncResponsiveDetails() {
      const isMobile = isMobileLayout();
      if (isMobile && !document.body.dataset.mobileView) {
        document.body.dataset.mobileView = "home";
        document.querySelectorAll(".mobile-nav-btn").forEach((button) => {
          button.classList.toggle("active", button.dataset.mobileView === "home");
        });
      }
      const assetDetails = document.getElementById("assetTableDetails");
      if (assetDetails && syncResponsiveDetails.lastIsMobile !== isMobile) assetDetails.open = !isMobile;
      const pensionDetails = document.getElementById("pensionInputDetails");
      if (pensionDetails && syncResponsiveDetails.lastIsMobile !== isMobile) pensionDetails.open = !isMobile;
      const netChartCard = document.getElementById("assetNetChartCard");
      const mobileSlot = document.getElementById("mobileNetChartSlot");
      const assetCharts = document.getElementById("assetCharts");
      if (netChartCard && mobileSlot && assetCharts) {
        if (isMobile && netChartCard.parentElement !== mobileSlot) mobileSlot.append(netChartCard);
        if (!isMobile && netChartCard.parentElement !== assetCharts) assetCharts.prepend(netChartCard);
        assetNetChartInstance?.resize();
      }
      if (!isMobile) {
        document.body.classList.remove("mobile-edit-mode");
        mobileAssetEditMode = false;
        document.querySelectorAll("[data-mobile-edit-toggle]").forEach((button) => {
          button.textContent = "편집";
          button.setAttribute("aria-pressed", "false");
        });
      }
      syncResponsiveDetails.lastIsMobile = isMobile;
    }

    function protectMobileAssetDetailEditing() {
      const details = document.getElementById("assetTableDetails");
      if (!details) return;
      const editableSelector = "input, select, textarea, button, [contenteditable='true']";
      for (const eventName of ["click", "touchstart", "pointerdown"]) {
        details.addEventListener(eventName, (event) => {
          if (!window.matchMedia("(max-width: 768px)").matches) return;
          if (event.target.closest(editableSelector)) event.stopPropagation();
        });
      }
    }
