    function bindEvents() {
      const bind = (id, eventName, handler) => {
        const element = document.getElementById(id);
        if (element) element.addEventListener(eventName, handler);
      };
      document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
      document.querySelectorAll(".mobile-nav-btn").forEach((button) => button.addEventListener("click", () => activateMobileView(button.dataset.mobileView)));
      document.querySelectorAll("[data-mobile-edit-toggle]").forEach((button) => button.addEventListener("click", () => setMobileAssetEditMode(!mobileAssetEditMode)));
      bind("mobileOpenHousePlan", "click", () => activateMobileView("housePlan"));
      window.addEventListener("resize", syncResponsiveDetails);
      bind("rebuildAssetYears", "click", rebuildAssetYears);
      bind("closeCurrentMonth", "click", closeCurrentMonthSnapshot);
      bind("checkProxy", "click", checkLocalProxy);
      bind("updateLatestPrices", "click", updateLatestYearPrices);
      bind("updateSelectedYearPrices", "click", updateSelectedYearPrices);
      bind("exportAssetCsv", "click", exportAssetCsv);
      bind("holdingName", "input", updateHoldingAutocomplete);
      bind("holdingName", "keydown", onHoldingNameKeydown);
      bind("holdingName", "focus", updateHoldingAutocomplete);
      bind("holdingName", "blur", () => window.setTimeout(() => renderSearchResults([]), 150));
      bind("addHolding", "click", addHolding);
      bind("updateSelectedStockPrices", "click", updatePrices);
      bind("updateGoldPrice", "click", updateGoldPrice);
      bind("applyGoldManual", "click", applyGoldToAssetRow);
      bind("clearHoldings", "click", () => {
        if (!selectedInvestment || (selectedRow()?.type !== "stock" && selectedRow()?.category !== "주식")) return;
        setInvestment(selectedInvestment.rowId, selectedInvestment.period, { type: "stock", holdings: [], updatedAt: "", locked: true });
        syncInvestmentValue(selectedInvestment.rowId, selectedInvestment.period);
        clearSearchResults();
        refreshAssetView();
      });
      bind("runBtn", "click", runPension);
      bind("csvBtn", "click", exportPensionCsv);
      bind("resetBtn", "click", resetPension);
      bind("connectFamilySync", "click", connectFamilySync);
      bind("loadFromServer", "click", loadFromServer);
      bind("saveToServer", "click", () => saveToServer());
      bind("toggleAutoServerSave", "click", toggleAutoServerSave);
      bind("logoutServerSync", "click", logoutServerSync);
      document.querySelectorAll("[data-house-input]").forEach((input) => {
        input.addEventListener("input", onHouseInputChanged);
        input.addEventListener("change", onHouseInputChanged);
        input.addEventListener("blur", onHouseInputChanged);
      });
      document.getElementById("houseRatioList")?.addEventListener("input", onHouseRatioInput);
      document.getElementById("houseRatioList")?.addEventListener("change", onHouseRatioInput);
      bindRetirementPlanEvents();
      protectMobileAssetDetailEditing();
    }

    renderSimInputs();
    renderHouseRatioControls();
    bindEvents();
    loadServerSyncState();
    loadStoredAssetData();
    loadHousePlanInputs();
    loadRetirementPlanInputs();
    syncResponsiveDetails();
    renderAssetTable();
    renderInvestmentPanel();
    renderHousePlan();
    renderRetirementPlan();
    runPension();
    appBootstrapped = true;
    if (pendingServerAutoSaveAfterBoot) {
      pendingServerAutoSaveAfterBoot = false;
      scheduleServerAutoSave();
    }
    autoConnectPriceApi();
