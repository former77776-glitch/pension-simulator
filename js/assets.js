    function rowValue(row, period) {
      return Number(row?.values?.[period] || 0);
    }

    function investmentKey(rowId, period) {
      return `${rowId}:${period}`;
    }

    function getInvestment(rowId, period) {
      return investmentData[investmentKey(rowId, period)] || null;
    }

    function setInvestment(rowId, period, data) {
      investmentData[investmentKey(rowId, period)] = data;
    }

    function selectedRow() {
      return selectedInvestment ? assetRows.find((item) => item.id === selectedInvestment.rowId) : null;
    }

    function selectedPeriod() {
      return selectedInvestment ? selectedInvestment.period : latestManagedPeriod();
    }

    function selectedInvestmentData() {
      if (!selectedInvestment) return null;
      return getInvestment(selectedInvestment.rowId, selectedInvestment.period);
    }

    function stockValue(rowId, period = latestManagedPeriod()) {
      const data = getInvestment(rowId, period);
      if (!data || !Array.isArray(data.holdings)) return 0;
      return data.holdings.reduce((sum, h) => sum + toNumber(h.shares) * toNumber(h.price), 0);
    }

    function goldItems(data) {
      if (!data) return [];
      if (Array.isArray(data.items)) return data.items;
      if (data.type === "gold" && (toNumber(data.grams) > 0 || toNumber(data.price) > 0)) {
        return [{
          kind: data.kind || "금",
          quantity: toNumber(data.grams),
          price: toNumber(data.price),
          updatedAt: data.updatedAt || "",
          source: data.source || "manual"
        }];
      }
      return [];
    }

    function investmentTotal(rowId, period) {
      const data = getInvestment(rowId, period);
      if (!data) return 0;
      if (data.type === "gold") return goldItems(data).reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.price), 0);
      if (data.type === "stock") return (data.holdings || []).reduce((sum, h) => sum + toNumber(h.shares) * toNumber(h.price), 0);
      return 0;
    }

    function syncInvestmentValue(rowId, period) {
      const row = assetRows.find((item) => item.id === rowId);
      if (!row) return;
      const data = getInvestment(rowId, period);
      if (!data) return;
      row.values[period] = investmentTotal(rowId, period);
    }

    function normalizeQuery(text) {
      return String(text || "").toLowerCase().replace(/\s+/g, "").replace(/㈜|\(주\)/g, "");
    }

    function uniqueHoldingCandidates(items) {
      const seen = new Set();
      return items.filter((item) => {
        if (!item || !item.symbol || seen.has(item.symbol)) return false;
        seen.add(item.symbol);
        return true;
      });
    }

    function localHoldingCandidates(query) {
      const raw = String(query || "").trim();
      const normalized = normalizeQuery(raw);
      if (!raw) return [];
      const results = LOCAL_SEARCH_LIST.filter((item) => {
        const keys = [item.name, item.symbol, ...(item.aliases || [])].map(normalizeQuery);
        return keys.some((key) => key.includes(normalized) || normalized.includes(key));
      }).map((item) => ({ name: item.name, symbol: item.symbol, source: "내장 검색" }));
      for (const item of Object.values(SYMBOL_ALIASES)) {
        const keys = [item.name, item.symbol].map(normalizeQuery);
        if (keys.some((key) => key.includes(normalized) || normalized.includes(key))) {
          results.push({ ...item, source: "내장 검색" });
        }
      }
      return uniqueHoldingCandidates(results);
    }

    function normalizeSearchApiResults(data, fallbackName) {
      const sourceItems = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.quotes)
            ? data.quotes
            : Array.isArray(data?.items)
              ? data.items
              : data?.symbol
                ? [data]
                : [];
      return uniqueHoldingCandidates(sourceItems.map((item) => ({
        name: item.name || item.shortname || item.longname || item.symbol || fallbackName,
        symbol: item.symbol,
        source: `가격 API/${item.source || data?.source || "search"}`
      })));
    }

    function isInvestmentRow(row) {
      return row && (row.type === "stock" || row.category === "주식" || row.category === "금" || row.category === "금/비트");
    }

    function isInvestmentCell(rowId, period) {
      const row = assetRows.find((item) => item.id === rowId);
      return isInvestmentRow(row) && assetPeriods.includes(period);
    }

    function normalizeAssetRowPeriods(rows) {
      const currentYear = new Date().getFullYear();
      const backup = {};
      for (const row of rows) {
        const nextValues = {};
        for (const [key, value] of Object.entries(row.values || {})) {
          if (isValidPeriod(key)) {
            if (comparePeriods(key, currentPeriod()) <= 0) nextValues[key] = value;
            else {
              backup[row.id] = backup[row.id] || {};
              backup[row.id][key] = value;
            }
            continue;
          }
          const year = Number(key);
          if (!Number.isFinite(year)) continue;
          const period = periodForLegacyYear(year);
          if (period) nextValues[period] = value;
          else if (year > currentYear) {
            backup[row.id] = backup[row.id] || {};
            backup[row.id][key] = value;
          }
        }
        row.values = nextValues;
      }
      assetFutureBackup = { ...assetFutureBackup, ...backup };
    }

    function normalizeInvestmentPeriods(source) {
      const currentYear = new Date().getFullYear();
      const normalized = {};
      const backup = {};
      for (const [key, data] of Object.entries(source || {})) {
        const [rowId, rawPeriod] = key.split(":");
        if (!rowId || !rawPeriod) continue;
        if (isValidPeriod(rawPeriod)) {
          if (comparePeriods(rawPeriod, currentPeriod()) <= 0) normalized[investmentKey(rowId, rawPeriod)] = data;
          else {
            backup[rowId] = backup[rowId] || {};
            backup[rowId][rawPeriod] = data;
          }
          continue;
        }
        const year = Number(rawPeriod);
        const period = periodForLegacyYear(year);
        if (period) normalized[investmentKey(rowId, period)] = data;
        else if (Number.isFinite(year) && year > currentYear) {
          backup[rowId] = backup[rowId] || {};
          backup[rowId][rawPeriod] = data;
        }
      }
      assetFutureBackup.investmentData = { ...(assetFutureBackup.investmentData || {}), ...backup };
      return normalized;
    }

    function latestPeriodWithAnyData(beforeOrAt = latestManagedPeriod()) {
      const knownPeriods = new Set(assetPeriods);
      for (const row of assetRows) {
        for (const key of Object.keys(row.values || {})) {
          if (isValidPeriod(key)) knownPeriods.add(key);
        }
      }
      return [...knownPeriods]
        .filter((period) => comparePeriods(period, beforeOrAt) <= 0)
        .sort(comparePeriods)
        .reverse()
        .find((period) => assetRows.some((row) => Object.prototype.hasOwnProperty.call(row.values || {}, period)));
    }

    function archiveHiddenPeriods() {
      const visible = new Set(assetPeriods);
      const archivedRows = {};
      for (const row of assetRows) {
        for (const [period, value] of Object.entries(row.values || {})) {
          if (!isValidPeriod(period) || visible.has(period) || comparePeriods(period, currentPeriod()) > 0) continue;
          archivedRows[row.id] = archivedRows[row.id] || {};
          archivedRows[row.id][period] = value;
        }
      }
      const archivedInvestments = {};
      for (const [key, data] of Object.entries(investmentData || {})) {
        const [rowId, period] = key.split(":");
        if (!rowId || !isValidPeriod(period) || visible.has(period) || comparePeriods(period, currentPeriod()) > 0) continue;
        archivedInvestments[rowId] = archivedInvestments[rowId] || {};
        archivedInvestments[rowId][period] = data;
      }
      assetArchivedPeriods = {
        ...(assetArchivedPeriods || {}),
        rows: { ...((assetArchivedPeriods || {}).rows || {}), ...archivedRows },
        investmentData: { ...((assetArchivedPeriods || {}).investmentData || {}), ...archivedInvestments }
      };
    }

    function snapshotPeriod(sourcePeriod, targetPeriod, { overwrite = true, markCopied = false } = {}) {
      if (!sourcePeriod || !targetPeriod) return false;
      let changed = false;
      for (const row of assetRows) {
        row.values = row.values || {};
        if (!overwrite && Object.prototype.hasOwnProperty.call(row.values, targetPeriod)) continue;
        row.values[targetPeriod] = rowValue(row, sourcePeriod);
        changed = true;
      }
      const copiedInvestment = {};
      const copiedAt = new Date().toISOString();
      for (const [key, data] of Object.entries(investmentData)) {
        const [rowId, period] = key.split(":");
        const targetKey = investmentKey(rowId, targetPeriod);
        if (period !== sourcePeriod || (!overwrite && Object.prototype.hasOwnProperty.call(investmentData, targetKey))) continue;
        copiedInvestment[targetKey] = structuredClone(data);
        if (markCopied && copiedInvestment[targetKey] && typeof copiedInvestment[targetKey] === "object") {
          copiedInvestment[targetKey].updatedAt = copiedAt;
          copiedInvestment[targetKey].copiedFrom = sourcePeriod;
        }
      }
      investmentData = { ...investmentData, ...copiedInvestment };
      return changed || Object.keys(copiedInvestment).length > 0;
    }

    function latestVisibleSourcePeriod(targetPeriod, preferredPeriod = previousMonthPeriod(targetPeriod)) {
      const visiblePeriods = assetPeriods
        .filter((period) => isValidPeriod(period) && comparePeriods(period, targetPeriod) < 0)
        .sort(comparePeriods);
      return visiblePeriods.includes(preferredPeriod) ? preferredPeriod : visiblePeriods.at(-1);
    }

    function ensureMonthlySnapshots() {
      const current = currentPeriod();
      const previous = previousMonthPeriod(current);
      let changed = false;
      if (!assetPeriods.includes(current)) {
        assetPeriods = buildAssetPeriods(Number(document.getElementById("assetStartYear")?.value) || 2024);
        changed = true;
      }
      const hasPreviousSnapshot = assetRows.some((row) => Object.prototype.hasOwnProperty.call(row.values || {}, previous));
      if (comparePeriods(previous, current) < 0 && assetPeriods.includes(previous) && !hasPreviousSnapshot) {
        const source = latestPeriodWithAnyData(previousMonthPeriod(previous)) || latestPeriodWithAnyData(current);
        if (source) changed = snapshotPeriod(source, previous) || changed;
      }
      const hasCurrentSnapshot = assetRows.some((row) => Object.prototype.hasOwnProperty.call(row.values || {}, current));
      if (assetPeriods.includes(current) && !hasCurrentSnapshot) {
        const source = latestVisibleSourcePeriod(current, previous);
        if (source) changed = snapshotPeriod(source, current, { overwrite: false, markCopied: true }) || changed;
      }
      return changed;
    }

    function applyGoldToAssetRow() {
      if (!selectedInvestment || !["금", "금/비트"].includes(selectedRow()?.category)) {
        const status = document.getElementById("priceStatus");
        if (status) status.textContent = "먼저 자산 기록표에서 금 월 칸을 선택해주세요.";
        return;
      }
      const kindInput = document.getElementById("goldAssetKind");
      const gramsInput = document.getElementById("goldGrams");
      const priceInput = document.getElementById("goldPrice");
      const status = document.getElementById("priceStatus");
      if (!kindInput || !gramsInput || !priceInput) return;
      const quantity = toNumber(gramsInput.value);
      const price = toNumber(priceInput.value);
      if (quantity <= 0 || price <= 0) {
        if (status) status.textContent = "보유 수량과 단가를 입력해주세요. 기존 표 금액은 유지됩니다.";
        return;
      }
      const current = selectedInvestmentData();
      const items = goldItems(current);
      items.push({
        kind: kindInput.value || "금",
        quantity,
        price,
        updatedAt: new Date().toISOString().slice(0, 10),
        source: "manual"
      });
      const data = {
        type: "gold",
        items,
        updatedAt: new Date().toISOString().slice(0, 10),
        locked: true
      };
      setInvestment(selectedInvestment.rowId, selectedInvestment.period, data);
      syncInvestmentValue(selectedInvestment.rowId, selectedInvestment.period);
      gramsInput.value = "";
      priceInput.value = "";
      refreshAssetView();
      if (status) status.textContent = `${periodLabel(selectedInvestment.period)} ${kindInput.value} 항목 반영 및 자동 저장 완료`;
    }

    async function resolveSymbol(query) {
      const raw = String(query || "").trim();
      if (!raw) throw new Error("종목명을 입력해주세요.");
      try {
        const data = await fetchPriceApi(`/api/search?q=${encodeURIComponent(raw)}`);
        const apiResults = normalizeSearchApiResults(data, raw);
        if (apiResults.length) return apiResults[0];
      } catch (_error) {
        // API 검색 실패 시 내장 후보를 마지막으로 확인한다.
      }
      const localResults = localHoldingCandidates(raw);
      if (localResults.length) return localResults[0];
      throw new Error("검색 결과 없음 또는 직접 코드 필요");
    }

    function updateStockRowsFromHoldings() {
      for (const key of Object.keys(investmentData)) {
        const [rowId, period] = key.split(":");
        syncInvestmentValue(rowId, period);
      }
    }

    function persistAssetData({ silent = true } = {}) {
      try {
        localStorage.setItem("pensionAssetRows", JSON.stringify(assetRows));
        localStorage.setItem("pensionInvestmentData", JSON.stringify(investmentData));
        localStorage.setItem("pensionAssetPeriods", JSON.stringify(assetPeriods));
        localStorage.setItem("pensionAssetFutureBackup", JSON.stringify(assetFutureBackup));
        localStorage.setItem("pensionAssetArchivedPeriods", JSON.stringify(assetArchivedPeriods));
        localStorage.removeItem("pensionAssetYears");
        localStorage.removeItem("pensionHoldings");
        localStorage.removeItem("pensionGoldState");
        scheduleServerAutoSave();
        const status = document.getElementById("saveStatus");
        if (status) {
          status.textContent = silent ? "자동 저장됨" : "저장됨";
          window.clearTimeout(status._timer);
          status._timer = window.setTimeout(() => { status.textContent = ""; }, 1800);
        }
      } catch (error) {
        const status = document.getElementById("priceStatus");
        if (status) status.textContent = `자동 저장 실패: ${error.message}`;
      }
    }

    function refreshAssetView({ charts = true } = {}) {
      renderAssetTable({ charts });
      renderInvestmentPanel();
      persistAssetData();
      if (document.getElementById("housePlanPanel")?.classList.contains("active")) renderHousePlan();
      if (document.getElementById("retirementPanel")?.classList.contains("active")) renderRetirementPlan();
    }

    function categorySpans() {
      const spans = {};
      for (const row of assetRows) spans[row.category] = (spans[row.category] || 0) + 1;
      return spans;
    }

    function renderAssetTable({ charts = true } = {}) {
      updateStockRowsFromHoldings();
      normalizeAssetCategories();
      const cols = document.getElementById("assetCols");
      const head = document.getElementById("assetHead");
      const body = document.getElementById("assetBody");
      if (!cols || !head || !body) return;
      cols.innerHTML = `<col style="width:70px"><col style="width:178px">${assetPeriods.map(() => "<col>").join("")}`;
      head.innerHTML = `<tr><th>대분류</th><th>소분류</th>${assetPeriods.map((period) => `<th title="${periodTitle(period)}">${periodLabel(period)}</th>`).join("")}</tr>`;
      const spans = categorySpans();
      const used = new Set();
      const html = [];
      for (const row of assetRows) {
        const cells = [];
        if (!used.has(row.category)) {
          cells.push(`<td class="category" rowspan="${spans[row.category]}">${row.category}</td>`);
          used.add(row.category);
        }
        cells.push(`<td class="label">${row.label}</td>`);
        for (const period of assetPeriods) {
          const value = rowValue(row, period);
          const neg = value < 0 ? " negative" : "";
          if (isInvestmentRow(row)) {
            const selected = selectedInvestment && selectedInvestment.rowId === row.id && selectedInvestment.period === period;
            const hasData = !!getInvestment(row.id, period);
            cells.push(`<td class="value investment-cell${neg}${selected ? " selected-investment" : ""}${hasData ? " has-investment" : ""}" data-row="${row.id}" data-period="${period}" title="${periodTitle(period)} ${row.category} 상세 정보 편집">${won(value)}</td>`);
          } else {
            cells.push(`<td class="value manual${neg}"><input class="money" data-row="${row.id}" data-period="${period}" value="${won(value)}"></td>`);
          }
        }
        html.push(`<tr>${cells.join("")}</tr>`);
      }

      const netByYear = assetPeriods.map((period) => assetRows.reduce((sum, row) => sum + rowValue(row, period), 0));
      html.push(`<tr class="net-row"><td></td><td class="label">순자산</td>${netByYear.map((value) => `<td class="value">${won(value)}</td>`).join("")}</tr>`);
      html.push(`<tr class="growth-row"><td></td><td class="label">순자산 증가폭</td>${netByYear.map((value, index) => {
        if (index === 0) return "<td></td>";
        const prev = netByYear[index - 1];
        return `<td>${prev ? pct((value - prev) / Math.abs(prev)) : "-"}</td>`;
      }).join("")}</tr>`);
      body.innerHTML = html.join("");
      body.querySelectorAll("input[data-row]").forEach((input) => input.addEventListener("change", onAssetCellChange));
      body.querySelectorAll("td.investment-cell").forEach((cell) => cell.addEventListener("click", onInvestmentCellClick));
      renderAssetSummary();
      if (charts) renderAssetCharts();
    }

    function onAssetCellChange(event) {
      const input = event.target;
      const row = assetRows.find((item) => item.id === input.dataset.row);
      if (!row) return;
      row.values[input.dataset.period] = toNumber(input.value);
      input.value = won(row.values[input.dataset.period]);
      renderAssetTable({ charts: true });
      persistAssetData();
    }

    function onInvestmentCellClick(event) {
      const cell = event.currentTarget;
      selectedInvestment = { rowId: cell.dataset.row, period: cell.dataset.period };
      // 칸 선택은 "조회/편집 준비" 동작만 한다.
      // 기존 표 금액을 0으로 덮어쓰지 않도록, 상세 투자 정보는 사용자가 실제로 추가/반영할 때만 만든다.
      resetInvestmentDrafts();
      renderAssetTable({ charts: false });
      renderInvestmentPanel();
    }

    function renderAssetSummary() {
      const period = latestManagedPeriod();
      const prevPeriod = assetPeriods[assetPeriods.indexOf(period) - 1];
      const net = assetRows.reduce((sum, row) => sum + rowValue(row, period), 0);
      const prevNet = prevPeriod ? assetRows.reduce((sum, row) => sum + rowValue(row, prevPeriod), 0) : 0;
      const stock = assetRows.filter((row) => assetCategoryKey(row, period) === "주식").reduce((sum, row) => sum + rowValue(row, period), 0);
      const debt = assetRows.filter((row) => assetCategoryKey(row, period) === "대출/부채").reduce((sum, row) => sum + rowValue(row, period), 0);
      const netEl = document.getElementById("latestNetWorth");
      const growthEl = document.getElementById("latestGrowth");
      const stockEl = document.getElementById("latestStockValue");
      const debtEl = document.getElementById("latestDebt");
      const metricEls = [netEl, growthEl, stockEl, debtEl].filter(Boolean).map((el) => el.closest(".metric")).filter(Boolean);
      const hasData = assetRows.some((row) => row.category !== "순자산" && row.category !== "증가율" && rowValue(row, period) !== 0);
      metricEls.forEach((el) => el.classList.toggle("empty", !hasData));
      if (!hasData) {
        if (netEl) netEl.textContent = "아직 입력된 데이터 없음";
        if (growthEl) growthEl.textContent = "데이터 입력 후 표시됩니다";
        if (stockEl) stockEl.textContent = "데이터 입력 후 표시됩니다";
        if (debtEl) debtEl.textContent = "데이터 입력 후 표시됩니다";
      } else {
        if (netEl) netEl.textContent = compactWon(net);
        if (growthEl) growthEl.textContent = prevNet ? pct((net - prevNet) / Math.abs(prevNet)) : "직전 기록 없음";
        if (stockEl) stockEl.textContent = compactWon(stock);
        if (debtEl) debtEl.textContent = compactWon(debt);
      }
      renderMobileAssetOverview(period, prevPeriod);
      renderManagedYearUi(period);
    }

    function renderMobileAssetOverview(period = latestManagedPeriod(), prevPeriod = null) {
      const categoriesWrap = document.getElementById("mobileAssetCategories");
      if (!categoriesWrap) return;
      const totals = assetCategoryTotals(period);
      const net = Object.values(totals).reduce((sum, value) => sum + value, 0);
      const exactPreviousMonth = previousMonthPeriod(period);
      const monthComparisonPeriod = assetPeriods.includes(exactPreviousMonth) ? exactPreviousMonth : null;
      const previousYearPeriods = assetPeriods.filter((item) => periodYear(item) === periodYear(period) - 1);
      const yearComparisonPeriod = previousYearPeriods.at(-1) || null;
      const netAt = (targetPeriod) => targetPeriod
        ? Object.values(assetCategoryTotals(targetPeriod)).reduce((sum, value) => sum + value, 0)
        : 0;
      const setDelta = (id, label, comparisonPeriod) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.hidden = !comparisonPeriod;
        if (!comparisonPeriod) return;
        const delta = net - netAt(comparisonPeriod);
        element.textContent = `${label} ${delta > 0 ? "+" : ""}${compactWon(delta)}`;
        element.classList.toggle("positive", delta > 0);
        element.classList.toggle("negative", delta < 0);
      };
      const homePeriod = document.getElementById("mobileHomePeriod");
      const homeNet = document.getElementById("mobileHomeNetWorth");
      const assetPeriod = document.getElementById("mobileAssetPeriod");
      if (homePeriod) homePeriod.textContent = `${periodLabel(period)} 기준`;
      if (homeNet) homeNet.textContent = compactWon(net);
      if (assetPeriod) assetPeriod.textContent = `${periodLabel(period)} 기준`;
      setDelta("mobileHomeMonthDelta", "전월 대비", monthComparisonPeriod);
      setDelta("mobileHomeYearDelta", "전년 대비", yearComparisonPeriod);
      const homeCards = document.getElementById("mobileHomeAssetCards");
      if (homeCards) {
        const homeKeys = ["주식", "부동산", "현금", "연금", "대출/부채"];
        homeCards.innerHTML = homeKeys.map((key) => `
          <div class="card mobile-home-asset ${key === "대출/부채" ? "debt" : ""}">
            <span>${key === "대출/부채" ? "대출" : key}</span>
            <strong>${compactWon(totals[key] || 0)}</strong>
          </div>
        `).join("");
      }
      const detailRows = (row) => {
        const data = getInvestment(row.id, period);
        if (data?.type === "stock" && Array.isArray(data.holdings) && data.holdings.length) {
          return data.holdings.map((holding) => {
            const shares = toNumber(holding.shares);
            const price = toNumber(holding.price);
            const meta = `${shares.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}주 · 현재가 ${won(price)}`;
            return `<li class="mobile-category-detail"><span>${escapeHtml(holding.name || row.label)}<small>${meta}</small></span><b>${compactWon(shares * price)}</b></li>`;
          });
        }
        const items = goldItems(data);
        if (items.length) {
          return items.map((item) => {
            const quantity = toNumber(item.quantity);
            const price = toNumber(item.price);
            const meta = `${quantity.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}g · 현재가 ${won(price)}/g`;
            return `<li class="mobile-category-detail"><span>${escapeHtml(item.kind || row.label)}<small>${meta}</small></span><b>${compactWon(quantity * price)}</b></li>`;
          });
        }
        return [`<li class="mobile-category-detail"><span>${escapeHtml(row.label)}</span><b>${compactWon(rowValue(row, period))}</b></li>`];
      };
      const gross = ["부동산", "주식", "연금", "금", "현금"].reduce((sum, key) => sum + Math.max(0, totals[key] || 0), 0);
      const keys = ["부동산", "주식", "연금", "금", "현금", "대출/부채"];
      categoriesWrap.innerHTML = keys.map((key) => {
        const value = totals[key] || 0;
        const isDebt = key === "대출/부채";
        const share = !isDebt && gross ? pct(Math.max(0, value) / gross) : "비중 제외";
        const rows = assetRows
          .filter((row) => assetCategoryKey(row, period) === key)
          .filter((row) => rowValue(row, period) !== 0)
          .sort((a, b) => Math.abs(rowValue(b, period)) - Math.abs(rowValue(a, period)));
        const items = rows.length
          ? rows.flatMap(detailRows).join("")
          : `<li><span>표시할 항목 없음</span><b>-</b></li>`;
        const detailId = `mobile-category-detail-${encodeURIComponent(key)}`;
        return `
          <article class="card mobile-category-card ${isDebt ? "debt" : ""}">
            <button type="button" class="mobile-category-toggle" aria-expanded="true" aria-controls="${detailId}">
              <div class="mobile-category-head">
                <div><span>${key}</span><strong>${compactWon(value)}</strong></div>
                <div class="mobile-category-share">${share}</div>
              </div>
            </button>
            <ul class="mobile-category-items" id="${detailId}">${items}</ul>
          </article>
        `;
      }).join("");
      categoriesWrap.querySelectorAll(".mobile-category-toggle").forEach((button) => {
        button.addEventListener("click", () => {
          const expanded = button.getAttribute("aria-expanded") === "true";
          button.setAttribute("aria-expanded", String(!expanded));
          const details = document.getElementById(button.getAttribute("aria-controls"));
          if (details) details.hidden = expanded;
        });
      });
    }

    function renderManagedYearUi(period = latestManagedPeriod()) {
      const badge = document.getElementById("managedYearBadge");
      const latestButton = document.getElementById("updateLatestPrices");
      const selectedButton = document.getElementById("updateSelectedYearPrices");
      const endInput = document.getElementById("assetEndYear");
      if (badge) badge.textContent = `관리 월 ${periodLabel(period)}`;
      if (endInput) endInput.value = periodLabel(period);
      if (latestButton) latestButton.textContent = "최신 월 가격 업데이트";
      if (selectedButton) selectedButton.textContent = "선택 월 가격 업데이트";
    }

    function assetCategoryKey(row, period = latestManagedPeriod()) {
      const known = new Set(["부동산", "연금", "주식", "금", "금/비트", "현금", "대출", "대출/부채"]);
      const text = `${row?.category || ""} ${row?.label || ""} ${row?.id || ""}`;
      const identity = `${row?.label || ""} ${row?.id || ""}`;
      if (row?.debt || row?.category === "대출" || row?.category === "대출/부채" || /대출|부채/i.test(text) || rowValue(row, period) < 0) return "대출/부채";
      if (/개인연금|연금저축|퇴직연금|퇴직연금\/DC|연금\s*계좌|연금|IRP|DC/i.test(text)) return "연금";
      if (/현금|예금|보유\s*현금|ISA|청약|CMA|파킹통장/i.test(text)) return "현금";
      if (/비트|비트코인|코인|crypto|BTC/i.test(identity)) return "주식";
      if (/KRX\s*금|KRX|골드|GOLD|금/i.test(identity) || row?.category === "금" || row?.category === "금/비트") return "금";
      if (known.has(row?.category)) {
        if (row.category === "대출") return "대출/부채";
        if (row.category === "금/비트") return "금";
        return row.category;
      }
      if (/아파트|부동산|주택/i.test(text)) return "부동산";
      if (/주식|하이닉스|ETF|국내주식|해외주식/i.test(text)) return "주식";
      return row?.category === "대출" ? "대출/부채" : (row?.category || "현금");
    }

    function assetCategoryTotals(period) {
      const totals = { "부동산": 0, "연금": 0, "주식": 0, "금": 0, "현금": 0, "대출/부채": 0 };
      for (const row of assetRows) {
        const key = assetCategoryKey(row, period);
        if (totals[key] === undefined) totals[key] = 0;
        totals[key] += rowValue(row, period);
      }
      return totals;
    }

    function normalizeAssetCategories(rows = assetRows) {
      const basisPeriod = assetPeriods.at(-1) || latestManagedPeriod();
      for (const row of rows) {
        const key = assetCategoryKey(row, basisPeriod);
        if (["부동산", "연금", "주식", "금", "현금", "대출/부채"].includes(key)) row.category = key;
      }
    }


    function activeHoldings() {
      const data = selectedInvestmentData();
      return data && Array.isArray(data.holdings) ? data.holdings : [];
    }

    function resetInvestmentDrafts() {
      const holdingName = document.getElementById("holdingName");
      const holdingShares = document.getElementById("holdingShares");
      const holdingManualPrice = document.getElementById("holdingManualPrice");
      const goldAssetKind = document.getElementById("goldAssetKind");
      const goldGrams = document.getElementById("goldGrams");
      const goldPrice = document.getElementById("goldPrice");
      if (holdingName) holdingName.value = "";
      if (holdingShares) holdingShares.value = "";
      if (holdingManualPrice) holdingManualPrice.value = "";
      if (goldAssetKind) goldAssetKind.value = "금";
      if (goldGrams) goldGrams.value = "";
      if (goldPrice) goldPrice.value = "";
      clearSearchResults();
    }

    function renderInvestmentSummary(row, currentValue) {
      const totalEl = document.getElementById("investmentSummaryTotal");
      const countEl = document.getElementById("investmentSummaryCount");
      const labelEl = document.getElementById("investmentSummaryLabel");
      const countLabelEl = document.getElementById("investmentSummaryCountLabel");
      if (!totalEl || !countEl || !labelEl || !countLabelEl || !row) return;
      if (["금", "금/비트"].includes(row.category)) {
        const count = goldItems(selectedInvestmentData()).length;
        labelEl.textContent = "해당 월 금 합계";
        countLabelEl.textContent = "항목 수";
        totalEl.textContent = compactWon(currentValue);
        countEl.textContent = `${count}개`;
        return;
      }
      const count = activeHoldings().length;
      labelEl.textContent = "해당 월 주식 합계";
      countLabelEl.textContent = "보유 종목";
      totalEl.textContent = compactWon(currentValue);
      countEl.textContent = `${count}개`;
    }

    function renderInvestmentPanel() {
      const card = document.getElementById("investmentCard");
      const title = document.getElementById("investmentTitle");
      const empty = document.getElementById("investmentEmpty");
      const body = document.getElementById("investmentBody");
      const stockPanel = document.getElementById("stockInvestmentPanel");
      const goldPanel = document.getElementById("goldInvestmentPanel");
      const label = document.getElementById("selectedInvestmentLabel");
      const badge = document.getElementById("selectedInvestmentBadge");
      if (!card || !title || !empty || !body || !stockPanel || !goldPanel || !label || !badge) return;
      if (!selectedInvestment || !selectedRow()) {
        card.classList.add("waiting");
        title.textContent = "투자 자산 정보";
        empty.hidden = false;
        body.hidden = true;
        body.style.display = "none";
        stockPanel.style.display = "none";
        goldPanel.style.display = "none";
        label.textContent = "선택된 칸 없음";
        badge.textContent = "선택된 칸 없음";
        renderSearchResults([]);
        return;
      }
      card.classList.remove("waiting");
      empty.hidden = true;
      body.hidden = false;
      body.style.display = "";
      const row = selectedRow();
      const currentValue = rowValue(row, selectedInvestment.period);
      const data = selectedInvestmentData();
      const detailText = data ? "상세정보 있음" : "상세정보 없음, 기존 표 금액 유지";
      const selectedParts = [periodLabel(selectedInvestment.period), row.category, row.label];
      if (isPastManagedPeriod(selectedInvestment.period)) selectedParts.push("과거 기록");
      const mobileReadOnly = window.matchMedia("(max-width: 768px)").matches && !document.body.classList.contains("mobile-edit-mode");
      title.textContent = `${periodLabel(selectedInvestment.period)} ${row.category} 자산 ${mobileReadOnly ? "조회" : "편집"}${isPastManagedPeriod(selectedInvestment.period) ? " · 과거 기록" : ""}`;
      badge.textContent = selectedParts.join(" · ");
      label.textContent = `${row.label} / 현재 표 금액 ${won(currentValue)} / ${detailText}`;
      renderInvestmentSummary(row, currentValue);
      stockPanel.style.display = row.type === "stock" || row.category === "주식" ? "block" : "none";
      goldPanel.style.display = ["금", "금/비트"].includes(row.category) ? "block" : "none";
      renderHoldings();
      renderGoldItems();
    }

    function renderHoldings() {
      const body = document.getElementById("holdingsBody");
      if (!body) return;
      const row = selectedRow();
      if (!row || (row.type !== "stock" && row.category !== "주식")) {
        body.innerHTML = "";
        return;
      }
      const list = activeHoldings();
      body.innerHTML = list.map((h, index) => `
        <div class="holding-item">
          <div class="holding-item-top">
            <div class="holding-name">${escapeHtml(h.name || "이름 없는 종목")}</div>
            <div class="money-cell">${compactWon(toNumber(h.shares) * toNumber(h.price))}</div>
          </div>
          <div class="holding-item-meta">
            <div class="holding-symbol">${escapeHtml([h.symbol, h.updatedAt].filter(Boolean).join(" · ") || "심볼/업데이트 정보 없음")}</div>
            <button type="button" data-delete="${index}">삭제</button>
          </div>
          <div class="holding-inputs">
            <label>수량 <input class="num holding-edit" data-index="${index}" data-field="shares" value="${escapeHtml(h.shares)}"></label>
            <label>현재가 <input class="num holding-edit" data-index="${index}" data-field="price" value="${escapeHtml(h.price)}"></label>
          </div>
        </div>
      `).join("");
      body.querySelectorAll(".holding-edit").forEach((input) => input.addEventListener("change", onHoldingEdit));
      body.querySelectorAll("button[data-delete]").forEach((button) => button.addEventListener("click", () => {
        const data = selectedInvestmentData();
        if (!data || !Array.isArray(data.holdings)) return;
        data.holdings.splice(Number(button.dataset.delete), 1);
        data.locked = true;
        data.updatedAt = new Date().toISOString().slice(0, 10);
        syncInvestmentValue(selectedInvestment.rowId, selectedInvestment.period);
        refreshAssetView();
      }));
    }

    function onHoldingEdit(event) {
      const input = event.target;
      const data = selectedInvestmentData();
      if (!data || !Array.isArray(data.holdings)) return;
      data.holdings[Number(input.dataset.index)][input.dataset.field] = toNumber(input.value);
      data.locked = true;
      data.updatedAt = new Date().toISOString().slice(0, 10);
      syncInvestmentValue(selectedInvestment.rowId, selectedInvestment.period);
      refreshAssetView();
    }

    function renderGoldItems() {
      const body = document.getElementById("goldItemsBody");
      if (!body) return;
      const row = selectedRow();
      if (!row || !["금", "금/비트"].includes(row.category)) {
        body.innerHTML = "";
        return;
      }
      const data = selectedInvestmentData();
      const items = goldItems(data);
      body.innerHTML = items.map((item, index) => `
        <div class="holding-item">
          <div class="holding-item-top">
            <div class="holding-name">${escapeHtml(item.kind || "금")}</div>
            <div class="money-cell">${compactWon(toNumber(item.quantity) * toNumber(item.price))}</div>
          </div>
          <div class="holding-item-meta">
            <div class="holding-symbol">${escapeHtml(item.updatedAt || "업데이트 정보 없음")}</div>
            <button type="button" data-delete-gold="${index}">삭제</button>
          </div>
          <div class="holding-inputs">
            <label>수량 <input class="num gold-edit" data-index="${index}" data-field="quantity" value="${escapeHtml(item.quantity)}"></label>
            <label>단가 <input class="num gold-edit" data-index="${index}" data-field="price" value="${escapeHtml(item.price)}"></label>
          </div>
        </div>
      `).join("");
      body.querySelectorAll(".gold-edit").forEach((input) => input.addEventListener("change", onGoldItemEdit));
      body.querySelectorAll("button[data-delete-gold]").forEach((button) => button.addEventListener("click", () => {
        const data = selectedInvestmentData();
        if (!data) return;
        const items = goldItems(data);
        items.splice(Number(button.dataset.deleteGold), 1);
        setInvestment(selectedInvestment.rowId, selectedInvestment.period, {
          type: "gold",
          items,
          updatedAt: new Date().toISOString().slice(0, 10),
          locked: true
        });
        syncInvestmentValue(selectedInvestment.rowId, selectedInvestment.period);
        refreshAssetView();
      }));
    }

    function onGoldItemEdit(event) {
      const input = event.target;
      const data = selectedInvestmentData();
      if (!data) return;
      const items = goldItems(data);
      const item = items[Number(input.dataset.index)];
      if (!item) return;
      item[input.dataset.field] = toNumber(input.value);
      setInvestment(selectedInvestment.rowId, selectedInvestment.period, {
        type: "gold",
        items,
        updatedAt: new Date().toISOString().slice(0, 10),
        locked: true
      });
      syncInvestmentValue(selectedInvestment.rowId, selectedInvestment.period);
      refreshAssetView();
    }

    async function fetchJsonWithFallback(url) {
      const urls = [
        { label: "Yahoo 직접", url },
        { label: "AllOrigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
        { label: "CorsProxy", url: `https://corsproxy.io/?${encodeURIComponent(url)}` }
      ];
      const errors = [];
      for (const item of urls) {
        try {
          const response = await fetch(item.url, { cache: "no-store" });
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const text = await response.text();
          return { data: JSON.parse(text), source: item.label };
        } catch (error) {
          errors.push(`${item.label}: ${error.message}`);
        }
      }
      throw new Error(errors.join(" / "));
    }

    async function fetchPriceApi(path) {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    }

    async function checkLocalProxy() {
      const status = document.getElementById("priceStatus");
      try {
        await fetchPriceApi("/api/health");
        status.textContent = "가격 연결 정상";
        return true;
      } catch (error) {
        status.textContent = `가격 연결 실패: ${error.message}`;
        return false;
      }
    }

    async function autoConnectPriceApi() {
      const status = document.getElementById("priceStatus");
      if (!status) return;
      status.textContent = "가격 연결 확인 중...";
      try {
        await fetchPriceApi("/api/health");
        status.textContent = "가격 연결 정상";
      } catch (error) {
        status.textContent = `가격 연결 실패: ${error.message}`;
      }
    }

    async function fetchYahooClose(symbol) {
      try {
        const data = await fetchPriceApi(`/api/close?symbol=${encodeURIComponent(symbol.trim())}`);
        if (Number.isFinite(data.price)) return { price: data.price, date: data.date, source: `가격 API/${data.source || "close"}` };
      } catch (_error) {
        // 가격 API가 없으면 브라우저 직접 호출 경로로 이어간다.
      }

      const encoded = encodeURIComponent(symbol.trim());
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d`;
      const { data, source } = await fetchJsonWithFallback(url);
      const result = data.chart && data.chart.result && data.chart.result[0];
      const closes = result && result.indicators && result.indicators.quote && result.indicators.quote[0].close;
      const timestamps = result && result.timestamp;
      if (!closes) throw new Error(`${symbol} 종가 없음`);
      for (let i = closes.length - 1; i >= 0; i -= 1) {
        if (Number.isFinite(closes[i])) {
          return { price: closes[i], date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), source };
        }
      }
      throw new Error(`${symbol} 유효한 종가 없음`);
    }

    function recentKoreanDates(days = 10) {
      const dates = [];
      const now = new Date();
      for (let i = 0; i < days; i += 1) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        const day = date.getDay();
        if (day === 0 || day === 6) continue;
        dates.push(`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`);
      }
      return dates;
    }

    function findGoldCloseInJson(data) {
      const rows = [];
      const walk = (value) => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") {
          if (Object.values(value).some((v) => String(v).includes("금") || String(v).includes("Gold") || String(v).includes("04020000"))) rows.push(value);
          Object.values(value).forEach(walk);
        }
      };
      walk(data);
      for (const row of rows) {
        const priceValue = row.TDD_CLSPRC || row.CLSPRC || row.CLOSE_PRC || row.END_PRC || row.PRICE || row.trdPrc || row.close;
        const parsed = toNumber(priceValue);
        if (parsed > 0) return parsed;
      }
      return 0;
    }

    async function fetchKrxGoldClose() {
      try {
        const data = await fetchPriceApi("/api/gold");
        if (Number.isFinite(data.price)) return { price: data.price, date: data.date, source: `가격 API/${data.source || "gold"}` };
      } catch (_error) {
        // 가격 API가 없으면 브라우저 직접 호출 경로로 이어간다.
      }

      const endpoint = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
      const blds = [
        "dbms/MDC/STAT/standard/MDCSTAT22801",
        "dbms/MDC/STAT/standard/MDCSTAT22901",
        "dbms/MDC/STAT/standard/MDCSTAT23001"
      ];
      const errors = [];
      for (const trdDd of recentKoreanDates()) {
        for (const bld of blds) {
          const params = new URLSearchParams({
            bld,
            locale: "ko_KR",
            mktId: "GLD",
            trdDd,
            isuCd: "04020000",
            isuCd2: "04020000",
            share: "1",
            money: "1"
          });
          try {
            const { data, source } = await fetchJsonWithFallback(`${endpoint}?${params}`);
            const price = findGoldCloseInJson(data);
            if (price > 0) return { price, date: trdDd, source: `KRX/${source}` };
          } catch (error) {
            errors.push(error.message);
          }
        }
      }
      throw new Error(errors.at(-1) || "KRX 금 가격을 찾지 못했습니다.");
    }

    async function updateGoldPrice() {
      const status = document.getElementById("priceStatus");
      if (!selectedInvestment || !["금", "금/비트"].includes(selectedRow()?.category)) {
        if (status) status.textContent = "먼저 자산 기록표에서 금 월 칸을 선택해주세요.";
        return;
      }
      if (status) status.textContent = "KRX 금 가격 업데이트 중...";
      try {
        const quote = await fetchKrxGoldClose();
        const kindInput = document.getElementById("goldAssetKind");
        const priceInput = document.getElementById("goldPrice");
        if (kindInput) kindInput.value = "금";
        if (priceInput) priceInput.value = Math.round(quote.price);
        // 가격 조회는 입력칸만 채운다. 사용자가 '반영 및 고정'을 누르기 전까지 표 금액은 건드리지 않는다.
        if (status) status.textContent = `KRX 금 1g 가격 조회 완료: ${won(Math.round(quote.price))} (${quote.date}, ${quote.source}). 보유 수량 확인 후 반영 및 고정을 눌러주세요.`;
      } catch (error) {
        if (status) status.textContent = `KRX 금 자동 업데이트 실패. 수동 1g 가격을 입력해주세요. ${error.message}`;
      }
    }

    async function updateInvestmentRecordPrices(data) {
      let ok = 0;
      const errors = [];
      const sources = new Set();
      if (!data) return { ok, errors, sources };
      if (data.type === "stock") {
        const holdings = Array.isArray(data.holdings) ? data.holdings : [];
        for (const holding of holdings) {
          if (!holding.symbol) {
            errors.push(`${holding.name || "이름 없는 종목"} 심볼 없음`);
            continue;
          }
          try {
            const quote = await fetchYahooClose(holding.symbol);
            holding.price = Math.round(quote.price);
            holding.updatedAt = quote.date;
            sources.add(quote.source);
            ok += 1;
          } catch (error) {
            errors.push(error.message);
          }
        }
      }
      if (data.type === "gold") {
        const items = goldItems(data);
        let goldQuote = null;
        for (const item of items) {
          if (item.kind !== "금") continue;
          try {
            if (!goldQuote) goldQuote = await fetchKrxGoldClose();
            item.price = Math.round(goldQuote.price);
            item.updatedAt = goldQuote.date;
            item.source = goldQuote.source;
            sources.add(goldQuote.source);
            ok += 1;
          } catch (error) {
            errors.push(error.message);
          }
        }
        data.items = items;
      }
      if (ok > 0) {
        data.locked = true;
        data.updatedAt = new Date().toISOString().slice(0, 10);
      }
      return { ok, errors, sources };
    }

    async function updateInvestmentPeriodPrices(period, { rowId = null } = {}) {
      let ok = 0;
      const errors = [];
      const sources = new Set();
      const targets = Object.entries(investmentData).filter(([key, data]) => {
        const [keyRowId, keyPeriod] = key.split(":");
        if (keyPeriod !== period) return false;
        if (rowId && keyRowId !== rowId) return false;
        return data && (data.type === "stock" || data.type === "gold");
      });
      for (const [key, data] of targets) {
        const [keyRowId, keyPeriod] = key.split(":");
        const result = await updateInvestmentRecordPrices(data);
        ok += result.ok;
        result.errors.forEach((error) => errors.push(error));
        result.sources.forEach((source) => sources.add(source));
        setInvestment(keyRowId, keyPeriod, data);
        syncInvestmentValue(keyRowId, keyPeriod);
      }
      refreshAssetView();
      return { ok, errors, sources };
    }

    function confirmPastPeriodUpdate(period) {
      if (!isPastManagedPeriod(period)) return true;
      return window.confirm("과거 기록을 현재가로 업데이트할 수 있습니다. 기록 보존을 위해 신중히 진행하세요. 계속할까요?");
    }

    async function updateLatestYearPrices() {
      const status = document.getElementById("priceStatus");
      const period = latestManagedPeriod();
      if (status) status.textContent = `${periodLabel(period)} 투자 자산 가격 업데이트 중...`;
      const result = await updateInvestmentPeriodPrices(period);
      if (status) {
        status.textContent = result.ok
          ? `${periodLabel(period)} 현재 자산 ${result.ok}개 가격 업데이트 및 자동 저장됨${result.errors.length ? `, 실패 ${result.errors.length}개` : ""}`
          : `${periodLabel(period)}에 업데이트할 투자 자산이 없거나 가격 조회에 실패했습니다.`;
      }
    }

    async function updateSelectedYearPrices() {
      const status = document.getElementById("priceStatus");
      if (!selectedInvestment) {
        if (status) status.textContent = "먼저 주식 또는 금 월 칸을 선택해주세요.";
        return;
      }
      const period = selectedInvestment.period;
      if (!confirmPastPeriodUpdate(period)) return;
      if (status) status.textContent = `${periodLabel(period)} 투자 자산 가격 업데이트 중...`;
      const result = await updateInvestmentPeriodPrices(period);
      if (status) {
        status.textContent = result.ok
          ? `${periodLabel(period)} 투자 자산 ${result.ok}개 가격 업데이트 및 자동 저장됨${result.errors.length ? `, 실패 ${result.errors.length}개` : ""}`
          : `${periodLabel(period)}에 업데이트할 투자 자산이 없거나 가격 조회에 실패했습니다.`;
      }
    }

    async function updatePrices() {
      const status = document.getElementById("priceStatus");
      if (!selectedInvestment || !selectedRow()) {
        if (status) status.textContent = "먼저 업데이트할 주식 또는 금 월 칸을 선택해주세요.";
        return;
      }
      if (!confirmPastPeriodUpdate(selectedInvestment.period)) return;
      const row = selectedRow();
      if (["금", "금/비트"].includes(row.category)) {
        await updateGoldPrice();
        return;
      }
      const data = selectedInvestmentData();
      if (!data || !Array.isArray(data.holdings) || data.holdings.length === 0) {
        if (status) status.textContent = "선택한 월에 등록된 종목이 없습니다.";
        return;
      }
      if (status) status.textContent = `${periodLabel(selectedInvestment.period)} ${row.label} 종가 업데이트 중...`;
      const { ok, errors, sources } = await updateInvestmentRecordPrices(data);
      setInvestment(selectedInvestment.rowId, selectedInvestment.period, data);
      syncInvestmentValue(selectedInvestment.rowId, selectedInvestment.period);
      refreshAssetView();
      if (status) {
        status.textContent = ok
          ? `${periodLabel(selectedInvestment.period)} ${ok}개 종목 가격 업데이트 및 자동 저장 완료 (${[...sources].join(", ")})${errors.length ? `, 실패 ${errors.length}개` : ""}`
          : `가격 업데이트 실패. 가격 연결 상태를 확인하거나 현재가를 직접 입력해주세요. ${errors[0] || ""}`;
      }
    }

    function renderSearchResults(results, message = "") {
      const wrap = document.getElementById("searchResultsWrap");
      const list = document.getElementById("holdingSearchResults");
      const input = document.getElementById("holdingName");
      if (!wrap || !list) return;
      currentSearchResults = results;
      if (!results.length) activeSearchIndex = -1;
      else if (activeSearchIndex < 0 || activeSearchIndex >= results.length) activeSearchIndex = 0;
      if (input) input.setAttribute("aria-expanded", results.length || message ? "true" : "false");
      if (results.length) {
        list.innerHTML = results.map((item, index) => `
          <div class="autocomplete-option${index === activeSearchIndex ? " active" : ""}" role="option" aria-selected="${index === activeSearchIndex}" data-index="${index}">
            <span>${item.name}</span><span class="symbol">${item.symbol}</span>
          </div>
        `).join("");
      } else if (message) {
        list.innerHTML = `<div class="autocomplete-empty">${message}</div>`;
      } else {
        list.innerHTML = "";
      }
      wrap.classList.toggle("active", results.length > 0 || !!message);
      list.querySelectorAll(".autocomplete-option").forEach((option) => {
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          selectHoldingCandidate(Number(option.dataset.index));
        });
      });
    }

    function clearSearchResults() {
      currentSearchResults = [];
      activeSearchIndex = -1;
      selectedHoldingCandidate = null;
      renderSearchResults([]);
    }

    function selectHoldingCandidate(index) {
      const input = document.getElementById("holdingName");
      const picked = currentSearchResults[index] || null;
      selectedHoldingCandidate = picked ? { name: picked.name, symbol: picked.symbol } : null;
      if (input && picked) input.value = picked.name;
      renderSearchResults([]);
    }

    function moveSearchSelection(delta) {
      if (!currentSearchResults.length) return;
      activeSearchIndex = (activeSearchIndex + delta + currentSearchResults.length) % currentSearchResults.length;
      renderSearchResults(currentSearchResults);
    }

    async function updateHoldingAutocomplete() {
      const input = document.getElementById("holdingName");
      if (!input) return;
      const query = input.value.trim();
      selectedHoldingCandidate = null;
      if (!query) {
        renderSearchResults([], "종목명을 더 입력해 주세요");
        return;
      }
      const requestId = ++searchRequestId;
      const localResults = localHoldingCandidates(query);
      if (localResults.length) {
        renderSearchResults(localResults);
        return;
      }
      if (query.length < 2) {
        renderSearchResults([], "종목명을 더 입력해 주세요");
        return;
      }
      renderSearchResults([], "검색 중...");
      try {
        const data = await fetchPriceApi(`/api/search?q=${encodeURIComponent(query)}`);
        if (requestId !== searchRequestId) return;
        const apiResults = normalizeSearchApiResults(data, query);
        renderSearchResults(apiResults, apiResults.length ? "" : "검색 결과 없음");
      } catch (_error) {
        if (requestId === searchRequestId) renderSearchResults([], "검색 결과 없음");
      }
    }

    function onHoldingNameKeydown(event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSearchSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSearchSelection(-1);
      } else if (event.key === "Enter") {
        if (currentSearchResults.length && activeSearchIndex >= 0) {
          event.preventDefault();
          selectHoldingCandidate(activeSearchIndex);
        }
      } else if (event.key === "Escape") {
        renderSearchResults([]);
      }
    }

    function rebuildAssetYears() {
      const start = Math.round(toNumber(document.getElementById("assetStartYear").value));
      assetPeriods = buildAssetPeriods(start || 2024);
      ensureMonthlySnapshots();
      if (selectedInvestment && !assetPeriods.includes(selectedInvestment.period)) selectedInvestment = null;
      renderAssetTable();
      renderInvestmentPanel();
      persistAssetData();
    }

    function closeCurrentMonthSnapshot() {
      const status = document.getElementById("priceStatus");
      const target = currentPeriod();
      const source = latestPeriodWithAnyData(target) || latestManagedPeriod();
      if (!assetPeriods.includes(target)) assetPeriods = buildAssetPeriods(Number(document.getElementById("assetStartYear")?.value) || 2024);
      snapshotPeriod(source, target);
      selectedInvestment = null;
      refreshAssetView();
      if (status) status.textContent = `${periodLabel(target)} 마감 스냅샷 저장 완료`;
    }

    async function addHolding() {
      const status = document.getElementById("priceStatus");
      if (!selectedInvestment || (selectedRow()?.type !== "stock" && selectedRow()?.category !== "주식")) {
        if (status) status.textContent = "먼저 자산 기록표에서 주식 월 칸을 선택해주세요.";
        return;
      }
      const nameInput = document.getElementById("holdingName");
      const sharesInput = document.getElementById("holdingShares");
      const priceInput = document.getElementById("holdingManualPrice");
      if (!nameInput || !sharesInput || !priceInput) return;
      let picked = selectedHoldingCandidate;
      if (!picked) {
        if (status) status.textContent = "검색 결과에서 종목을 먼저 선택해 주세요.";
        await updateHoldingAutocomplete();
        return;
      }
      picked = { name: picked.name, symbol: picked.symbol };
      const shares = toNumber(sharesInput.value);
      if (shares <= 0) {
        if (status) status.textContent = "주식 수를 입력해주세요. 기존 표 금액은 유지됩니다.";
        return;
      }
      let price = toNumber(priceInput.value);
      let updatedAt = "";
      let source = "manual";
      if (price <= 0) {
        try {
          if (status) status.textContent = `${picked.name} 현재가 조회 중...`;
          const quote = await fetchYahooClose(picked.symbol);
          price = Math.round(quote.price);
          updatedAt = quote.date;
          source = quote.source;
        } catch (error) {
          if (status) status.textContent = `현재가 조회 실패. 현재가를 직접 입력해주세요. ${error.message}`;
          return;
        }
      }
      const data = selectedInvestmentData() || { type: "stock", holdings: [], updatedAt: "", locked: true };
      if (!Array.isArray(data.holdings)) data.holdings = [];
      data.type = "stock";
      data.locked = true;
      data.updatedAt = updatedAt || new Date().toISOString().slice(0, 10);
      data.holdings.push({
        name: picked.name,
        symbol: picked.symbol,
        shares,
        price,
        updatedAt,
        source
      });
      setInvestment(selectedInvestment.rowId, selectedInvestment.period, data);
      syncInvestmentValue(selectedInvestment.rowId, selectedInvestment.period);
      nameInput.value = "";
      sharesInput.value = "";
      priceInput.value = "";
      clearSearchResults();
      refreshAssetView();
      if (status) status.textContent = `${periodLabel(selectedInvestment.period)} ${picked.name} ${shares.toLocaleString("ko-KR")}주 추가 및 자동 저장 완료`;
    }

    function exportAssetCsv() {
      const header = ["대분류", "소분류", ...assetPeriods.map(periodLabel)];
      const lines = assetRows.map((row) => [row.category, row.label, ...assetPeriods.map((period) => Math.round(rowValue(row, period)))].join(","));
      const net = ["", "순자산", ...assetPeriods.map((period) => Math.round(assetRows.reduce((sum, row) => sum + rowValue(row, period), 0)))];
      const csv = "\ufeff" + [header.join(","), ...lines, net.join(",")].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "asset_history.csv";
      link.click();
      URL.revokeObjectURL(url);
    }

    function loadStoredAssetData() {
      try {
        const savedRows = localStorage.getItem("pensionAssetRows");
        const savedInvestment = localStorage.getItem("pensionInvestmentData");
        const savedPeriods = localStorage.getItem("pensionAssetPeriods");
        const savedYears = localStorage.getItem("pensionAssetYears");
        const savedFutureBackup = localStorage.getItem("pensionAssetFutureBackup");
        const savedArchivedPeriods = localStorage.getItem("pensionAssetArchivedPeriods");
        if (savedFutureBackup) {
          const parsedBackup = JSON.parse(savedFutureBackup);
          if (parsedBackup && typeof parsedBackup === "object" && !Array.isArray(parsedBackup)) assetFutureBackup = parsedBackup;
        }
        if (savedArchivedPeriods) {
          const parsedArchived = JSON.parse(savedArchivedPeriods);
          if (parsedArchived && typeof parsedArchived === "object" && !Array.isArray(parsedArchived)) assetArchivedPeriods = parsedArchived;
        }
        if (savedRows) {
          const parsedRows = JSON.parse(savedRows);
          if (Array.isArray(parsedRows)) assetRows = parsedRows;
        }
        normalizeAssetRowPeriods(assetRows);
        if (savedPeriods) {
          const parsedPeriods = JSON.parse(savedPeriods);
          if (Array.isArray(parsedPeriods) && parsedPeriods.every(isValidPeriod)) {
            const start = Math.min(...parsedPeriods.map(periodYear));
            assetPeriods = buildAssetPeriods(Number.isFinite(start) ? start : 2024);
          }
        } else if (savedYears) {
          const parsedYears = JSON.parse(savedYears);
          if (Array.isArray(parsedYears) && parsedYears.every((year) => Number.isFinite(Number(year)))) {
            const start = Math.min(...parsedYears.filter((year) => Number(year) <= new Date().getFullYear()).map(Number));
            assetPeriods = buildAssetPeriods(Number.isFinite(start) ? start : 2024);
          }
        }
        if (!assetPeriods.length) assetPeriods = buildAssetPeriods(2024);
        if (savedInvestment) {
          const parsedInvestment = JSON.parse(savedInvestment);
          if (parsedInvestment && typeof parsedInvestment === "object" && !Array.isArray(parsedInvestment)) {
            investmentData = normalizeInvestmentPeriods(parsedInvestment);
          }
        }
        archiveHiddenPeriods();
        const changed = ensureMonthlySnapshots();
        const startInput = document.getElementById("assetStartYear");
        const endInput = document.getElementById("assetEndYear");
        if (startInput) startInput.value = periodYear(assetPeriods[0] || currentPeriod());
        if (endInput) endInput.value = periodLabel(latestManagedPeriod());
        if (changed || savedYears || savedPeriods) persistAssetData();
      } catch (error) {
        const status = document.getElementById("priceStatus");
        if (status) status.textContent = `자동 복원 실패: ${error.message}`;
        assetRows = structuredClone(ASSET_ROWS);
        assetPeriods = buildAssetPeriods(2024);
        normalizeAssetRowPeriods(assetRows);
      }
    }
