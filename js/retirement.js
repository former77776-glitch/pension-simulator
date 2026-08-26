    const RETIREMENT_PLAN_STORAGE_KEY = "pensionRetirementPlan";
    const RETIREMENT_PLAN_DEFAULTS = Object.freeze({ monthlyTarget: 10000000, jepiWeight: 60 });
    const RETIREMENT_TAX_RATE = 0.154;
    const RETIREMENT_JEPI_YIELD = 0.075;
    const RETIREMENT_SP500_YIELD = 0.011;

    let retirementPlanState = { ...RETIREMENT_PLAN_DEFAULTS };
    let retirementTargetChartInstance = null;

    function normalizeRetirementPlan(value = {}) {
      const monthlyTarget = Number(value?.monthlyTarget);
      const jepiWeight = Number(value?.jepiWeight);
      return {
        monthlyTarget: Number.isFinite(monthlyTarget) && monthlyTarget > 0 ? Math.round(monthlyTarget) : RETIREMENT_PLAN_DEFAULTS.monthlyTarget,
        jepiWeight: Number.isFinite(jepiWeight) ? Math.min(100, Math.max(0, Math.round(jepiWeight))) : RETIREMENT_PLAN_DEFAULTS.jepiWeight
      };
    }

    function retirementInvestableAssets() {
      const totals = assetCategoryTotals(latestManagedPeriod());
      return ["현금", "주식", "금"].reduce((sum, key) => sum + Math.max(0, Number(totals[key]) || 0), 0);
    }

    function calculateRetirementPlan(state = retirementPlanState) {
      const clean = normalizeRetirementPlan(state);
      const jepiWeight = clean.jepiWeight / 100;
      const sp500Weight = 1 - jepiWeight;
      const annualNetTarget = clean.monthlyTarget * 12;
      const annualGrossTarget = annualNetTarget / (1 - RETIREMENT_TAX_RATE);
      const weightedYield = (jepiWeight * RETIREMENT_JEPI_YIELD) + (sp500Weight * RETIREMENT_SP500_YIELD);
      const requiredAssets = weightedYield > 0 ? annualGrossTarget / weightedYield : 0;
      const currentAssets = retirementInvestableAssets();
      const additionalAssets = Math.max(requiredAssets - currentAssets, 0);
      const progress = requiredAssets > 0 ? (currentAssets / requiredAssets) * 100 : 0;
      return { ...clean, sp500Weight: 100 - clean.jepiWeight, annualNetTarget, annualGrossTarget, weightedYield, requiredAssets, currentAssets, additionalAssets, progress };
    }

    function syncRetirementInputs() {
      const target = document.getElementById("retirementMonthlyTarget");
      const slider = document.getElementById("retirementJepiWeight");
      if (target) target.value = `${retirementPlanState.monthlyTarget.toLocaleString("ko-KR")}원`;
      if (slider) slider.value = String(retirementPlanState.jepiWeight);
    }

    function renderRetirementPlan() {
      const panel = document.getElementById("retirementPanel");
      if (!panel) return;
      const result = calculateRetirementPlan();
      const visibleProgress = Math.min(100, Math.max(0, result.progress));
      const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      };
      setText("retirementAssetPeriod", `${periodLabel(latestManagedPeriod())} 자산 기준`);
      setText("retirementCurrentAssets", compactWon(result.currentAssets));
      setText("retirementRequiredAssets", compactWon(result.requiredAssets));
      setText("retirementAdditionalAssets", compactWon(result.additionalAssets));
      setText("retirementProgressPercent", `${result.progress.toFixed(1)}%`);
      setText("retirementProgressAmounts", `${compactWon(result.currentAssets)} / ${compactWon(result.requiredAssets)}`);
      setText("retirementProgressRemaining", result.additionalAssets > 0 ? `목표까지 ${compactWon(result.additionalAssets)} 남음` : "목표 달성");
      setText("retirementJepiLabel", `JEPI ${result.jepiWeight}%`);
      setText("retirementSp500Label", `S&P500 ${result.sp500Weight}%`);
      setText("retirementWeightedYield", `${(result.weightedYield * 100).toFixed(2)}%`);
      document.querySelectorAll("[data-retirement-target]").forEach((button) => {
        const preset = Number(button.dataset.retirementTarget);
        const active = Number.isFinite(preset) ? preset === result.monthlyTarget : ![5000000, 7500000, 10000000].includes(result.monthlyTarget);
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      document.querySelector(".retirement-additional-card")?.classList.toggle("complete", result.additionalAssets <= 0);
      const bar = document.getElementById("retirementProgressBar");
      if (bar) bar.style.width = `${visibleProgress}%`;
      const track = document.getElementById("retirementProgressTrack");
      if (track) track.setAttribute("aria-valuenow", String(Math.round(visibleProgress)));
      if (panel.classList.contains("active")) renderRetirementTargetChart(result);
    }

    function renderRetirementTargetChart(result = calculateRetirementPlan()) {
      const canvas = document.getElementById("retirementTargetChart");
      if (!canvas || !window.Chart) return;
      const labels = Array.from({ length: 101 }, (_, weight) => weight);
      const annualGrossTarget = result.monthlyTarget * 12 / (1 - RETIREMENT_TAX_RATE);
      const targetAssets = labels.map((weight) => {
        const ratio = weight / 100;
        const weightedYield = (ratio * RETIREMENT_JEPI_YIELD) + ((1 - ratio) * RETIREMENT_SP500_YIELD);
        return annualGrossTarget / weightedYield / 100000000;
      });
      const selectedPoint = labels.map((weight) => weight === result.jepiWeight ? targetAssets[weight] : null);
      const currentAssets = result.currentAssets / 100000000;
      const data = {
        labels,
        datasets: [
          { label: "목표 투자자산", data: targetAssets, borderColor: "#2563eb", backgroundColor: "rgba(37, 99, 235, .08)", borderWidth: 2, pointRadius: 0, tension: 0.15, fill: false },
          { label: `현재 선택 ${result.jepiWeight}%`, data: selectedPoint, borderColor: "#0f766e", backgroundColor: "#0f766e", pointRadius: 6, pointHoverRadius: 7, showLine: false },
          { label: "현재 투자 가능 자산", data: labels.map(() => currentAssets), borderColor: "#667085", borderWidth: 2, borderDash: [7, 5], pointRadius: 0, fill: false }
        ]
      };
      const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          datalabels: { display: false },
          legend: { position: "bottom", labels: { boxWidth: 14, usePointStyle: true } },
          tooltip: {
            callbacks: {
              title: (items) => items.length ? `JEPI ${items[0].label}%` : "",
              label: (context) => `${context.dataset.label}: ${Number(context.parsed.y || 0).toFixed(1)}억`
            }
          }
        },
        scales: {
          x: { title: { display: true, text: "JEPI 비중" }, ticks: { autoSkip: true, maxTicksLimit: 6, callback: (value) => `${labels[value]}%` }, grid: { display: false } },
          y: { title: { display: true, text: "목표 투자자산(억원)" }, beginAtZero: false, ticks: { callback: (value) => `${value}억` } }
        }
      };
      if (retirementTargetChartInstance) {
        retirementTargetChartInstance.data = data;
        retirementTargetChartInstance.options = options;
        retirementTargetChartInstance.update();
        retirementTargetChartInstance.resize();
        return;
      }
      retirementTargetChartInstance = new Chart(canvas, { type: "line", data, options });
    }

    function storeRetirementPlan({ scheduleServer = true } = {}) {
      localStorage.setItem(RETIREMENT_PLAN_STORAGE_KEY, JSON.stringify(retirementPlanState));
      if (scheduleServer) scheduleServerAutoSave();
    }

    function collectRetirementPlanForServer() {
      const target = document.getElementById("retirementMonthlyTarget");
      const slider = document.getElementById("retirementJepiWeight");
      retirementPlanState = normalizeRetirementPlan({
        monthlyTarget: target ? toNumber(target.value) : retirementPlanState.monthlyTarget,
        jepiWeight: slider ? Number(slider.value) : retirementPlanState.jepiWeight
      });
      return { ...retirementPlanState };
    }

    function applyRetirementPlanState(value, { persist = true, render = true } = {}) {
      retirementPlanState = normalizeRetirementPlan(value);
      syncRetirementInputs();
      if (persist) localStorage.setItem(RETIREMENT_PLAN_STORAGE_KEY, JSON.stringify(retirementPlanState));
      if (render) renderRetirementPlan();
    }

    function loadRetirementPlanInputs() {
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem(RETIREMENT_PLAN_STORAGE_KEY) || "null");
      } catch (error) {
        console.warn("은퇴 계획 설정을 불러오지 못해 기본값을 사용합니다.", error);
      }
      applyRetirementPlanState(stored || RETIREMENT_PLAN_DEFAULTS, { persist: true, render: true });
    }

    function onRetirementPlanInput(event) {
      if (event.target.id === "retirementMonthlyTarget") {
        const value = toNumber(event.target.value);
        if (value > 0) retirementPlanState.monthlyTarget = Math.round(value);
      } else if (event.target.id === "retirementJepiWeight") {
        retirementPlanState.jepiWeight = Number(event.target.value);
      }
      retirementPlanState = normalizeRetirementPlan(retirementPlanState);
      renderRetirementPlan();
      storeRetirementPlan();
    }

    function onRetirementPresetClick(event) {
      const value = event.currentTarget.dataset.retirementTarget;
      const target = document.getElementById("retirementMonthlyTarget");
      if (value === "custom") {
        document.querySelectorAll("[data-retirement-target]").forEach((button) => {
          const active = button === event.currentTarget;
          button.classList.toggle("active", active);
          button.setAttribute("aria-pressed", String(active));
        });
        target?.focus();
        target?.select();
        return;
      }
      retirementPlanState.monthlyTarget = Number(value);
      retirementPlanState = normalizeRetirementPlan(retirementPlanState);
      syncRetirementInputs();
      renderRetirementPlan();
      storeRetirementPlan();
    }

    function bindRetirementPlanEvents() {
      const target = document.getElementById("retirementMonthlyTarget");
      const slider = document.getElementById("retirementJepiWeight");
      target?.addEventListener("input", onRetirementPlanInput);
      target?.addEventListener("change", () => {
        onRetirementPlanInput({ target });
        syncRetirementInputs();
      });
      target?.addEventListener("blur", syncRetirementInputs);
      slider?.addEventListener("input", onRetirementPlanInput);
      slider?.addEventListener("change", onRetirementPlanInput);
      document.querySelectorAll("[data-retirement-target]").forEach((button) => button.addEventListener("click", onRetirementPresetClick));
    }
