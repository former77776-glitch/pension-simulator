    function supabaseConfigured() {
      return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
    }

    function serverSyncEnabled() {
      return serverSync.connected && serverSync.autoSave && supabaseConfigured();
    }

    function markLocalUpdated() {
      try {
        localStorage.setItem(SERVER_LOCAL_UPDATED_STORAGE_KEY, new Date().toISOString());
      } catch (_error) {
        // localStorage가 막힌 환경에서는 서버 충돌 비교만 건너뛴다.
      }
    }

    function serverStatusText(message = "") {
      const parts = [
        `마지막 서버 저장: ${formatDateTime(serverSync.lastSaveAt)}`,
        `마지막 서버 불러오기: ${formatDateTime(serverSync.lastLoadAt)}`
      ];
      return message ? `${message} · ${parts.join(" · ")}` : parts.join(" · ");
    }

    function setServerSyncStatus(message = "") {
      const badge = document.getElementById("serverSyncBadge");
      const meta = document.getElementById("serverSyncMeta");
      const login = document.getElementById("serverSyncLogin");
      const disabled = !serverSync.connected;
      ["loadFromServer", "saveToServer", "toggleAutoServerSave", "logoutServerSync"].forEach((id) => {
        const button = document.getElementById(id);
        if (button) button.disabled = disabled;
      });
      const autoButton = document.getElementById("toggleAutoServerSave");
      if (autoButton) autoButton.textContent = `자동 서버 저장 ${serverSync.autoSave ? "ON" : "OFF"}`;
      if (login) login.hidden = serverSync.connected;
      if (badge) {
        badge.textContent = serverSync.connected ? "서버 동기화: 연결됨" : "서버 동기화: 연결 안 됨";
        badge.className = `sync-badge ${serverSync.connected ? "connected" : "pending"}`;
      }
      if (meta) {
        if (!supabaseConfigured()) {
          meta.textContent = "Supabase URL과 anon key를 설정하면 서버 저장/불러오기를 사용할 수 있습니다.";
        } else if (!serverSync.connected) {
          meta.textContent = "가족 비밀번호를 입력하면 PC와 모바일에서 같은 자산 데이터를 볼 수 있습니다.";
        } else {
          meta.textContent = serverStatusText(message);
        }
      }
    }

    function loadServerSyncState() {
      try {
        const auth = JSON.parse(localStorage.getItem(SERVER_AUTH_STORAGE_KEY) || "null");
        serverSync.connected = Boolean(auth?.familyKey === FAMILY_KEY && auth?.token);
        serverSync.token = auth?.token || "";
        serverSync.autoSave = localStorage.getItem(SERVER_AUTO_SAVE_STORAGE_KEY) === "true";
        serverSync.lastSyncAt = localStorage.getItem(SERVER_LAST_SYNC_STORAGE_KEY) || "";
        serverSync.lastSaveAt = localStorage.getItem(SERVER_LAST_SAVE_STORAGE_KEY) || "";
        serverSync.lastLoadAt = localStorage.getItem(SERVER_LAST_LOAD_STORAGE_KEY) || "";
      } catch (_error) {
        serverSync = { connected: false, token: "", autoSave: false, lastSyncAt: "", lastSaveAt: "", lastLoadAt: "" };
      }
      setServerSyncStatus();
    }

    function collectPensionInputsForServer() {
      const values = {};
      for (const [key, input] of Object.entries(simInputs)) values[key] = input.value;
      return {
        values,
        autoRun: document.getElementById("autoRunPension")?.checked !== false
      };
    }

    function collectHousePlanForServer() {
      const values = {};
      for (const id of HOUSE_USER_INPUT_IDS) {
        const input = document.getElementById(id);
        if (input) values[id] = input.value;
      }
      return { values, ratios: { ...houseRatios } };
    }

    function parseServerNumber(value) {
      const number = typeof value === "number" ? value : toNumber(value);
      return Number.isFinite(number) ? number : NaN;
    }

    function normalizeServerMoney(value, fallback, badValues = []) {
      const number = parseServerNumber(value);
      const isBad = badValues.some((bad) => Math.abs(number - bad) < 1);
      return !Number.isFinite(number) || number <= 0 || isBad ? fallback : number;
    }

    function normalizeServerPercent(value, fallback) {
      const number = parseServerNumber(value);
      if (!Number.isFinite(number) || number <= 0) return fallback;
      return number <= 1 ? number * 100 : number;
    }

    function normalizeServerLtv(value) {
      const percent = normalizeServerPercent(value, HOUSE_DEFAULT_LTV);
      return percent > 100 ? HOUSE_DEFAULT_LTV : percent;
    }

    function normalizeServerLoanRate(value) {
      const percent = normalizeServerPercent(value, HOUSE_DEFAULT_LOAN_RATE);
      return percent > 30 ? HOUSE_DEFAULT_LOAN_RATE : percent;
    }

    function normalizeServerLoanYears(value) {
      const years = parseServerNumber(value);
      return !Number.isFinite(years) || years <= 0 || years > 100 ? HOUSE_DEFAULT_LOAN_YEARS : years;
    }

    function normalizeServerChoice(value, allowed, fallback) {
      return allowed.includes(value) ? value : fallback;
    }

    function normalizeHouseRatioState(ratios = {}) {
      const normalized = {};
      for (const item of HOUSE_RATIO_GROUPS) {
        const value = Number(ratios[item.key]);
        normalized[item.key] = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : item.defaultValue;
      }
      for (const [key, value] of Object.entries(ratios || {})) {
        if (Object.prototype.hasOwnProperty.call(normalized, key)) continue;
        const next = Number(value);
        if (Number.isFinite(next)) normalized[key] = Math.max(0, Math.min(100, next));
      }
      return normalized;
    }

    function isVisibleElement(element) {
      return Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
    }

    function getRealEstateFieldElements(field) {
      return Array.from(document.querySelectorAll(`[data-re-field="${field}"]`));
    }

    function getRealEstateFieldValue(field) {
      const elements = getRealEstateFieldElements(field).filter((element) => !element.disabled);
      const target = elements.find(isVisibleElement) || elements[0];
      if (!target) return undefined;
      if (target.type === "checkbox") return target.checked;
      return target.value;
    }

    function setRealEstateFieldValue(field, value) {
      for (const element of getRealEstateFieldElements(field)) {
        if (element.type === "checkbox") element.checked = Boolean(value);
        else element.value = value;
      }
    }

    function syncRealEstateFieldPeers(source) {
      const field = source?.dataset?.reField;
      if (!field) return;
      const value = source.type === "checkbox" ? source.checked : source.value;
      for (const element of getRealEstateFieldElements(field)) {
        if (element === source) continue;
        if (element.type === "checkbox") element.checked = Boolean(value);
        else element.value = value;
      }
    }

    function collectRealEstatePlanFromInputs() {
      const fieldValues = {
        targetHousePrice: getRealEstateFieldValue("targetHousePrice"),
        currentHouseSalePrice: getRealEstateFieldValue("currentHouseSalePrice"),
        ltvRate: getRealEstateFieldValue("ltvRate"),
        loanRate: getRealEstateFieldValue("loanRate"),
        loanYears: getRealEstateFieldValue("loanYears"),
        interiorCost: getRealEstateFieldValue("interiorCost"),
        reserveCash: getRealEstateFieldValue("reserveCash")
      };
      if (!collectRealEstatePlanFromInputs.lastDebugAt || Date.now() - collectRealEstatePlanFromInputs.lastDebugAt > 1000) {
        console.debug("realEstate mobile/desktop field values", fieldValues);
        collectRealEstatePlanFromInputs.lastDebugAt = Date.now();
      }
      return {
        ...fieldValues,
        disposeCurrentHouse: getRealEstateFieldValue("disposeCurrentHouse") !== "keep",
        houseCountType: getRealEstateFieldValue("houseCountType"),
        regulatedArea: getRealEstateFieldValue("regulatedArea"),
        over85sqm: getRealEstateFieldValue("over85sqm"),
        brokerageVatIncluded: getRealEstateFieldValue("brokerageVatIncluded") !== "no",
        liquidationRates: { ...houseRatios }
      };
    }

    function housePlanToRealEstatePlan(housePlan = collectHousePlanForServer()) {
      const values = housePlan?.values && typeof housePlan.values === "object" ? housePlan.values : {};
      return normalizeRealEstatePlan({
        targetHousePrice: values.housePrice,
        disposeCurrentHouse: (values.houseScenarioSelect || "keep") !== "keep",
        currentHouseSalePrice: values.existingHomePrice,
        ltvRate: values.houseLtv,
        loanRate: values.houseLoanRate,
        loanYears: values.houseLoanYears,
        interiorCost: values.houseInterior,
        reserveCash: values.houseReserve,
        houseCountType: values.houseCountType,
        regulatedArea: values.houseRegulated,
        over85sqm: values.houseAreaOver85,
        brokerageVatIncluded: (values.houseBrokerVat || "yes") !== "no",
        liquidationRates: housePlan?.ratios
      });
    }

    function normalizeRealEstatePlan(realEstatePlan = {}) {
      const plan = realEstatePlan && typeof realEstatePlan === "object" ? realEstatePlan : {};
      return {
        targetHousePrice: normalizeServerMoney(plan.targetHousePrice, HOUSE_DEFAULT_PRICE),
        currentHouseSalePrice: normalizeServerMoney(plan.currentHouseSalePrice, 465000000),
        ltvRate: normalizeServerLtv(plan.ltvRate),
        loanRate: normalizeServerLoanRate(plan.loanRate),
        loanYears: normalizeServerLoanYears(plan.loanYears),
        interiorCost: normalizeServerMoney(plan.interiorCost, HOUSE_DEFAULT_INTERIOR, HOUSE_BAD_COST_VALUES),
        reserveCash: normalizeServerMoney(plan.reserveCash, HOUSE_DEFAULT_RESERVE, HOUSE_BAD_COST_VALUES),
        disposeCurrentHouse: typeof plan.disposeCurrentHouse === "boolean" ? plan.disposeCurrentHouse : false,
        houseCountType: normalizeServerChoice(plan.houseCountType, ["one", "temporaryTwo", "multi"], "one"),
        regulatedArea: normalizeServerChoice(plan.regulatedArea, ["no", "yes"], "no"),
        over85sqm: normalizeServerChoice(plan.over85sqm, ["no", "yes"], "yes"),
        brokerageVatIncluded: typeof plan.brokerageVatIncluded === "boolean" ? plan.brokerageVatIncluded : true,
        liquidationRates: normalizeHouseRatioState(plan.liquidationRates),
        updatedAt: plan.updatedAt || new Date().toISOString()
      };
    }

    function realEstatePlanToHousePlan(realEstatePlan, fallbackHousePlan = {}) {
      const fallbackValues = fallbackHousePlan?.values && typeof fallbackHousePlan.values === "object" ? fallbackHousePlan.values : {};
      const fallbackPlan = fallbackValues
        ? {
            targetHousePrice: fallbackValues.housePrice,
            disposeCurrentHouse: (fallbackValues.houseScenarioSelect || "keep") !== "keep",
            currentHouseSalePrice: fallbackValues.existingHomePrice,
            ltvRate: fallbackValues.houseLtv,
            loanRate: fallbackValues.houseLoanRate,
            loanYears: fallbackValues.houseLoanYears,
            interiorCost: fallbackValues.houseInterior,
            reserveCash: fallbackValues.houseReserve,
            houseCountType: fallbackValues.houseCountType,
            regulatedArea: fallbackValues.houseRegulated,
            over85sqm: fallbackValues.houseAreaOver85,
            brokerageVatIncluded: (fallbackValues.houseBrokerVat || "yes") !== "no",
            liquidationRates: fallbackHousePlan?.ratios
          }
        : {};
      const clean = normalizeRealEstatePlan({ ...fallbackPlan, ...(realEstatePlan || {}) });
      return {
        values: {
          housePrice: won(clean.targetHousePrice),
          houseScenarioSelect: clean.disposeCurrentHouse ? "sell" : "keep",
          existingHomePrice: won(clean.currentHouseSalePrice),
          houseLtv: `${clean.ltvRate.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`,
          houseLoanRate: `${clean.loanRate.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`,
          houseLoanYears: String(clean.loanYears),
          houseInterior: won(clean.interiorCost),
          houseReserve: won(clean.reserveCash),
          houseCountType: clean.houseCountType,
          houseRegulated: clean.regulatedArea,
          houseAreaOver85: clean.over85sqm,
          houseBrokerVat: clean.brokerageVatIncluded ? "yes" : "no"
        },
        ratios: clean.liquidationRates
      };
    }

    function applyRealEstatePlanToInputs(realEstatePlan) {
      const clean = normalizeRealEstatePlan(realEstatePlan);
      const housePlan = realEstatePlanToHousePlan(clean);
      setRealEstateFieldValue("targetHousePrice", won(clean.targetHousePrice));
      setRealEstateFieldValue("disposeCurrentHouse", clean.disposeCurrentHouse ? "sell" : "keep");
      setRealEstateFieldValue("currentHouseSalePrice", won(clean.currentHouseSalePrice));
      setRealEstateFieldValue("ltvRate", `${clean.ltvRate.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`);
      setRealEstateFieldValue("loanRate", `${clean.loanRate.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`);
      setRealEstateFieldValue("loanYears", String(clean.loanYears));
      setRealEstateFieldValue("interiorCost", won(clean.interiorCost));
      setRealEstateFieldValue("reserveCash", won(clean.reserveCash));
      setRealEstateFieldValue("houseCountType", clean.houseCountType);
      setRealEstateFieldValue("regulatedArea", clean.regulatedArea);
      setRealEstateFieldValue("over85sqm", clean.over85sqm);
      setRealEstateFieldValue("brokerageVatIncluded", clean.brokerageVatIncluded ? "yes" : "no");
      Object.assign(houseRatios, normalizeHouseRatioState(housePlan.ratios));
      renderHouseRatioControls();
      updateHouseReadableHints();
      persistHousePlanInputs(true);
      return housePlan;
    }

    function resolveServerHousePlan(data) {
      const fallbackHousePlan = data?.housePlan && typeof data.housePlan === "object" ? data.housePlan : {};
      if (data?.realEstatePlan && typeof data.realEstatePlan === "object") return realEstatePlanToHousePlan(data.realEstatePlan, fallbackHousePlan);
      if (fallbackHousePlan.values || fallbackHousePlan.ratios) return realEstatePlanToHousePlan(housePlanToRealEstatePlan(fallbackHousePlan), fallbackHousePlan);
      return null;
    }

    function collectAppStateForServer() {
      const housePlan = collectHousePlanForServer();
      const realEstatePlan = normalizeRealEstatePlan(collectRealEstatePlanFromInputs());
      if (!collectAppStateForServer.lastRealEstateDebugAt || Date.now() - collectAppStateForServer.lastRealEstateDebugAt > 3000) {
        console.debug("realEstatePlan before server save", realEstatePlan);
        collectAppStateForServer.lastRealEstateDebugAt = Date.now();
      }
      return {
        schemaVersion: 2,
        serverStateVersion: 2,
        savedAt: new Date().toISOString(),
        assetRows,
        assetPeriods,
        assetFutureBackup,
        assetArchivedPeriods,
        investmentData,
        pension: collectPensionInputsForServer(),
        housePlan,
        realEstatePlan,
        retirementPlan: collectRetirementPlanForServer()
      };
    }

    function persistServerStateToLocalStorage(data) {
      if (!data || typeof data !== "object") return;
      if (Array.isArray(data.assetRows)) localStorage.setItem("pensionAssetRows", JSON.stringify(data.assetRows));
      if (data.investmentData && typeof data.investmentData === "object") localStorage.setItem("pensionInvestmentData", JSON.stringify(data.investmentData));
      if (Array.isArray(data.assetPeriods)) localStorage.setItem("pensionAssetPeriods", JSON.stringify(data.assetPeriods));
      if (data.assetFutureBackup && typeof data.assetFutureBackup === "object") localStorage.setItem("pensionAssetFutureBackup", JSON.stringify(data.assetFutureBackup));
      if (data.assetArchivedPeriods && typeof data.assetArchivedPeriods === "object") localStorage.setItem("pensionAssetArchivedPeriods", JSON.stringify(data.assetArchivedPeriods));
      const serverHousePlan = resolveServerHousePlan(data);
      if (serverHousePlan) localStorage.setItem(HOUSE_PLAN_STORAGE_KEY, JSON.stringify(serverHousePlan));
      localStorage.setItem(RETIREMENT_PLAN_STORAGE_KEY, JSON.stringify(normalizeRetirementPlan(data.retirementPlan || RETIREMENT_PLAN_DEFAULTS)));
    }

    function applyServerState(data) {
      if (!data || typeof data !== "object") throw new Error("서버 데이터 형식이 올바르지 않습니다.");
      if (Array.isArray(data.assetRows)) {
        assetRows = data.assetRows;
        normalizeAssetRowPeriods(assetRows);
      }
      if (Array.isArray(data.assetPeriods)) assetPeriods = data.assetPeriods.filter(isValidPeriod).sort(comparePeriods);
      if (!assetPeriods.length) assetPeriods = buildAssetPeriods(2024);
      assetFutureBackup = data.assetFutureBackup && typeof data.assetFutureBackup === "object" ? data.assetFutureBackup : {};
      assetArchivedPeriods = data.assetArchivedPeriods && typeof data.assetArchivedPeriods === "object" ? data.assetArchivedPeriods : {};
      investmentData = data.investmentData && typeof data.investmentData === "object" ? normalizeInvestmentPeriods(data.investmentData) : {};
      persistServerStateToLocalStorage(data);
      if (data.pension?.values && typeof data.pension.values === "object") {
        for (const [key, value] of Object.entries(data.pension.values)) {
          if (simInputs[key]) simInputs[key].value = value;
        }
        const auto = document.getElementById("autoRunPension");
        if (auto) auto.checked = data.pension.autoRun !== false;
      }
      const serverHousePlan = resolveServerHousePlan(data);
      if (serverHousePlan) {
        localStorage.setItem(HOUSE_PLAN_STORAGE_KEY, JSON.stringify(serverHousePlan));
        applyRealEstatePlanToInputs(data?.realEstatePlan && typeof data.realEstatePlan === "object" ? data.realEstatePlan : housePlanToRealEstatePlan(serverHousePlan));
      }
      applyRetirementPlanState(data.retirementPlan || RETIREMENT_PLAN_DEFAULTS, { persist: true, render: false });
      const startInput = document.getElementById("assetStartYear");
      const endInput = document.getElementById("assetEndYear");
      if (startInput) startInput.value = periodYear(assetPeriods[0] || currentPeriod());
      if (endInput) endInput.value = periodLabel(assetPeriods.at(-1) || latestManagedPeriod());
      selectedInvestment = null;
      suppressServerAutoSave = true;
      try {
        renderAssetTable();
        renderInvestmentPanel();
        updateSimCompactHints();
        runPension();
        renderHousePlan();
        renderRetirementPlan();
      } finally {
        suppressServerAutoSave = false;
      }
    }

    function supabaseHeaders(extra = {}) {
      return {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        ...extra
      };
    }

    function familyAssetUrl(query = "") {
      const base = SUPABASE_URL.replace(/\/$/, "");
      return `${base}/rest/v1/${FAMILY_ASSETS_TABLE}${query}`;
    }

    async function fetchServerAssetRow() {
      if (!supabaseConfigured()) throw new Error("Supabase URL과 anon key를 먼저 설정하세요.");
      const query = `?family_key=eq.${encodeURIComponent(FAMILY_KEY)}&select=data_json,updated_at&limit=1`;
      const response = await fetch(familyAssetUrl(query), { headers: supabaseHeaders() });
      if (!response.ok) throw new Error(`서버 조회 실패 (${response.status})`);
      const rows = await response.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    }

    async function upsertServerAssetRow(data) {
      if (!supabaseConfigured()) throw new Error("Supabase URL과 anon key를 먼저 설정하세요.");
      const response = await fetch(familyAssetUrl("?on_conflict=family_key&select=updated_at"), {
        method: "POST",
        headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=representation" }),
        body: JSON.stringify({
          family_key: FAMILY_KEY,
          data_json: data,
          updated_at: new Date().toISOString()
        })
      });
      if (!response.ok) throw new Error(`서버 저장 실패 (${response.status})`);
      const rows = await response.json();
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    }

    function requireServerConnection() {
      if (!serverSync.connected) {
        setServerSyncStatus("가족 비밀번호 연결이 필요합니다.");
        return false;
      }
      if (!supabaseConfigured()) {
        setServerSyncStatus("Supabase 설정이 필요합니다.");
        return false;
      }
      return true;
    }

    async function connectFamilySync() {
      const input = document.getElementById("familyPasswordInput");
      const remember = document.getElementById("rememberFamilyDevice")?.checked !== false;
      const password = input?.value || "";
      if (!password.trim()) {
        setServerSyncStatus("가족 비밀번호를 입력하세요.");
        return;
      }
      try {
        const token = await sha256(`${FAMILY_KEY}:${password}`);
        const passwordHash = await sha256(password);
        if (FAMILY_PASSWORD_SHA256 && passwordHash !== FAMILY_PASSWORD_SHA256) {
          setServerSyncStatus("가족 비밀번호가 맞지 않습니다.");
          return;
        }
        serverSync.connected = true;
        serverSync.token = token;
        if (remember) {
          localStorage.setItem(SERVER_AUTH_STORAGE_KEY, JSON.stringify({ familyKey: FAMILY_KEY, token, connectedAt: new Date().toISOString() }));
        } else {
          localStorage.removeItem(SERVER_AUTH_STORAGE_KEY);
        }
        if (input) input.value = "";
        setServerSyncStatus(FAMILY_PASSWORD_SHA256 ? "서버 동기화가 연결되었습니다." : "서버 동기화가 연결되었습니다. 배포 전 가족 비밀번호 해시를 설정하세요.");
      } catch (error) {
        setServerSyncStatus(`연결 실패: ${error.message}`);
      }
    }

    async function loadFromServer() {
      if (!requireServerConnection()) return;
      try {
        setServerSyncStatus("서버에서 불러오는 중입니다.");
        const row = await fetchServerAssetRow();
        if (!row?.data_json) {
          setServerSyncStatus("서버에 저장된 데이터가 없습니다.");
          return;
        }
        const localUpdatedAt = localStorage.getItem(SERVER_LOCAL_UPDATED_STORAGE_KEY) || "";
        if (row.updated_at && localUpdatedAt && new Date(row.updated_at) > new Date(localUpdatedAt)) {
          const ok = confirm("서버 데이터가 현재 기기 데이터보다 최신일 수 있습니다. 서버 데이터로 덮어쓸까요?");
          if (!ok) {
            setServerSyncStatus("서버 불러오기를 취소했습니다.");
            return;
          }
        }
        applyServerState(row.data_json);
        const now = new Date().toISOString();
        serverSync.lastLoadAt = now;
        serverSync.lastSyncAt = row.updated_at || now;
        localStorage.setItem(SERVER_LAST_LOAD_STORAGE_KEY, serverSync.lastLoadAt);
        localStorage.setItem(SERVER_LAST_SYNC_STORAGE_KEY, serverSync.lastSyncAt);
        localStorage.setItem(SERVER_LOCAL_UPDATED_STORAGE_KEY, serverSync.lastSyncAt);
        setServerSyncStatus("서버 데이터를 불러왔습니다.");
      } catch (error) {
        setServerSyncStatus(`서버 불러오기 실패: ${error.message}`);
      }
    }

    async function saveToServer({ skipConflictCheck = false, silent = false } = {}) {
      if (!requireServerConnection() || serverSaveInFlight) return;
      try {
        serverSaveInFlight = true;
        if (!silent) setServerSyncStatus("서버에 저장하는 중입니다.");
        if (!skipConflictCheck) {
          const row = await fetchServerAssetRow();
          if (row?.updated_at && (!serverSync.lastSyncAt || new Date(row.updated_at) > new Date(serverSync.lastSyncAt))) {
            if (silent) {
              setServerSyncStatus("서버에 더 최신 데이터가 있어 자동 저장을 건너뛰었습니다.");
              return;
            }
            const ok = confirm("서버에 더 최신 데이터가 있습니다. 현재 기기 데이터로 서버를 덮어쓸까요?");
            if (!ok) {
              setServerSyncStatus("서버 저장을 취소했습니다.");
              return;
            }
          }
        }
        const row = await upsertServerAssetRow(collectAppStateForServer());
        const now = row?.updated_at || new Date().toISOString();
        serverSync.lastSaveAt = now;
        serverSync.lastSyncAt = now;
        localStorage.setItem(SERVER_LAST_SAVE_STORAGE_KEY, serverSync.lastSaveAt);
        localStorage.setItem(SERVER_LAST_SYNC_STORAGE_KEY, serverSync.lastSyncAt);
        localStorage.setItem(SERVER_LOCAL_UPDATED_STORAGE_KEY, now);
        setServerSyncStatus("서버 저장됨");
      } catch (error) {
        setServerSyncStatus(`서버 저장 실패: ${error.message}`);
      } finally {
        serverSaveInFlight = false;
      }
    }

    function scheduleServerAutoSave() {
      if (suppressServerAutoSave) return;
      markLocalUpdated();
      if (!serverSyncEnabled()) return;
      if (!appBootstrapped) {
        pendingServerAutoSaveAfterBoot = true;
        return;
      }
      window.clearTimeout(serverSaveTimer);
      serverSaveTimer = window.setTimeout(() => saveToServer({ silent: true }), SERVER_SYNC_DEBOUNCE_MS);
    }

    function toggleAutoServerSave() {
      serverSync.autoSave = !serverSync.autoSave;
      localStorage.setItem(SERVER_AUTO_SAVE_STORAGE_KEY, serverSync.autoSave ? "true" : "false");
      setServerSyncStatus(serverSync.autoSave ? "자동 서버 저장이 켜졌습니다." : "자동 서버 저장이 꺼졌습니다.");
    }

    function logoutServerSync() {
      window.clearTimeout(serverSaveTimer);
      localStorage.removeItem(SERVER_AUTH_STORAGE_KEY);
      serverSync.connected = false;
      serverSync.token = "";
      setServerSyncStatus("이 기기의 서버 인증만 해제했습니다.");
    }
