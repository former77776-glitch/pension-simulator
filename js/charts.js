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
          x: { stacked, grid: { display: false }, ticks: { color: "#667085", maxRotation: 0 } },
          y: {
            stacked,
            beginAtZero: true,
            grace: "12%",
            suggestedMax,
            grid: { color: "#eef2f7" },
            ticks: { color: "#667085", callback: (value) => compactWon(value) }
          }
        }
      };
    }

    function drawAssetNetChart() {
      const canvas = document.getElementById("assetNetChart");
      if (!canvas || !window.Chart) return;
      ensureChartDataLabels();
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const totals = assetPeriods.map((period) => assetCategoryTotals(period));
      const netValues = totals.map((total) => Object.values(total).reduce((sum, value) => sum + value, 0));
      const assetTotals = totals.map((total) => ["부동산", "연금", "주식", "금", "현금"].reduce((sum, key) => sum + Math.max(0, total[key] || 0), 0));
      const maxAssetTotal = Math.max(0, ...assetTotals);
      const labels = assetPeriods.map(periodLabel);
      const managedIndex = Math.max(0, assetPeriods.indexOf(latestManagedPeriod()));
      const latestNet = netValues[managedIndex] ?? netValues.at(-1) ?? 0;
      const latestTotals = totals[managedIndex] || {};
      const prevNet = managedIndex > 0 ? netValues[managedIndex - 1] : 0;
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
        data: {
          labels,
          datasets: [
            ...stackedCategories.map((item) => ({
              type: "bar",
              label: item.key,
              data: totals.map((total) => Math.max(0, total[item.key] || 0)),
              backgroundColor: item.color,
              borderColor: "#ffffff",
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
                color: "#111827",
                backgroundColor: "rgba(255,255,255,.9)",
                borderColor: "#d1d5db",
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
              borderColor: "#111827",
              backgroundColor: "#111827",
              borderWidth: 3,
              pointRadius: 3,
              pointHoverRadius: isMobile ? 7 : 5,
              pointHitRadius: isMobile ? 20 : 8,
              tension: .35,
              stack: "net",
              order: -10,
              datalabels: {
                display: (ctx) => hasDataLabels() && ctx.dataIndex === netValues.length - 1,
                color: "#111827",
                backgroundColor: "rgba(255,255,255,.92)",
                borderColor: "#d1d5db",
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
          if (!isMobile) return options;
          const tooltipOrder = ["순자산", "주식", "부동산", "현금", "연금", "금"];
          options.interaction = { mode: "index", axis: "x", intersect: false };
          options.events = ["mousemove", "mouseout", "click", "touchstart", "touchmove"];
          options.scales.x.ticks = { ...options.scales.x.ticks, autoSkip: true, maxTicksLimit: 6 };
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
        ctx.fillStyle = "#667085";
        ctx.font = "700 11px sans-serif";
        ctx.fillText("총자산", arc.x, arc.y - 9);
        ctx.fillStyle = "#0f172a";
        ctx.font = "900 15px sans-serif";
        ctx.fillText(options.text, arc.x, arc.y + 10);
        ctx.restore();
      }
    };

    function drawAssetCompositionChart() {
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
      const labels = assetPeriods.map(periodLabel);
      const totalsByPeriod = assetPeriods.map((period) => assetCategoryTotals(period));
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
            borderColor: "#ffffff",
            borderWidth: 1,
            borderRadius: 4,
            stack: "composition"
          }))
        },
        plugins: hasDataLabels() ? [window.ChartDataLabels] : [],
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
              stacked: true,
              grid: { display: false },
              ticks: { color: "#667085", maxRotation: 45, minRotation: assetPeriods.length > 8 ? 35 : 0, autoSkip: true }
            },
            y: {
              stacked: true,
              min: 0,
              max: 100,
              grid: { color: "#eef2f7" },
              ticks: { color: "#667085", callback: (value) => `${value}%` }
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
            borderColor: "#fff",
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
              display: hasDataLabels(),
              color: "#111827",
              backgroundColor: "rgba(255,255,255,.88)",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 6,
              padding: { top: 3, right: 5, bottom: 3, left: 5 },
              font: { size: 11, weight: "900" },
              anchor: "end",
              align: "end",
              offset: 4,
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

    function renderAssetCharts() {
      drawAssetNetChart();
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
            const labelY = Math.max(chartArea.top + 8, y - 13);
            ctx.fillStyle = "rgba(255, 255, 255, .94)";
            ctx.strokeStyle = "#c4b5fd";
            ctx.lineWidth = 1;
            ctx.fillRect(x - width / 2, labelY - 8, width, 16);
            ctx.strokeRect(x - width / 2, labelY - 8, width, 16);
            ctx.fillStyle = "#5b21b6";
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
              borderColor: "#7c3aed",
              backgroundColor: "#7c3aed",
              yAxisID: "yMonthly",
              pointRadius: (ctx) => ctx.chart.width < 420 ? 2 : 3,
              pointHoverRadius: 4,
              borderWidth: 2.4,
              tension: 0.24,
              fill: false,
              datalabels: { display: false }
            },
            {
              type: "line",
              label: `LTV ${ltvPercent}% 한도`,
              data: rows.map((row) => row.loanLimit || ltvLimit),
              borderColor: "#334155",
              backgroundColor: "#334155",
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
        plugins: [housePlanValueLabels],
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
            x: { grid: { display: false } },
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
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const area = { left: 58, top: 16, right: canvas.width - 18, bottom: canvas.height - 34 };
      area.width = area.right - area.left;
      area.height = area.bottom - area.top;
      const maxStack = Math.max(...pensionRows.map((r) => series.reduce((s, item) => s + Math.max(0, r[item.key]), 0)), 1) / 100000000;
      const maxLine = Math.max(...lineSeries.map((line) => Math.max(...pensionRows.map((r) => Math.max(0, r[line.key]) / 100000000))), 0);
      const yMax = Math.max(maxStack, maxLine, 1) * 1.12;
      ctx.strokeStyle = "#d9e2ef";
      ctx.fillStyle = "#667085";
      ctx.font = "12px Malgun Gothic, sans-serif";
      for (let i = 0; i <= 5; i += 1) {
        const y = area.bottom - area.height * i / 5;
        ctx.beginPath(); ctx.moveTo(area.left, y); ctx.lineTo(area.right, y); ctx.stroke();
        ctx.fillText(`${(yMax * i / 5).toFixed(1)}억`, 8, y + 4);
      }
      const gap = 5;
      const barW = Math.max(6, (area.width - gap * (pensionRows.length - 1)) / pensionRows.length);
      const p = readSimInputs();
      const gapStartIndex = pensionRows.findIndex((row) => row["나이"] >= NATIONAL_PENSION_GAP_START_AGE);
      const gapEndIndex = pensionRows.findIndex((row) => row["나이"] >= p.national_pension_start_age);
      if (gapStartIndex >= 0 && gapEndIndex > gapStartIndex) {
        const startX = area.left + gapStartIndex * (barW + gap);
        const endX = area.left + gapEndIndex * (barW + gap);
        ctx.fillStyle = "#fff7ed";
        ctx.globalAlpha = .72;
        ctx.fillRect(startX, area.top, Math.max(barW, endX - startX), area.height);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#b45309";
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
      ctx.fillStyle = "#667085";
      const every = Math.max(1, Math.ceil(pensionRows.length / 8));
      pensionRows.forEach((row, index) => {
        if (index % every === 0 || index === pensionRows.length - 1) ctx.fillText(row["나이"], area.left + index * (barW + gap), canvas.height - 12);
      });
    }

    function renderCharts() {
      drawChart(document.getElementById("balanceChart"), [
        { key: "개인연금 잔액", color: "#34a853" },
        { key: "IRP(과세재원) 잔액", color: "#f59e0b" },
        { key: "IRP(퇴직재원) 잔액", color: "#ef4444" }
      ], [{ key: "총 잔액", color: "#1e3a8a" }]);
      drawChart(document.getElementById("incomeChart"), [
        { key: "국민연금", color: "#3b82f6" },
        { key: "IRP(퇴직재원)", color: "#ef4444" },
        { key: "IRP(과세재원)", color: "#f59e0b" },
        { key: "개인연금", color: "#34a853" }
      ], [{ key: "총 과세", color: "#1e3a8a" }, { key: "그해 목표 실수령액", color: "#b42318", dash: true }]);
    }
