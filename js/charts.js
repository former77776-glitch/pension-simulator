    if (window.Chart) {
      Chart.defaults.color = "#c2ced7";
      Chart.defaults.borderColor = "#39434b";
    }

    function periodCategoryAxis(periods, { showAllLabels = false } = {}) {
      const isAnnual = (index) => {
        const period = periods[index];
        return !!period && periodYear(period) < new Date().getFullYear() &&
          (periodViewMode === "summary" || periodLabel(period).length === 4) &&
          period === periods.filter((item) => periodYear(item) === periodYear(period)).at(-1);
      };
      document.querySelectorAll("[data-period-spacing-note]").forEach((note) => { note.hidden = periodViewMode !== "summary"; });
      return {
        type: "category",
        offset: true,
        grid: { display: false },
        ticks: {
          autoSkip: !showAllLabels,
          ...(showAllLabels ? {} : { maxTicksLimit: 6 }),
          font: (context) => ({ size: 11, weight: isAnnual(context.tick?.value) ? "700" : "400" }),
          color: (context) => isAnnual(context.tick?.value) ? "#abd3fa" : "#b2bec7",
          padding: 6,
          minRotation: 0,
          maxRotation: showAllLabels ? 90 : 45,
          callback: (value) => {
            const period = periods[value];
            if (!period) return "";
            if (isAnnual(value)) return `${periodYear(period)} 최종`;
            return period.slice(2).replace("-", ".");
          }
        }
      };
    }

    function summaryPeriodBackground(initialPeriods, { liveLabels = false } = {}) {
      return {
        id: "summaryPeriodBackground",
        beforeDraw(chart) {
          const periods = liveLabels ? chart.data.labels : initialPeriods;
          if (periodViewMode !== "summary" || !periods.length) return;
          const recent = new Set(recordedAssetPeriods().slice(-5));
          const year = new Date().getFullYear();
          const lastAnnualIndex = periods.reduce((last, period, index) =>
            periodYear(period) < year && period === periods.filter((item) => periodYear(item) === periodYear(period)).at(-1) ? index : last, -1);
          const start = periods.findIndex((period, index) => index > lastAnnualIndex && recent.has(period));
          if (start < 0) return;
          const { ctx, chartArea: area, scales: { x } } = chart;
          const left = start ? (x.getPixelForValue(start - 1) + x.getPixelForValue(start)) / 2 : area.left;
          ctx.save();
          ctx.beginPath();
          ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
          ctx.clip();
          ctx.fillStyle = "rgba(100, 160, 220, 0.10)";
          ctx.fillRect(left, area.top, area.right - left, area.bottom - area.top);
          if (start > 0) {
            ctx.strokeStyle = "#9ca3af";
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(left, area.top);
            ctx.lineTo(left, area.bottom);
            ctx.stroke();
          }
          ctx.restore();
        }
      };
    }

    function ensureChartDataLabels() {
      if (!window.Chart || !window.ChartDataLabels || ensureChartDataLabels.registered) return;
      window.Chart.register(window.ChartDataLabels);
      ensureChartDataLabels.registered = true;
    }

    function hasDataLabels() {
      return !!(window.Chart && window.ChartDataLabels);
    }

    function assetChartOptions({ stacked = false, suggestedMax = undefined } = {}) {
      return {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 120,
        layout: { padding: { top: 14, right: 8, bottom: 0, left: 0 } },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, filter: (item) => item.text !== "총자산 라벨" } },
          tooltip: { filter: (ctx) => ctx.dataset.label !== "총자산 라벨", callbacks: { label: (ctx) => `${ctx.dataset.label || ctx.label}: ${compactWon(ctx.raw)}` } },
          datalabels: { display: false }
        },
        scales: {
          x: { stacked, grid: { display: false }, ticks: { color: "#b2bec7", maxRotation: 0 } },
          y: {
            stacked,
            beginAtZero: true,
            grace: "12%",
            suggestedMax,
            grid: { color: "#39434b" },
            ticks: { color: "#b2bec7", callback: (value) => compactWon(value) }
          }
        }
      };
    }

    function drawAssetNetChart() {
      const periods = displayedAssetPeriods();
      const canvas = document.getElementById("assetNetChart");
      if (!canvas || !window.Chart) return;
      ensureChartDataLabels();
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const totals = periods.map((period) => assetCategoryTotals(period));
      const netValues = totals.map((total) => Object.values(total).reduce((sum, value) => sum + value, 0));
      const assetTotals = totals.map((total) => ["부동산", "연금", "주식", "금", "현금"].reduce((sum, key) => sum + Math.max(0, total[key] || 0), 0));
      const maxAssetTotal = Math.max(0, ...assetTotals);
      const labels = periods.map(periodLabel);
      const latestTotals = assetCategoryTotals(latestManagedPeriod());
      const latestNet = Object.values(latestTotals).reduce((sum, value) => sum + value, 0);
      const previousPeriod = assetPeriods[assetPeriods.indexOf(latestManagedPeriod()) - 1];
      const prevNet = previousPeriod ? Object.values(assetCategoryTotals(previousPeriod)).reduce((sum, value) => sum + value, 0) : 0;
      const positiveTotal = ["부동산", "연금", "주식", "금", "현금"].reduce((sum, key) => sum + Math.max(0, latestTotals[key] || 0), 0);
      const stockShare = positiveTotal ? Math.max(0, latestTotals["주식"] || 0) / positiveTotal : null;
      const realEstateShare = positiveTotal ? Math.max(0, latestTotals["부동산"] || 0) / positiveTotal : null;
      const stat = document.getElementById("assetNetChartValue");
      if (stat) stat.textContent = compactWon(latestNet);
      const kpiNet = document.getElementById("chartKpiNet");
      const kpiDelta = document.getElementById("chartKpiDelta");
      const kpiStockShare = document.getElementById("chartKpiStockShare");
      const kpiRealEstateShare = document.getElementById("chartKpiRealEstateShare");
      if (kpiNet) kpiNet.textContent = positiveTotal ? compactWon(latestNet) : "데이터 입력 후 표시";
      if (kpiDelta) kpiDelta.textContent = prevNet ? compactWon(latestNet - prevNet) : "직전 기록 없음";
      if (kpiStockShare) kpiStockShare.textContent = stockShare === null ? "데이터 입력 후 표시" : pct(stockShare);
      if (kpiRealEstateShare) kpiRealEstateShare.textContent = realEstateShare === null ? "데이터 입력 후 표시" : pct(realEstateShare);
      if (assetNetChartInstance) assetNetChartInstance.destroy();
      const stackedCategories = [
        { key: "부동산", color: "#2563eb" },
        { key: "주식", color: "#0f766e" },
        { key: "금", color: "#f59e0b" },
        { key: "현금", color: "#64748b" },
        { key: "연금", color: "#7c3aed" }
      ];
      assetNetChartInstance = new Chart(canvas, {
        plugins: [summaryPeriodBackground(periods)],
        data: {
          labels,
          datasets: [
            ...stackedCategories.map((item) => ({
              type: "bar",
              label: item.key,
              data: totals.map((total) => Math.max(0, total[item.key] || 0)),
              backgroundColor: item.color,
              borderColor: "#222527",
              borderWidth: 1,
              borderRadius: 6,
              stack: "assets",
              order: 2,
              datalabels: { display: false }
            })),
            {
              type: "line",
              label: "총자산 라벨",
              data: assetTotals,
              borderColor: "rgba(0,0,0,0)",
              backgroundColor: "rgba(0,0,0,0)",
              pointRadius: 0,
              pointHoverRadius: 0,
              tension: 0,
              order: -9,
              datalabels: {
                display: (ctx) => hasDataLabels() && (!isMobile || ctx.dataIndex === assetTotals.length - 1),
                color: "#f1f4f7",
                backgroundColor: "rgba(29,36,42,.96)",
                borderColor: "#56636e",
                borderWidth: 1,
                borderRadius: 6,
                padding: { top: 3, right: 5, bottom: 3, left: 5 },
                font: { size: 11, weight: "900" },
                anchor: "end",
                align: "top",
                clamp: true,
                formatter: (value) => value ? compactWon(value) : ""
              }
            },
            {
              type: "line",
              label: "순자산",
              data: netValues,
              borderColor: "#f1f4f7",
              backgroundColor: "#f1f4f7",
              borderWidth: 3,
              pointRadius: 3,
              pointHoverRadius: isMobile ? 7 : 5,
              pointHitRadius: isMobile ? 20 : 8,
              tension: 0,
              stack: "net",
              order: -10,
              datalabels: {
                display: (ctx) => hasDataLabels() && ctx.dataIndex === netValues.length - 1,
                color: "#f1f4f7",
                backgroundColor: "rgba(29,36,42,.96)",
                borderColor: "#56636e",
                borderWidth: 1,
                borderRadius: 6,
                padding: { top: 3, right: 5, bottom: 3, left: 5 },
                font: { size: 11, weight: "900" },
                anchor: "end",
                align: "top",
                clamp: true,
                formatter: (value) => value ? compactWon(value) : ""
              }
            }
          ]
        },
        options: (() => {
          const options = assetChartOptions({ stacked: true, suggestedMax: maxAssetTotal ? maxAssetTotal * 1.12 : undefined });
          options.scales.x = { ...options.scales.x, ...periodCategoryAxis(periods, { showAllLabels: true }) };
          if (!isMobile) return options;
          const tooltipOrder = ["순자산", "주식", "부동산", "현금", "연금", "금"];
          options.interaction = { mode: "index", axis: "x", intersect: false };
          options.events = ["mousemove", "mouseout", "click", "touchstart", "touchmove"];
          options.plugins.tooltip = {
            enabled: true,
            mode: "index",
            intersect: false,
            position: "nearest",
            displayColors: true,
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            titleFont: { size: 15, weight: "700" },
            bodyFont: { size: 13, weight: "600" },
            bodySpacing: 6,
            filter: (ctx) => ctx.dataset.label !== "총자산 라벨",
            itemSort: (a, b) => tooltipOrder.indexOf(a.dataset.label) - tooltipOrder.indexOf(b.dataset.label),
            callbacks: {
              title: (items) => items[0]?.label || "",
              label: (ctx) => `${ctx.dataset.label}: ${compactWon(ctx.raw)}`,
              afterBody: (items) => {
                const index = items[0]?.dataIndex;
                if (!Number.isInteger(index)) return [];
                return [`대출: ${compactWon(totals[index]?.["대출/부채"] || 0)}`];
              }
            }
          };
          return options;
        })()
      });
    }

    const assetMixCenterTextPlugin = {
      id: "assetMixCenterText",
      afterDraw(chart, _args, options) {
        if (!options || !options.text) return;
        const meta = chart.getDatasetMeta(0);
        const arc = meta && meta.data && meta.data[0];
        if (!arc) return;
        const { ctx } = chart;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#b2bec7";
        ctx.font = "700 11px sans-serif";
        ctx.fillText("총자산", arc.x, arc.y - 9);
        ctx.fillStyle = "#f1f4f7";
        ctx.font = "900 15px sans-serif";
        ctx.fillText(options.text, arc.x, arc.y + 10);
        ctx.restore();
      }
    };

    function drawAssetCompositionChart() {
      const periods = displayedAssetPeriods();
      const canvas = document.getElementById("assetCompositionChart");
      if (!canvas || !window.Chart) return;
      ensureChartDataLabels();
      const categories = [
        { key: "부동산", color: "#2563eb" },
        { key: "주식", color: "#0f766e" },
        { key: "금", color: "#f59e0b" },
        { key: "현금", color: "#64748b" },
        { key: "연금", color: "#7c3aed" }
      ];
      const labels = periods.map(periodLabel);
      const totalsByPeriod = periods.map((period) => assetCategoryTotals(period));
      const grossTotals = totalsByPeriod.map((totals) => categories.reduce((sum, item) => sum + Math.max(0, totals[item.key] || 0), 0));
      const percentData = categories.map((item) => totalsByPeriod.map((totals, index) => {
        const gross = grossTotals[index] || 0;
        return gross ? Math.max(0, totals[item.key] || 0) / gross * 100 : 0;
      }));
      if (assetCompositionChartInstance) assetCompositionChartInstance.destroy();
      assetCompositionChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: categories.map((item, index) => ({
            label: item.key,
            data: percentData[index],
            backgroundColor: item.color,
            borderColor: "#222527",
            borderWidth: 1,
            borderRadius: 4,
            stack: "composition"
          }))
        },
        plugins: [summaryPeriodBackground(periods), ...(hasDataLabels() ? [window.ChartDataLabels] : [])],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          resizeDelay: 120,
          layout: { padding: { top: 12, right: 8, bottom: 0, left: 0 } },
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const rawAmount = Math.max(0, totalsByPeriod[ctx.dataIndex]?.[ctx.dataset.label] || 0);
                  return `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}% (${compactWon(rawAmount)})`;
                },
                footer: (items) => {
                  const index = items[0]?.dataIndex || 0;
                  return `총자산: ${compactWon(grossTotals[index] || 0)}`;
                }
              }
            },
            datalabels: {
              display: (ctx) => {
                const value = Number(ctx.dataset?.data?.[ctx.dataIndex] || 0);
                if (!hasDataLabels() || !grossTotals[ctx.dataIndex] || value < 5) return false;
                const area = ctx.chart.chartArea;
                if (!area) return true;
                const barWidth = (area.right - area.left) / Math.max(1, labels.length);
                const segmentHeight = (area.bottom - area.top) * value / 100;
                const mobileTight = (area.right - area.left) < 560 && value < 8;
                return !mobileTight && barWidth >= 34 && segmentHeight >= 16;
              },
              color: (ctx) => ctx.dataset.label === "금" ? "#111827" : "#ffffff",
              textStrokeColor: (ctx) => ctx.dataset.label === "금" ? "rgba(255,255,255,.45)" : "rgba(15,23,42,.28)",
              textStrokeWidth: 2,
              font: { size: 11, weight: "900" },
              formatter: (value) => {
                const n = Number(value || 0);
                return n >= 5 ? `${n.toFixed(1)}%` : "";
              },
              anchor: "center",
              align: "center",
              clamp: true,
              clip: true
            }
          },
          scales: {
            x: {
              ...periodCategoryAxis(periods, { showAllLabels: true }),
              stacked: true,
            },
            y: {
              stacked: true,
              min: 0,
              max: 100,
              grid: { color: "#39434b" },
              ticks: { color: "#b2bec7", callback: (value) => `${value}%` }
            }
          }
        }
      });
    }

    function drawAssetMixChart() {
      const canvas = document.getElementById("assetMixChart");
      if (!canvas || !window.Chart) return;
      ensureChartDataLabels();
      const period = latestManagedPeriod();
      const totals = assetCategoryTotals(period);
      const keys = ["부동산", "연금", "주식", "금", "현금"];
      const labels = ["부동산", "연금", "주식", "금", "현금"];
      const values = keys.map((key) => Math.max(0, totals[key] || 0));
      const rawTotal = values.reduce((sum, value) => sum + value, 0);
      const total = rawTotal || 1;
      const stockRatio = Math.max(0, totals["주식"] || 0) / total;
      const stat = document.getElementById("assetMixChartValue");
      if (stat) stat.textContent = rawTotal ? pct(stockRatio) : "-";
      if (assetMixChartInstance) assetMixChartInstance.destroy();
      assetMixChartInstance = new Chart(canvas, {
        type: "doughnut",
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: ["#2563eb", "#7c3aed", "#0f766e", "#f59e0b", "#64748b"],
            borderColor: "#222527",
            borderWidth: 3,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
            assetMixCenterText: { text: rawTotal ? compactWon(rawTotal) : "데이터 없음" },
            datalabels: {
              display: (ctx) => hasDataLabels() && rawTotal > 0 && values[ctx.dataIndex] / rawTotal >= 0.05,
              color: "#f1f4f7",
              backgroundColor: "rgba(29,36,42,.96)",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 6,
              padding: { top: 3, right: 5, bottom: 3, left: 5 },
              font: { size: 11, weight: "900" },
              anchor: "center",
              align: "center",
              offset: 0,
              clamp: true,
              formatter: (value, ctx) => {
                const ratio = total ? value / total : 0;
                if (ratio < 0.05) return "";
                return `${Math.round(ratio * 100)}%`;
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${compactWon(ctx.raw)} (${pct(ctx.raw / total)})`
              }
            }
          }
        },
        plugins: [assetMixCenterTextPlugin]
      });
    }

    let assetLongTermChartInstance = null;

    function longTermNetWorthData() {
      return displayedAssetPeriods().map((period, index) => ({
        x: index,
        y: Object.values(assetCategoryTotals(period)).reduce((sum, value) => sum + value, 0),
        period
      }));
    }

    function drawAssetLongTermChart() {
      const canvas = document.getElementById("assetLongTermChart");
      if (!canvas || !window.Chart) return;
      const data = longTermNetWorthData();
      const labels = data.map((point) => point.period);
      if (assetLongTermChartInstance) {
        assetLongTermChartInstance.data.labels = labels;
        assetLongTermChartInstance.data.datasets[0].data = data;
        assetLongTermChartInstance.options.scales.x = periodCategoryAxis(labels, { showAllLabels: true });
        assetLongTermChartInstance.update("none");
        return;
      }
      assetLongTermChartInstance = new Chart(canvas, {
        type: "line",
        plugins: [summaryPeriodBackground(labels, { liveLabels: true })],
        data: { labels, datasets: [{
          label: "순자산",
          data,
          borderColor: "#79baff",
          backgroundColor: "#79baff",
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointHitRadius: 12,
          tension: 0,
          fill: false
        }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          parsing: false,
          interaction: { mode: "nearest", axis: "x", intersect: false },
          events: ["mousemove", "mouseout", "click", "touchstart", "touchmove"],
          layout: { padding: { top: 8, right: 8 } },
          plugins: {
            legend: { display: false },
            datalabels: { display: false },
            decimation: { enabled: false },
            tooltip: { callbacks: {
              title: (items) => items[0]?.raw?.period?.replace("-", ".") || "",
              label: (context) => `순자산: ${won(context.parsed.y)}`
            } }
          },
          scales: {
            x: periodCategoryAxis(labels, { showAllLabels: true }),
            y: {
              title: { display: true, text: "순자산 (억원)" },
              grace: "8%",
              ticks: { maxTicksLimit: 5, font: { size: 11 }, callback: (value) => `${Number((value / 100000000).toFixed(2))}억` }
            }
          }
        }
      });
    }

    function renderAssetCharts() {
      drawAssetNetChart();
      drawAssetLongTermChart();
      drawAssetCompositionChart();
      drawAssetMixChart();
    }


    function renderHousePlanChart(labels, rows) {
      const canvas = document.getElementById("housePlanChart");
      if (!canvas || typeof Chart === "undefined") return;
      ensureChartDataLabels();
      const ltvLimit = rows[0]?.loanLimit || 0;
      const lastIndex = Math.max(0, rows.length - 1);
      const ltvPercent = Math.round((rows[0]?.loanLimit || 0) / Math.max(1, houseInputValue("housePrice")) * 100);
      const shouldShowHouseAmountLabel = (ctx) => {
        const value = Number(ctx.raw || 0);
        return hasDataLabels() && ctx.dataset.type !== "line" && value > 0;
      };
      const barDataLabels = (color = "#ffffff") => ({
        display: false,
        formatter: (value) => compactWon(value),
        color,
        anchor: "center",
        align: "center",
        clamp: true,
        textStrokeColor: "rgba(15, 23, 42, .28)",
        textStrokeWidth: 2,
        font: { weight: "900", size: 10 }
      });
      const housePlanValueLabels = {
        id: "housePlanValueLabels",
        afterDatasetsDraw(chart) {
          const { ctx, chartArea } = chart;
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "900 10px Malgun Gothic, sans-serif";
          [0, 1, 2].forEach((datasetIndex) => {
            const dataset = chart.data.datasets[datasetIndex];
            const meta = chart.getDatasetMeta(datasetIndex);
            meta.data.forEach((element, index) => {
              const value = Number(dataset.data[index] || 0);
              if (value <= 0) return;
              const point = element.getCenterPoint();
              if (element.width < ctx.measureText(compactWon(value)).width + 4 || Math.abs(element.base - element.y) < 16) return;
              ctx.fillStyle = datasetIndex === 1 ? "#111827" : "#ffffff";
              ctx.fillText(compactWon(value), point.x, point.y);
            });
          });

          const monthlyDataset = chart.data.datasets[3];
          const monthlyMeta = chart.getDatasetMeta(3);
          monthlyMeta.data.forEach((element, index) => {
            const value = Number(monthlyDataset.data[index] || 0);
            if (value <= 0) return;
            const { x, y } = element.getCenterPoint();
            const label = `${formatManWon(value)}/월`;
            const width = ctx.measureText(label).width + 8;
            if (index < monthlyMeta.data.length - 1 && Math.abs(monthlyMeta.data[index + 1].x - x) < width + 8) return;
            const labelY = Math.max(chartArea.top + 8, y - 13);
            ctx.fillStyle = "rgba(29,36,42,.96)";
            ctx.strokeStyle = "#c4b5fd";
            ctx.lineWidth = 1;
            ctx.fillRect(x - width / 2, labelY - 8, width, 16);
            ctx.strokeRect(x - width / 2, labelY - 8, width, 16);
            ctx.fillStyle = "#dfcaf8";
            ctx.fillText(label, x, labelY);
          });
          ctx.restore();
        }
      };
      housePlanChartInstance?.destroy();
      housePlanChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "현금화 가능 자산",
              data: rows.map((row) => row.available),
              backgroundColor: "#2563eb",
              borderRadius: 5,
              yAxisID: "y",
              datalabels: barDataLabels("#ffffff")
            },
            {
              label: "대출 필요 금액",
              data: rows.map((row) => row.loanNeeded),
              backgroundColor: "#f59e0b",
              borderRadius: 5,
              yAxisID: "y",
              datalabels: barDataLabels("#111827")
            },
            {
              label: "자금 부족액",
              data: rows.map((row) => row.shortage),
              backgroundColor: "#ef4444",
              borderRadius: 5,
              yAxisID: "y",
              datalabels: barDataLabels("#ffffff")
            },
            {
              type: "line",
              label: "월 상환액",
              data: rows.map((row) => row.monthlyPayment),
              borderColor: "#c3a2ef",
              backgroundColor: "#c3a2ef",
              yAxisID: "yMonthly",
              pointRadius: (ctx) => ctx.chart.width < 420 ? 2 : 3,
              pointHoverRadius: 4,
              borderWidth: 2.4,
              tension: 0,
              fill: false,
              datalabels: { display: false }
            },
            {
              type: "line",
              label: `LTV ${ltvPercent}% 한도`,
              data: rows.map((row) => row.loanLimit || ltvLimit),
              borderColor: "#9cabb9",
              backgroundColor: "#9cabb9",
              yAxisID: "y",
              borderDash: [6, 5],
              pointRadius: 0,
              pointHoverRadius: 0,
              borderWidth: 2,
              fill: false,
              tension: 0,
              datalabels: { display: false }
            }
          ]
        },
        plugins: [summaryPeriodBackground(displayedAssetPeriods()), housePlanValueLabels],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { filter: (item) => !String(item.text || "").startsWith("LTV") }
            },
            datalabels: {
              display: false,
              formatter: (value) => compactWon(value),
              color: (ctx) => ctx.dataset.label === "대출 필요 금액" ? "#111827" : "#ffffff",
              anchor: "center",
              align: "center",
              clamp: true,
              textStrokeColor: "rgba(15, 23, 42, .32)",
              textStrokeWidth: 2,
              font: { weight: "900", size: 10 }
            },
            tooltip: { callbacks: {
              title: (items) => {
                const index = items[0]?.dataIndex || 0;
                return `${labels[index]}${index === lastIndex ? " · 최종 기준" : ""}`;
              },
              label: (ctx) => {
                const row = rows[ctx.dataIndex || 0];
                if (ctx.dataset.label === "월 상환액") return `월 상환액: ${formatManWon(ctx.raw)}/월, 첫 달 이자 ${formatManWon(row.monthlyInterest)}`;
                return `${ctx.dataset.label}: ${compactWon(ctx.raw)}`;
              },
              afterBody: (items) => {
                const row = rows[items[0]?.dataIndex || 0];
                return [
                  `현금화 가능 자산: ${compactWon(row.available)}`,
                  `총 필요 비용: ${compactWon(row.totalCost)}`,
                  `대출 필요 금액: ${compactWon(row.loanNeeded)}`,
                  `LTV 기준 대출 가능액: ${compactWon(row.loanLimit)}`,
                  `자금 부족액: ${compactWon(row.shortage)}`,
                  `월 상환액: ${formatManWon(row.monthlyPayment)}/월`,
                  `첫 달 이자: ${formatManWon(row.monthlyInterest)}`
                ];
              }
            } }
          },
          scales: {
            x: periodCategoryAxis(displayedAssetPeriods(), { showAllLabels: true }),
            y: { ticks: { callback: (value) => compactWon(value) }, grace: "10%" },
            yMonthly: {
              position: "right",
              beginAtZero: true,
              grid: { drawOnChartArea: false },
              ticks: { callback: (value) => `${Math.round(value / 10000).toLocaleString("ko-KR")}만원/월` }
            }
          }
        }
      });
    }


    function drawChart(canvas, series, lineSeries) {
      const { width, height } = canvas.getBoundingClientRect();
      if (width < 100 || !height || !pensionRows.length) return;
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const area = { left: 58, top: 16, right: width - 18, bottom: height - 34 };
      area.width = area.right - area.left;
      area.height = area.bottom - area.top;
      const maxStack = Math.max(...pensionRows.map((r) => series.reduce((s, item) => s + Math.max(0, r[item.key]), 0)), 1) / 100000000;
      const maxLine = Math.max(...lineSeries.map((line) => Math.max(...pensionRows.map((r) => Math.max(0, r[line.key]) / 100000000))), 0);
      const yMax = Math.max(maxStack, maxLine, 1) * 1.12;
      ctx.strokeStyle = "#39434b";
      ctx.fillStyle = "#b2bec7";
      ctx.font = "12px Malgun Gothic, sans-serif";
      for (let i = 0; i <= 5; i += 1) {
        const y = area.bottom - area.height * i / 5;
        ctx.beginPath(); ctx.moveTo(area.left, y); ctx.lineTo(area.right, y); ctx.stroke();
        ctx.fillText(`${(yMax * i / 5).toFixed(1)}억`, 8, y + 4);
      }
      const slot = area.width / pensionRows.length;
      const gap = Math.min(5, slot * .24);
      const barW = slot - gap;
      const p = readSimInputs();
      const gapStartIndex = pensionRows.findIndex((row) => row["나이"] >= NATIONAL_PENSION_GAP_START_AGE);
      const gapEndIndex = pensionRows.findIndex((row) => row["나이"] >= p.national_pension_start_age);
      if (gapStartIndex >= 0 && gapEndIndex > gapStartIndex) {
        const startX = area.left + gapStartIndex * (barW + gap);
        const endX = area.left + gapEndIndex * (barW + gap);
        ctx.fillStyle = "#413222";
        ctx.globalAlpha = .72;
        ctx.fillRect(startX, area.top, Math.max(barW, endX - startX), area.height);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffcb87";
        ctx.font = "11px Malgun Gothic, sans-serif";
        ctx.fillText("국민연금 전 소득공백", startX + 4, area.top + 14);
      }
      pensionRows.forEach((row, index) => {
        const x = area.left + index * (barW + gap);
        let bottom = area.bottom;
        for (const item of series) {
          const h = Math.max(0, row[item.key] / 100000000 / yMax * area.height);
          ctx.fillStyle = item.color;
          ctx.globalAlpha = .84;
          ctx.fillRect(x, bottom - h, barW, h);
          ctx.globalAlpha = 1;
          bottom -= h;
        }
      });
      const yFor = (value) => area.bottom - value / 100000000 / yMax * area.height;
      for (const line of lineSeries) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.dash ? 1.5 : 2.4;
        ctx.setLineDash(line.dash ? [7, 5] : []);
        ctx.beginPath();
        pensionRows.forEach((row, index) => {
          const x = area.left + index * (barW + gap) + barW / 2;
          const y = yFor(row[line.key]);
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = "#b2bec7";
      ctx.font = "12px Malgun Gothic, sans-serif";
      ctx.textAlign = "center";
      const labelGap = 34;
      const every = Math.max(1, Math.ceil(labelGap / slot));
      const last = pensionRows.length - 1;
      pensionRows.forEach((row, index) => {
        if (index === last || (index % every === 0 && (last - index) * slot >= labelGap)) {
          ctx.fillText(row["나이"], area.left + (index + .5) * slot, height - 12);
        }
      });
      ctx.textAlign = "start";
    }

    function renderCharts() {
      drawChart(document.getElementById("balanceChart"), [
        { key: "개인연금 잔액", color: "#34a853" },
        { key: "IRP(과세재원) 잔액", color: "#f59e0b" },
        { key: "IRP(퇴직재원) 잔액", color: "#ef4444" }
      ], [{ key: "총 잔액", color: "#abd3fa" }]);
      drawChart(document.getElementById("incomeChart"), [
        { key: "국민연금", color: "#3b82f6" },
        { key: "IRP(퇴직재원)", color: "#ef4444" },
        { key: "IRP(과세재원)", color: "#f59e0b" },
        { key: "개인연금", color: "#34a853" }
      ], [{ key: "총 과세", color: "#abd3fa" }, { key: "그해 목표 실수령액", color: "#ff989c", dash: true }]);
    }

    const pensionChartResize = new ResizeObserver(() => renderCharts());
    document.querySelectorAll("#pensionPanel .chart-card canvas").forEach(canvas => pensionChartResize.observe(canvas));
