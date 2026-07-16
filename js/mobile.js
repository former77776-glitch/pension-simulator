    function activateTab(tabName) {
      document.querySelectorAll(".tab, .mobile-nav-btn").forEach((item) => item.classList.toggle("active", item.dataset.tab === tabName));
      document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
      document.getElementById(`${tabName}Panel`)?.classList.add("active");
      if (tabName === "pension") renderCharts();
      if (tabName === "housePlan") renderHousePlan();
      if (tabName === "assets") renderAssetCharts();
    }

    function syncResponsiveDetails() {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
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
