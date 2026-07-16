    function houseSetText(id, value, className = "") {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = value;
      el.className = className;
    }

    function houseInputValue(id) {
      return toNumber(document.getElementById(id)?.value);
    }

    function housePercentValue(id) {
      const raw = houseInputValue(id);
      if (!Number.isFinite(raw) || raw <= 0) return id === "houseLtv" ? 0.6 : 0;
      return raw <= 1 ? raw : raw / 100;
    }

    function setHouseMoneyDefault(id, value, badValues = []) {
      const input = document.getElementById(id);
      if (!input) return;
      const current = toNumber(input.value);
      const isBadSavedValue = badValues.some((bad) => Math.abs(current - bad) < 1);
      if (!String(input.value || "").trim() || !Number.isFinite(current) || current <= 0 || isBadSavedValue) input.value = won(value);
    }

    function setHouseNumberDefault(id, value, maxValue = Infinity) {
      const input = document.getElementById(id);
      if (!input) return;
      const current = toNumber(input.value);
      if (!String(input.value || "").trim() || !Number.isFinite(current) || current <= 0 || current > maxValue) input.value = String(value);
    }

    function normalizeHousePercentInput(id, defaultPercent) {
      const input = document.getElementById(id);
      if (!input) return;
      const raw = toNumber(input.value);
      const normalized = (!String(input.value || "").trim() || !Number.isFinite(raw) || raw <= 0)
        ? defaultPercent
        : raw <= 1 ? raw * 100 : raw;
      input.value = `${normalized.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
    }

    function updateHouseReadableHints() {
      const pairs = [
        ["housePriceReadable", "housePrice"],
        ["houseInteriorReadable", "houseInterior"],
        ["houseReserveReadable", "houseReserve"]
      ];
      for (const [hintId, inputId] of pairs) {
        const el = document.getElementById(hintId);
        if (el) el.textContent = formatKoreanWonReadable(houseInputValue(inputId));
      }
    }

    function isHousePensionAsset(row) {
      const text = `${row?.category || ""} ${row?.label || ""} ${row?.id || ""}`;
      return /개인연금|연금저축|퇴직연금|연금|IRP|DC/i.test(text);
    }

    function houseAssetGroup(row, period = assetPeriods.at(-1) || latestManagedPeriod()) {
      const category = assetCategoryKey(row, period);
      if (!row || category === "대출/부채") return null;
      if (category === "연금" || isHousePensionAsset(row)) return "pension";
      const text = `${row.id || ""} ${row.category || ""} ${row.label || ""}`.toLowerCase();
      if (category === "부동산") return "home";
      if (category === "금" || category === "금/비트") return "gold";
      if (category === "주식") return "stock";
      if (category === "현금") return "cash";
      return null;
    }

    function houseAssetsForPeriod(period) {
      const groups = Object.fromEntries(HOUSE_RATIO_GROUPS.map((item) => [item.key, 0]));
      let debt = 0;
      for (const row of assetRows) {
        const value = rowValue(row, period);
        if (assetCategoryKey(row, period) === "대출/부채") {
          debt += Math.abs(Math.min(0, value));
          continue;
        }
        const group = houseAssetGroup(row, period);
        if (group) groups[group] += Math.max(0, value);
      }
      return { period, groups, debt };
    }

    function houseLatestAssets() {
      const latest = assetPeriods.at(-1) || latestManagedPeriod();
      const assets = houseAssetsForPeriod(latest);
      const manualHome = houseInputValue("existingHomePrice");
      if (manualHome > 0) assets.groups.home = manualHome;
      return assets;
    }

    function houseRatioAppliedAmount(key, assets = houseLatestAssets()) {
      return (assets.groups[key] || 0) * (houseRatios[key] || 0) / 100;
    }

    function renderHouseRatioControls() {
      const wrap = document.getElementById("houseRatioList");
      if (!wrap) return;
      wrap.innerHTML = HOUSE_RATIO_GROUPS.map((item) => `
        <div class="ratio-item">
          <label for="houseRatio_${item.key}">${item.label}</label>
          <input id="houseRatio_${item.key}" type="range" min="0" max="100" step="5" value="${houseRatios[item.key]}" data-house-ratio="${item.key}" data-re-field="liquidationRates.${item.key}">
          <input type="number" min="0" max="100" step="5" value="${houseRatios[item.key]}" aria-label="${item.label} 비율" data-house-ratio-number="${item.key}" data-re-field="liquidationRates.${item.key}">
          <span class="ratio-amount" id="houseRatioAmount_${item.key}">-</span>
        </div>
      `).join("");
    }

    function updateHouseRatioAmounts(assets = houseLatestAssets()) {
      const scenario = document.getElementById("houseScenarioSelect")?.value || "sell";
      for (const item of HOUSE_RATIO_GROUPS) {
        const el = document.getElementById(`houseRatioAmount_${item.key}`);
        const isInactiveHome = item.key === "home" && scenario === "keep";
        const range = document.querySelector(`[data-house-ratio="${item.key}"]`);
        const number = document.querySelector(`[data-house-ratio-number="${item.key}"]`);
        if (range) range.disabled = isInactiveHome;
        if (number) number.disabled = isInactiveHome;
        if (el) el.textContent = isInactiveHome ? "미처분 시 미반영" : `${houseRatios[item.key]}% · ${compactWon(houseRatioAppliedAmount(item.key, assets))} 반영`;
      }
    }

    function persistHousePlanInputs(skipServerAutoSave = false) {
      try {
        const housePlan = collectHousePlanForServer();
        localStorage.setItem(HOUSE_PLAN_STORAGE_KEY, JSON.stringify({
          ...housePlan,
          realEstatePlan: normalizeRealEstatePlan(collectRealEstatePlanFromInputs())
        }));
        if (!skipServerAutoSave) scheduleServerAutoSave();
      } catch (_error) {
        // localStorage 사용이 막힌 환경에서는 저장만 건너뛴다.
      }
    }

    function loadHousePlanInputs() {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(HOUSE_PLAN_STORAGE_KEY) || "null");
      } catch (_error) {
        saved = null;
      }
      if (saved?.realEstatePlan && typeof saved.realEstatePlan === "object") {
        applyRealEstatePlanToInputs(saved.realEstatePlan);
        return;
      }
      if (saved?.values && typeof saved.values === "object") {
        for (const [id, value] of Object.entries(saved.values)) {
          const input = document.getElementById(id);
          if (input) input.value = value;
        }
      }
      if (saved?.ratios && typeof saved.ratios === "object") {
        for (const item of HOUSE_RATIO_GROUPS) {
          const next = Number(saved.ratios[item.key]);
          if (Number.isFinite(next)) houseRatios[item.key] = Math.max(0, Math.min(100, next));
        }
        renderHouseRatioControls();
      }
      if (!saved?.values?.existingHomePrice) {
        const input = document.getElementById("existingHomePrice");
        if (input) input.value = won((houseAssetsForPeriod(assetPeriods.at(-1) || latestManagedPeriod()).groups.home) || 0);
      }
      setHouseMoneyDefault("housePrice", HOUSE_DEFAULT_PRICE);
      setHouseMoneyDefault("houseInterior", HOUSE_DEFAULT_INTERIOR, HOUSE_BAD_COST_VALUES);
      setHouseMoneyDefault("houseReserve", HOUSE_DEFAULT_RESERVE, HOUSE_BAD_COST_VALUES);
      setHouseNumberDefault("houseLoanYears", HOUSE_DEFAULT_LOAN_YEARS, 100);
      normalizeHousePercentInput("houseLtv", HOUSE_DEFAULT_LTV);
      normalizeHousePercentInput("houseLoanRate", HOUSE_DEFAULT_LOAN_RATE);
      updateHouseReadableHints();
      persistHousePlanInputs(true);
    }

    function acquisitionBaseRate(price) {
      const eok = price / 100000000;
      if (eok <= 6) return 0.01;
      if (eok <= 9) return Math.max(0.01, Math.min(0.03, ((eok * 2 / 3) - 3) / 100));
      return 0.03;
    }

    function brokerFeeBase(price) {
      const value = Math.max(0, price);
      let rate = 0.007;
      let cap = Infinity;
      if (value < 50000000) { rate = 0.006; cap = 250000; }
      else if (value < 200000000) { rate = 0.005; cap = 800000; }
      else if (value < 900000000) rate = 0.004;
      else if (value < 1200000000) rate = 0.005;
      else if (value < 1500000000) rate = 0.006;
      const fee = Math.min(value * rate, cap);
      return document.getElementById("houseBrokerVat")?.value === "no" ? fee : fee * 1.1;
    }

    function houseCostBreakdown() {
      const price = houseInputValue("housePrice");
      const existingHomePrice = houseInputValue("existingHomePrice");
      const acquisitionBase = price * acquisitionBaseRate(price);
      const localEducationTax = acquisitionBase * 0.10;
      const ruralTax = document.getElementById("houseAreaOver85")?.value === "yes" ? price * 0.002 : 0;
      const buyFee = brokerFeeBase(price);
      const sellFee = brokerFeeBase(existingHomePrice);
      const acquisitionTotal = acquisitionBase + localEducationTax + ruralTax;
      const warning = document.getElementById("houseCountType")?.value === "multi" || document.getElementById("houseRegulated")?.value === "yes"
        ? "다주택/조정지역은 중과 가능성이 있어 실제 세액 확인이 필요합니다."
        : "";
      return {
        acquisitionBase,
        localEducationTax,
        ruralTax,
        acquisitionTotal: Math.max(0, acquisitionTotal),
        buyFee: Math.max(0, buyFee),
        sellFee: Math.max(0, sellFee),
        warning
      };
    }

    function syncHouseAutoCostInputs(costs = houseCostBreakdown()) {
      const acquisition = document.getElementById("houseAcquisitionTax");
      const buy = document.getElementById("houseBuyFee");
      const sell = document.getElementById("houseSellFee");
      if (acquisition) acquisition.value = won(costs.acquisitionTotal);
      if (buy) buy.value = won(costs.buyFee);
      if (sell) sell.value = won(costs.sellFee);
    }

    function readHousePlanInputs() {
      const costs = houseCostBreakdown();
      syncHouseAutoCostInputs(costs);
      const reserve = houseInputValue("houseReserve");
      const baseCost = houseInputValue("housePrice")
        + costs.acquisitionTotal
        + costs.buyFee
        + houseInputValue("houseInterior")
        + reserve;
      return {
        price: houseInputValue("housePrice"),
        reserve,
        ltv: housePercentValue("houseLtv"),
        loanRate: housePercentValue("houseLoanRate"),
        loanYears: Math.max(1, houseInputValue("houseLoanYears")),
        existingHomePrice: houseInputValue("existingHomePrice"),
        scenario: document.getElementById("houseScenarioSelect")?.value || "sell",
        interior: houseInputValue("houseInterior"),
        costs,
        totalCostSell: baseCost + costs.sellFee,
        totalCostKeep: baseCost
      };
    }

    function normalizeLoanRatePercent(annualRate) {
      const raw = Number(annualRate);
      if (!Number.isFinite(raw) || raw <= 0 || raw > 30) return HOUSE_DEFAULT_LOAN_RATE;
      return raw <= 1 ? raw * 100 : raw;
    }

    function normalizePaymentRatePercent(annualRate) {
      const raw = Number(annualRate);
      if (!Number.isFinite(raw) || raw < 0 || raw > 30) return HOUSE_DEFAULT_LOAN_RATE;
      return raw > 0 && raw <= 1 ? raw * 100 : raw;
    }

    function normalizeLoanYears(years) {
      const raw = Number(years);
      return !Number.isFinite(raw) || raw <= 0 || raw > 100 ? HOUSE_DEFAULT_LOAN_YEARS : raw;
    }

    function calculateMonthlyPayment(principal, annualRate, years) {
      const loan = Math.max(0, Number(principal) || 0);
      const rate = normalizePaymentRatePercent(annualRate);
      const months = Math.max(1, normalizeLoanYears(years) * 12);
      if (loan <= 0) return 0;
      const monthlyRate = rate / 100 / 12;
      if (monthlyRate <= 0) return loan / months;
      const factor = (1 + monthlyRate) ** months;
      return loan * monthlyRate * factor / (factor - 1);
    }

    function calculateFirstMonthInterest(principal, annualRate) {
      const loan = Math.max(0, Number(principal) || 0);
      if (loan <= 0) return 0;
      return loan * normalizePaymentRatePercent(annualRate) / 100 / 12;
    }

    function formatManWon(value) {
      return `${Math.round(Math.max(0, Number(value) || 0) / 10000).toLocaleString("ko-KR")}만원`;
    }

    function formatMonthlyPaymentWithInterest(principal, annualRate, years) {
      return `${formatManWon(calculateMonthlyPayment(principal, annualRate, years))}(${formatManWon(calculateFirstMonthInterest(principal, annualRate))})`;
    }

    function houseAvailableAmount(groups, _debt, scenario) {
      const liquid = HOUSE_RATIO_GROUPS.filter((item) => item.key !== "home")
        .map((item) => item.key)
        .reduce((sum, key) => sum + (groups[key] || 0) * (houseRatios[key] || 0) / 100, 0);
      const home = scenario === "sell" ? (groups.home || 0) * (houseRatios.home || 0) / 100 : 0;
      return liquid + home;
    }

    function houseScenarioRow(p, assets, scenario) {
      const totalCost = scenario === "sell" ? p.totalCostSell : p.totalCostKeep;
      const available = houseAvailableAmount(assets.groups, assets.debt, scenario);
      const loanNeeded = Math.max(0, totalCost - available);
      const loanLimit = p.price * p.ltv;
      const shortage = Math.max(0, totalCost - available - loanLimit);
      const canBuy = shortage <= 0;
      const financedLoan = Math.min(loanNeeded, loanLimit);
      const loanRatePercent = p.loanRate * 100;
      const monthlyInterest = calculateFirstMonthInterest(loanNeeded, loanRatePercent);
      const monthlyPayment = calculateMonthlyPayment(loanNeeded, loanRatePercent, p.loanYears);
      const hardCost = Math.max(0, totalCost - p.reserve);
      const remainingCash = Math.max(0, available + financedLoan - hardCost);
      const status = canBuy ? "구매 가능" : loanNeeded > loanLimit ? "대출 한도 초과" : "자금 부족";
      return { totalCost, available, loanNeeded, loanLimit, shortage, canBuy, status, monthlyInterest, monthlyPayment, remainingCash };
    }

    function housePlanRoadmap() {
      const p = readHousePlanInputs();
      const periods = assetPeriods.length ? [...assetPeriods] : [latestManagedPeriod()];
      const labels = periods.map(periodLabel);
      const assetsByPeriod = periods.map((period) => {
        const assets = houseAssetsForPeriod(period);
        if (period === periods.at(-1) && p.existingHomePrice > 0) assets.groups.home = p.existingHomePrice;
        return assets;
      });
      const sell = assetsByPeriod.map((assets) => houseScenarioRow(p, assets, "sell"));
      const keep = assetsByPeriod.map((assets) => houseScenarioRow(p, assets, "keep"));
      return { p, periods, assets: assetsByPeriod.at(-1), labels, sell, keep };
    }

    function renderHouseScenarioTable(prefix, labels, rows, ltvLabel) {
      const head = document.getElementById(`${prefix}Head`);
      const body = document.getElementById(`${prefix}Body`);
      if (!head || !body) return;
      const lastIndex = Math.max(0, labels.length - 1);
      head.innerHTML = `<tr><th>항목</th>${labels.map((label, index) => `<th class="${index === lastIndex ? "final-period" : ""}">${label}${index === lastIndex ? " · 최종 기준" : ""}</th>`).join("")}</tr>`;
      const tableRows = [
        ["현금화 가능 자산", (row) => compactWon(row.available)],
        ["총비용", (row) => compactWon(row.totalCost)],
        ["대출 필요 금액", (row) => compactWon(row.loanNeeded)],
        ["LTV 기준 대출 가능액", (row) => compactWon(row.loanLimit)],
        ["자금 부족액", (row) => `<span class="${row.shortage > 0 ? "loan-bad" : "loan-ok"}">${compactWon(row.shortage)}</span>`],
        ["원리금균등 월 상환액", (row) => formatMonthlyPaymentWithInterest(row.loanNeeded, housePercentValue("houseLoanRate") * 100, houseInputValue("houseLoanYears"))],
        ["구매 후 여유액", (row) => compactWon(row.remainingCash)],
        [`구매 가능 여부, LTV ${ltvLabel}`, (row) => `<span class="status-badge ${row.canBuy ? "" : "bad"}">${row.status}</span>`]
      ];
      body.innerHTML = tableRows.map(([label, value]) => `<tr><td>${label}</td>${rows.map((row, index) => `<td class="${index === lastIndex ? "final-period" : ""}">${value(row)}</td>`).join("")}</tr>`).join("");
    }


    function renderHousePlan() {
      if (!document.getElementById("housePlanPanel")) return;
      updateHouseReadableHints();
      const { p, assets, labels, sell, keep } = housePlanRoadmap();
      const selectedRows = p.scenario === "keep" ? keep : sell;
      const current = selectedRows.at(-1);
      const basisLabel = labels.at(-1) || "-";
      const ltvLabel = `${Math.round(p.ltv * 100)}%`;
      houseSetText("housePlanStatus", `구매 가능 여부 기준: ${basisLabel}${p.costs.warning ? ` · ${p.costs.warning}` : ""}`);
      houseSetText("houseCanBuy", current.canBuy ? `${basisLabel} 기준 구매 가능` : `${basisLabel} 기준 ${current.status}`, current.canBuy ? "loan-ok" : "loan-bad");
      houseSetText("houseTotalCost", formatKoreanWonReadable(current.totalCost));
      houseSetText("houseAvailableAssets", formatKoreanWonReadable(current.available));
      houseSetText("houseLoanNeeded", formatKoreanWonReadable(current.loanNeeded));
      houseSetText("houseLoanLimit", formatKoreanWonReadable(current.loanLimit));
      houseSetText("houseShortage", formatKoreanWonReadable(current.shortage), current.shortage > 0 ? "loan-bad" : "loan-ok");
      houseSetText("houseSidebarResult", `${basisLabel} 기준 ${current.canBuy ? "구매 가능" : current.status} · 자금 부족액 ${formatKoreanWonReadable(current.shortage)}`, current.canBuy ? "loan-ok" : "loan-bad");
      houseSetText("houseRemainingCash", formatKoreanWonReadable(current.remainingCash));
      houseSetText("houseMonthlyPayment", formatKoreanWonReadable(current.monthlyPayment));
      houseSetText("basisAcquisitionTax", formatKoreanWonReadable(p.costs.acquisitionTotal));
      houseSetText("basisBuyFee", formatKoreanWonReadable(p.costs.buyFee));
      houseSetText("basisSellFee", p.scenario === "sell" ? formatKoreanWonReadable(p.costs.sellFee) : "미반영");
      houseSetText("basisInterior", formatKoreanWonReadable(p.interior));
      houseSetText("basisReserve", formatKoreanWonReadable(p.reserve));
      updateHouseRatioAmounts(assets);
      renderHouseScenarioTable("houseSell", labels, sell, ltvLabel);
      renderHouseScenarioTable("houseKeep", labels, keep, ltvLabel);
      renderHousePlanChart(labels, selectedRows);
      persistHousePlanInputs();
    }

    function onHouseInputChanged(event) {
      const input = event.target;
      syncRealEstateFieldPeers(input);
      if (input?.dataset?.houseInput === "money" && event.type === "blur") input.value = won(toNumber(input.value));
      if (input?.id === "houseLtv" && event.type === "blur") normalizeHousePercentInput("houseLtv", 60);
      else if (input?.dataset?.houseInput === "percent" && event.type === "blur") input.value = `${toNumber(input.value).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
      syncRealEstateFieldPeers(input);
      updateHouseReadableHints();
      renderHousePlan();
    }

    function onHouseRatioInput(event) {
      const key = event.target?.dataset?.houseRatio || event.target?.dataset?.houseRatioNumber;
      if (!key) return;
      const value = Math.max(0, Math.min(100, Number(event.target.value) || 0));
      houseRatios[key] = value;
      const range = document.querySelector(`[data-house-ratio="${key}"]`);
      const number = document.querySelector(`[data-house-ratio-number="${key}"]`);
      if (range) range.value = value;
      if (number) number.value = value;
      renderHousePlan();
    }
