const labOwners = ["본인", "아내", "공동"];
const labKinds = ["부동산", "주식", "연금", "금", "현금", "대출/부채"];
let labMetadata = { groups: [], snapshots: {} };
let labFilterCategory = "";
let labPrivateSnapshot = false;
let labFinalizationInFlight = false;

function escLab(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function restoreLabMetadata(value) {
  labMetadata = {
    groups: Array.isArray(value?.groups) ? structuredClone(value.groups) : [],
    snapshots: value?.snapshots && typeof value.snapshots === "object" ? structuredClone(value.snapshots) : {}
  };
  appStorage.setItem("pensionLabMetadata", JSON.stringify(labMetadata));
}

function collectLabMetadata() {
  return labMetadata;
}

function labPersist() {
  appStorage.setItem("pensionLabMetadata", JSON.stringify(labMetadata));
  refreshAssetView({ immediate: true });
  renderHousePlan();
}

function labField(id) {
  return document.getElementById(id);
}

function labRows(period = currentPeriod()) {
  return assetRows.filter(row => !row.retiredFrom || row.retiredFrom > period);
}

function labGroup(row) {
  return labMetadata.groups.find(group => group.id === row.labGroup);
}

function labCategory(row, period) {
  return labGroup(row)?.name || assetCategoryKey(row, period);
}

function labTotals(rows) {
  const assets = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const debt = rows.reduce((sum, row) => sum + Math.max(0, -row.amount), 0);
  return { assets, debt, net: assets - debt };
}

function labDashboardMetrics(rows, totals) {
  const byKind = kind => rows.reduce((sum, row) => {
    const group = labMetadata.groups.find(item => item.name === row.category);
    return sum + ((group?.kind || row.category) === kind ? toNumber(row.amount) : 0);
  }, 0);
  return [totals.assets, totals.net, byKind("주식"), byKind("현금")];
}

function labShare(value, total) {
  return total > 0 ? `${(value / total * 100).toFixed(1)}%` : "–";
}

function labAmount(value) {
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억원`;
  if (Math.abs(value) >= 10000) return `${Math.round(value / 10000).toLocaleString("ko-KR")}만원`;
  return `${value.toLocaleString("ko-KR")}원`;
}

function labPeriodRows(period) {
  return labRows(period).filter(row => period === currentPeriod() || row.values?.[period] != null ||
    assetArchivedPeriods.rows?.[row.id]?.[period] != null || getInvestment(row.id, period))
    .map(row => {
      const record = getInvestment(row.id, period);
      return {
        id: row.id, name: row.label, category: labCategory(row, period), subcategory: row.labSubcategory || "",
        owner: row.owner || "공동", amount: rowValue(row, period), stock: row.type === "stock",
        holdings: structuredClone(record?.holdings || []),
        investment: record ? structuredClone(record) : null
      };
    });
}

function renderLabDashboard() {
  const list = labField("labHoldings");
  if (!list) return;
  const select = labField("labHistoryPeriod");
  const selected = select.value;
  const history = [...new Set([...recordedAssetPeriods(), ...Object.keys(labMetadata.snapshots)])]
    .filter(period => isValidPeriod(period) && period < currentPeriod()).sort(comparePeriods).reverse();
  const choices = ["", ...history];
  if (choices.length !== select.options.length || choices.some((period, index) => period !== select.options[index].value)) {
    select.replaceChildren(...choices.map(period => new Option(period ? period.replace("-", ".") : "현재 자산", period)));
    select.value = history.includes(selected) ? selected : "";
  }
  const historical = Boolean(select.value);
  const period = select.value || currentPeriod();
  const snapshot = historical ? labMetadata.snapshots[period] : null;
  const rows = snapshot?.rows || labPeriodRows(period);
  const totals = snapshot?.totals || labTotals(rows);
  const source = historical ? (snapshot ? "확정 기록" : "기존 기록") :
    labPrivateSnapshot ? "Supabase 백업 · 이 세션에서만 표시" : supabaseConfigured() ? "가족 자산" : "예시 데이터 · 이 기기 저장";
  labField("labPeriod").textContent = `${periodLabel(period)} · ${source}`;
  document.querySelectorAll("[data-lab-current-only]").forEach(element => { element.hidden = historical; });
  document.querySelectorAll("[data-lab-history-only]").forEach(element => { element.hidden = !historical; });
  labField("labFinalize").disabled = labFinalizationInFlight || !historical || Boolean(snapshot);
  const previousPeriod = history.find(item => item < period);
  const previousSnapshot = previousPeriod && labMetadata.snapshots[previousPeriod];
  const previousRows = previousPeriod && (previousSnapshot?.rows || labPeriodRows(previousPeriod));
  const previous = previousRows && labDashboardMetrics(previousRows, previousSnapshot?.totals || labTotals(previousRows));
  const metrics = labDashboardMetrics(rows, totals);
  labField("labTotals").innerHTML = ["총자산", "순자산", "주식 / ETF", "현금성 자산"].map((name, index) => {
    const value = metrics[index];
    const delta = previous ? value - previous[index] : 0;
    const change = previous ? `${delta > 0 ? "+" : ""}${labAmount(delta)}${previous[index] ? ` (${delta > 0 ? "+" : ""}${labShare(delta, Math.abs(previous[index]))})` : ""}` : "비교 기록 없음";
    return `<div class="lab-metric"><span>${name}</span><strong title="${won(value)}">${labAmount(value)}</strong><small class="${delta < 0 ? "lab-negative" : delta > 0 ? "lab-positive" : ""}" title="직전 기록 대비">${change}</small></div>`;
  }).join("");
  const filter = labField("labFilter");
  const categories = ["", ...new Set([...labKinds, ...rows.map(row => row.category)])];
  if (!categories.includes(labFilterCategory)) labFilterCategory = "";
  if (categories.length !== filter.children.length || categories.some((category, index) => category !== filter.children[index].dataset.labCategory)) {
    filter.innerHTML = categories.map(category => `<button type="button" data-lab-category="${escLab(category)}">${escLab(category || "전체")}</button>`).join("");
  }
  for (const button of filter.children) button.setAttribute("aria-pressed", String(button.dataset.labCategory === labFilterCategory));
  const query = labField("labSearch").value.trim().toLowerCase();
  const visible = rows.filter(row => (!labFilterCategory || labFilterCategory === row.category) &&
    [row.name, ...row.holdings.flatMap(holding => [holding.symbol, labHoldingName(holding)])].some(name => String(name || "").toLowerCase().includes(query)));
  const sort = labField("labSort").value;
  if (sort === "value") visible.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  if (sort === "name") visible.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  list.innerHTML = labTable(visible, !historical, totals.assets, categories.slice(1));
  labField("labAssetCount").textContent = `${visible.length}개 항목 · 총자산 ${labAmount(totals.assets)}`;
}

function labHoldingName(holding) {
  const name = holding.name?.trim();
  if (name && name !== holding.symbol) return name;
  return localHoldingCandidates(holding.symbol).find(item => item.symbol === holding.symbol)?.name ||
    name || holding.symbol || "이름 없는 종목";
}

function labQuoteLine(quantity, unit, price, updatedAt, current) {
  const quote = toNumber(price) > 0 ? `${toNumber(price).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원/${unit}` : "단가 미등록";
  const basis = `${current ? "최근 저장 단가" : "기록 단가"}${updatedAt ? ` · ${updatedAt}` : ""}`;
  return `<span class="lab-holding-meta"><span>${toNumber(quantity).toLocaleString("ko-KR", { maximumFractionDigits: 8 })}${unit}</span><span class="lab-quote" title="${escLab(basis)}">${quote}</span></span>`;
}

function labTable(rows, edit, total, categories) {
  if (!rows.length) return "<p>표시할 자산이 없습니다.</p>";
  const groupRows = new Map(categories.map(category => [category, []]));
  rows.forEach(row => groupRows.get(row.category).push(row));
  const valuation = value => `<td class="lab-money ${value < 0 ? "lab-negative" : ""}" title="${won(value)}">${labAmount(value)}</td><td class="lab-share">${labShare(value, total)}</td>`;
  const groups = [...groupRows].filter(([, assets]) => assets.length).map(([category, assets]) => {
    const subtotal = assets.reduce((sum, row) => sum + toNumber(row.amount), 0);
    const group = `<tr class="lab-group-heading"><th scope="rowgroup" colspan="3"><i aria-hidden="true"></i>${escLab(category)} <small>${assets.length}개</small></th>${valuation(subtotal)}${edit ? "<td></td>" : ""}</tr>`;
    return `<tbody class="lab-asset-group">${group}${assets.map(row => {
    const holdings = [
      ...row.holdings.map(item => ({ ...item, name: labHoldingName(item), quantity: item.shares, unit: "주" })),
      ...goldItems(row.investment).filter(item => /금|gold/i.test(item.kind || "금")).map(item =>
        ({ name: item.kind || "금", unit: "g", ...item }))
    ];
    const quote = item => labQuoteLine(item.quantity, item.unit, item.price, item.updatedAt, edit);
    const inline = holdings.length === 1 && (holdings[0].unit === "g" || holdings[0].name === row.name);
    return `<tr class="lab-asset-row">
      <td class="lab-asset-name"><strong>${escLab(row.name)}</strong></td>
      <td class="lab-asset-category">${escLab(row.subcategory || row.category)}</td>
      <td class="lab-detail-cell">${inline ? quote(holdings[0]) : '<span class="lab-no-detail">–</span>'}</td>
      ${valuation(row.amount)}
      ${edit ? `<td class="lab-row-action"><button type="button" data-lab-edit="${escLab(row.id)}" aria-label="${escLab(row.name)} 수정">수정</button></td>` : ""}
    </tr>${inline ? "" : holdings.map(item => `<tr class="lab-holding-row"><td class="lab-holding-name" colspan="2">${escLab(item.name)}</td><td class="lab-detail-cell">${quote(item)}</td>${valuation(toNumber(item.quantity) * toNumber(item.price))}${edit ? "<td></td>" : ""}</tr>`).join("")}`;
    }).join("")}</tbody>`;
  });
  return `<table class="lab-table"><thead><tr><th scope="col">자산명</th><th scope="col">분류</th><th scope="col">보유 상세</th><th scope="col" class="lab-money-heading">평가액</th><th scope="col" class="lab-money-heading">총자산 비중</th>${edit ? '<th scope="col" aria-label="관리"></th>' : ""}</tr></thead>${groups.join("")}</table>`;
}

function labDialog(markup) {
  const dialog = labField("labDialog");
  if (dialog.open) dialog.close();
  dialog.innerHTML = markup;
  dialog.showModal();
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  return dialog;
}

function editLabAsset(id) {
  const row = labRows().find(item => item.id === id);
  const period = currentPeriod();
  const record = row ? getInvestment(row.id, period) : null;
  const originalHoldings = record?.holdings || [];
  const options = [
    ...labKinds.map(kind => [`kind:${kind}`, kind]),
    ...labMetadata.groups.flatMap(group => [[group.id, group.name], ...group.children.map(child => [`${group.id}:${child}`, `${group.name} / ${child}`])])
  ];
  const dialog = labDialog(`<form><h2>${row ? "자산 편집" : "자산 추가"}</h2>
    <label>자산명<input name="name" required maxlength="100" value="${escLab(row?.label)}"></label>
    <label>분류<select name="group">${options.map(([value, name]) => `<option value="${escLab(value)}">${escLab(name)}</option>`).join("")}</select></label>
    <label>소유자<select name="owner">${labOwners.map(owner => `<option>${owner}</option>`).join("")}</select></label>
    <label>평가금액 (원)<input name="amount" type="number" min="0" step="1" required value="${Math.abs(row ? rowValue(row, period) : 0)}"></label>
    <fieldset class="lab-stock-editor" hidden><legend>보유 종목</legend>
      <div class="lab-stock-fields"></div>
      <button type="button" data-add-holding>종목 추가</button>
    </fieldset>
    <div class="lab-actions"><button type="button" data-close>닫기</button>${row ? '<button type="button" data-retire>삭제</button>' : ""}<button class="primary">저장</button></div>
    <p role="status"></p></form>`);
  const form = dialog.querySelector("form");
  form.elements.group.value = row?.labGroup ? [row.labGroup, row.labSubcategory].filter(Boolean).join(":") : `kind:${row ? assetCategoryKey(row, period) : "현금"}`;
  if (!form.elements.group.value) form.elements.group.value = "kind:현금";
  form.elements.owner.value = labOwners.includes(row?.owner) ? row.owner : "공동";
  const stockEditor = form.querySelector(".lab-stock-editor");
  const stockFields = stockEditor.querySelector(".lab-stock-fields");
  const holdingOriginals = new WeakMap();
  const selectedGroup = () => {
    const [groupId, ...parts] = form.elements.group.value.split(":");
    const child = parts.join(":");
    const group = labMetadata.groups.find(item => item.id === groupId);
    return { group, child, kind: group?.kind || child };
  };
  const refreshStockFields = () => {
    const { kind } = selectedGroup();
    const hasHoldings = stockFields.childElementCount > 0;
    stockEditor.hidden = !(kind === "주식" || (kind === "연금" && row?.type === "stock") || hasHoldings);
    stockEditor.disabled = stockEditor.hidden;
    form.elements.amount.readOnly = hasHoldings || (originalHoldings.length > 0 && !stockEditor.hidden);
  };
  const addHoldingFields = (holding, focus = false) => {
    const fields = document.createElement("div");
    fields.className = "lab-stock-edit-item";
    fields.innerHTML = `<label>종목명<input data-stock="name" maxlength="100" required value="${escLab(holding ? labHoldingName(holding) : "")}"></label>
      <label>종목 코드<input data-stock="symbol" maxlength="40" required value="${escLab(holding?.symbol || "")}"></label>
      <label>수량<input data-stock="shares" type="number" min="0" step="any" required value="${holding ? toNumber(holding.shares) : ""}"></label>
      <label>단가 (원)<input data-stock="price" type="number" min="0" step="any" required value="${holding ? toNumber(holding.price) : ""}"></label>
      <button type="button" data-remove-holding>종목 삭제</button>`;
    holdingOriginals.set(fields, holding);
    stockFields.append(fields);
    fields.querySelector("[data-remove-holding]").onclick = () => {
      fields.remove();
      if (!stockFields.childElementCount && originalHoldings.length) form.elements.amount.value = 0;
      refreshStockFields();
      (stockEditor.hidden ? form.elements.amount : stockEditor.querySelector("[data-add-holding]")).focus();
    };
    refreshStockFields();
    if (focus) fields.querySelector('input[data-stock="name"]').focus();
  };
  for (const holding of originalHoldings) addHoldingFields(holding);
  refreshStockFields();
  form.elements.group.onchange = refreshStockFields;
  stockEditor.querySelector("[data-add-holding]").onclick = () => addHoldingFields(null, true);
  const retire = dialog.querySelector("[data-retire]");
  if (retire) retire.onclick = () => {
    if (!confirm("현재 보유 목록에서 삭제할까요? 과거 기록은 보관됩니다.")) return;
    row.retiredFrom = period;
    dialog.close();
    labPersist();
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;
    const { group, child, kind } = selectedGroup();
    const target = row || { id: crypto.randomUUID(), values: {} };
    if (stockFields.childElementCount && kind !== "주식" && kind !== "연금") {
      form.querySelector("[role=status]").textContent = "보유 종목을 먼저 정리해 주세요.";
      return;
    }
    const holdings = [...stockFields.children].map(fields => {
      const original = holdingOriginals.get(fields);
      const value = key => fields.querySelector(`[data-stock="${key}"]`).value.trim();
      const symbol = value("symbol").toUpperCase();
      const price = Number(value("price"));
      const sameQuote = original && symbol === original.symbol && price === toNumber(original.price);
      return { ...original, name: value("name"), symbol, price, shares: Number(value("shares")),
        updatedAt: sameQuote ? original.updatedAt : "", source: sameQuote ? original.source : "manual" };
    });
    if (holdings.some(holding => !holding.name || !holding.symbol)) {
      form.querySelector("[role=status]").textContent = "종목명과 종목 코드를 입력해 주세요.";
      return;
    }
    if (row) {
      target.labHistoricalKinds ||= {};
      for (const previous of recordedAssetPeriods().filter(value => value < period)) {
        target.labHistoricalKinds[previous] ??= assetCategoryKey(target, previous);
      }
    }
    Object.assign(target, {
      label: name, category: kind, labAccountingKind: kind, owner: form.elements.owner.value,
      debt: kind === "대출/부채", labGroup: group?.id || "", labSubcategory: group ? child : "",
      type: kind === "주식" || (kind === "연금" && (target.type === "stock" || holdings.length)) ? "stock" : "manual"
    });
    target.values ||= {};
    target.values[period] = Number(form.elements.amount.value) * (target.debt ? -1 : 1);
    if (!row) assetRows.push(target);
    if (target.type !== "stock" && record?.type === "stock") {
      delete investmentData[investmentKey(target.id, period)];
    } else if (holdings.length || originalHoldings.length) {
      setInvestment(target.id, period, { ...record, type: "stock", holdings, locked: true });
      syncInvestmentValue(target.id, period);
    }
    dialog.close();
    labPersist();
  };
}

function editLabCategories(id = "") {
  const group = labMetadata.groups.find(item => item.id === id);
  const dialog = labDialog(`<form><h2>분류 관리</h2>
    <label>분류 선택<select name="selected"><option value="">새 대분류</option>${labMetadata.groups.map(item => `<option value="${escLab(item.id)}" ${item.id === id ? "selected" : ""}>${escLab(item.name)}</option>`).join("")}</select></label>
    <label>대분류 이름<input name="name" maxlength="60" required value="${escLab(group?.name)}"></label>
    <label>집계 유형<select name="kind">${labKinds.map(kind => `<option ${kind === group?.kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label>
    ${(group?.children || []).map((child, index) => `<label>소분류<input name="child${index}" maxlength="60" value="${escLab(child)}"></label>`).join("")}
    <label>새 소분류 (한 줄에 하나)<textarea name="children" rows="3"></textarea></label>
    <div class="lab-actions"><button type="button" data-close>닫기</button>${group ? '<button type="button" data-remove>삭제</button>' : ""}<button class="primary">저장</button></div><p role="status"></p></form>`);
  const form = dialog.querySelector("form");
  form.elements.selected.onchange = () => editLabCategories(form.elements.selected.value);
  const used = () => labRows().filter(row => row.labGroup === id);
  const status = message => { form.querySelector("[role=status]").textContent = message; };
  const remove = dialog.querySelector("[data-remove]");
  if (remove) remove.onclick = () => {
    if (used().length) return status("이 분류의 자산을 먼저 다른 분류로 이동해 주세요.");
    labMetadata.groups = labMetadata.groups.filter(item => item.id !== id);
    dialog.close();
    labPersist();
  };
  form.onsubmit = event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const kind = form.elements.kind.value;
    const renamed = new Map((group?.children || []).map((child, index) => [child, form.elements[`child${index}`].value.trim()]));
    const children = [...renamed.values(), ...form.elements.children.value.split("\n").map(value => value.trim())].filter(Boolean);
    if (!name || labMetadata.groups.some(item => item.id !== id && item.name === name)) return status("고유한 대분류 이름을 입력해 주세요.");
    if (new Set(children).size !== children.length) return status("소분류 이름이 중복됩니다.");
    if (group?.kind !== kind && used().length) return status("집계 유형을 바꾸려면 자산을 먼저 이동해 주세요.");
    if (used().some(row => row.labSubcategory && !renamed.get(row.labSubcategory))) {
      return status("사용 중인 소분류의 자산을 먼저 이동해 주세요.");
    }
    used().forEach(row => { if (row.labSubcategory) row.labSubcategory = renamed.get(row.labSubcategory); });
    if (group) Object.assign(group, { name, kind, children });
    else labMetadata.groups.push({ id: crypto.randomUUID(), name, kind, children });
    dialog.close();
    labPersist();
  };
}

async function finalizeLabHistory(requestedPeriod) {
  const button = labField("labFinalize");
  const period = typeof requestedPeriod === "string" ? requestedPeriod : labField("labHistoryPeriod").value;
  if (labFinalizationInFlight || !period || period >= currentPeriod() || labMetadata.snapshots[period]) return;
  const status = labField("labHistoryStatus");
  labFinalizationInFlight = true;
  button.disabled = true;
  status.textContent = "월말 종가를 확인 중입니다.";
  const baseline = labMetadata;
  try {
    const rows = labPeriodRows(period);
    if (!rows.length) throw new Error("확정할 자산 기록이 없습니다.");
    for (const row of rows) {
      if (!row.stock) continue;
      if (row.amount && !row.holdings.length) throw new Error(`${row.name}의 당시 보유 수량 기록이 없습니다.`);
      for (const item of row.holdings) {
        if (!item.symbol || !Number.isFinite(Number(item.shares)) || Number(item.shares) < 0) throw new Error(`${row.name}의 종목 또는 수량을 확인해 주세요.`);
        const quote = await fetchPriceApi(`/api/close?symbol=${encodeURIComponent(item.symbol)}&month=${period}`);
        if (!(quote.price > 0) || !quote.date?.startsWith(period + "-")) throw new Error(`${item.symbol}의 월말 종가를 확인할 수 없습니다.`);
        item.price = quote.price;
        item.updatedAt = quote.date;
      }
      row.amount = Math.round(row.holdings.reduce((sum, item) => sum + Number(item.shares) * item.price, 0));
      if (row.investment) row.investment.holdings = row.holdings;
    }
    if (baseline !== labMetadata || labMetadata.snapshots[period]) throw new Error("기록이 갱신되었습니다. 다시 확인해 주세요.");
    labMetadata.snapshots[period] = { rows, totals: labTotals(rows), confirmedAt: new Date().toISOString() };
    labPersist();
    status.textContent = "월말 기록을 확정했습니다.";
  } catch (error) {
    status.textContent = `확정 실패 · ${error.message}`;
  } finally {
    labFinalizationInFlight = false;
    renderLabDashboard();
  }
}

function exportLabCsv(history = false) {
  const escape = value => {
    const text = typeof value === "string" && /^[\s]*[=+@-]/.test(value) ? "'" + value : String(value ?? "");
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [["기록 월", "자산", "대분류", "소분류", "소유자", "평가금액", "종목", "티커", "수량", "단가", "가격 기준일", "확정"]];
  const periods = history ? [...new Set([...recordedAssetPeriods(), ...Object.keys(labMetadata.snapshots)])].filter(period => period < currentPeriod()).sort(comparePeriods) : [currentPeriod()];
  for (const period of periods) {
    const snapshot = labMetadata.snapshots[period];
    const items = snapshot?.rows || labPeriodRows(period);
    for (const row of items) {
      for (const [index, item] of (row.holdings.length ? row.holdings : [{}]).entries()) {
        rows.push([period, row.name, row.category, row.subcategory, row.owner, index ? "" : row.amount, item.name, item.symbol, item.shares, item.price, item.updatedAt, snapshot ? "확정" : ""]);
      }
    }
    const totals = snapshot?.totals || labTotals(items);
    for (const [label, value] of [["총자산", totals.assets], ["총부채", totals.debt], ["순자산", totals.net]]) rows.push([period, label, "", "", "", value]);
  }
  const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(row => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = history ? "pension-lab-monthly.csv" : "pension-lab-holdings.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseLabSnapshot(raw) {
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  if (Array.isArray(parsed) && parsed.length !== 1) throw new Error("가족 데이터 한 행만 선택해 주세요.");
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  const data = typeof row?.data_json === "string" ? JSON.parse(row.data_json) : row?.data_json ?? row;
  if (!Array.isArray(data?.assetRows)) throw new Error("가족 자산의 data_json을 포함한 JSON 파일을 선택해 주세요.");
  for (const asset of data.assetRows) {
    if (!asset || typeof asset.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(asset.id) ||
        typeof asset.label !== "string" || typeof asset.category !== "string" || /[<>"&]/.test(asset.category)) {
      throw new Error("자산 식별자 또는 분류 형식이 올바르지 않습니다.");
    }
  }
  return data;
}

async function importLabSnapshot() {
  const input = labField("labSnapshotFile");
  const file = input.files[0];
  if (!file || SUPABASE_URL || SUPABASE_ANON_KEY || FAMILY_KEY) return;
  const status = labField("labSnapshotStatus");
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("20MB 이하의 JSON 백업을 선택해 주세요.");
    const data = parseLabSnapshot(await file.text());
    appStorage = labSessionStorage;
    labPrivateSnapshot = true;
    applyServerState(data);
    status.textContent = "백업을 열었습니다. 새로고침하면 다시 예시 데이터가 표시됩니다.";
  } catch (error) {
    status.textContent = `백업을 열 수 없습니다 · ${error.message}`;
  } finally {
    input.value = "";
  }
}

function downloadLabBackup() {
  const data = collectAppStateForServer();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pension-lab-backup-${currentPeriod()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initPensionLab() {
  try { restoreLabMetadata(JSON.parse(appStorage.getItem("pensionLabMetadata") || "null")); }
  catch { restoreLabMetadata(null); }
  const authRequired = Boolean(SUPABASE_URL || SUPABASE_ANON_KEY || FAMILY_KEY);
  labField("labSnapshotControls").hidden = authRequired;
  labField("labImportSnapshot").onclick = () => labField("labSnapshotFile").click();
  labField("labSnapshotFile").onchange = importLabSnapshot;
  for (const button of document.querySelectorAll("[data-lab-backup]")) {
    button.onclick = () => downloadLabBackup();
  }
  labField("labSyncLink").onclick = event => {
    event.preventDefault();
    if (isMobileLayout()) activateMobileView("settings", { scroll: false });
    else activateTab("assets");
    labField("serverSyncCard").scrollIntoView({ block: "start" });
  };
  labField("labFilter").onclick = event => {
    const button = event.target.closest("[data-lab-category]");
    if (!button) return;
    labFilterCategory = button.dataset.labCategory;
    renderLabDashboard();
  };
  labField("labSort").onchange = renderLabDashboard;
  const more = labField("labDashboardPanel").querySelector(".lab-more");
  more.querySelector(".lab-more-menu").addEventListener("click", event => {
    if (event.target.closest("button")) more.open = false;
  });
  document.addEventListener("click", event => {
    if (more.open && !more.contains(event.target)) more.open = false;
  });
  labField("labSearch").oninput = renderLabDashboard;
  labField("labAddAsset").onclick = () => editLabAsset();
  labField("labCategories").onclick = () => editLabCategories();
  labField("labHoldings").onclick = event => {
    const button = event.target.closest("[data-lab-edit]");
    if (button) editLabAsset(button.dataset.labEdit);
  };
  labField("labUpdatePrices").onclick = async () => {
    const button = labField("labUpdatePrices");
    button.disabled = true;
    try {
      await updateLatestYearPrices({ report: message => { labField("labStatus").textContent = message; } });
    } finally { button.disabled = false; }
  };
  labField("labHistoryPeriod").onchange = () => {
    labFilterCategory = "";
    labField("labSearch").value = "";
    labField("labHistoryStatus").textContent = "";
    renderLabDashboard();
  };
  labField("labFinalize").onclick = finalizeLabHistory;
  labField("labExportHoldings").onclick = () => exportLabCsv();
  labField("labExportHistory").onclick = () => exportLabCsv(true);
  if (isMobileLayout()) activateMobileView("labDashboard", { scroll: false });
  renderLabDashboard();
}
