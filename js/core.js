    const SUPABASE_URL = window.PENSION_LAB_CONFIG?.supabaseUrl || "";
    const SUPABASE_ANON_KEY = window.PENSION_LAB_CONFIG?.supabaseAnonKey || "";
    const FAMILY_ASSETS_TABLE = "family_assets";
    const FAMILY_KEY = window.PENSION_LAB_CONFIG?.familyKey || "";
    const supabaseClient = SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, detectSessionInUrl: false } })
      : null;
    const labMemory = new Map();
    const appStorage = supabaseClient ? {
      getItem: (key) => labMemory.get(key) ?? null,
      setItem: (key, value) => labMemory.set(key, String(value)),
      removeItem: (key) => labMemory.delete(key)
    } : window.localStorage;
    const SERVER_AUTH_STORAGE_KEY = "pensionServerSyncAuth";
    const SERVER_AUTO_SAVE_STORAGE_KEY = "pensionServerAutoSave";
    const SERVER_LAST_SYNC_STORAGE_KEY = "pensionServerLastSyncAt";
    const SERVER_LAST_SAVE_STORAGE_KEY = "pensionServerLastSaveAt";
    const SERVER_LAST_LOAD_STORAGE_KEY = "pensionServerLastLoadAt";
    const SERVER_LOCAL_UPDATED_STORAGE_KEY = "pensionLocalUpdatedAt";
    const SERVER_SYNC_DEBOUNCE_MS = 800;
    const HOUSE_DEFAULT_INTERIOR = 150000000;
    const HOUSE_DEFAULT_RESERVE = 50000000;

    const ASSET_ROWS = supabaseClient ? [] : [
      { id: "demo-home", category: "부동산", label: "예시 아파트", type: "manual", owner: "공동", values: { 2024: 420000000, 2025: 460000000, [currentPeriod()]: 500000000 } },
      { id: "demo-stock", category: "주식", label: "예시 ETF", type: "stock", owner: "본인", values: { 2024: 60000000, 2025: 76000000, [currentPeriod()]: 94000000 } },
      { id: "demo-cash", category: "현금", label: "예시 예금", type: "manual", owner: "아내", values: { 2024: 40000000, 2025: 54000000, [currentPeriod()]: 68000000 } },
      { id: "demo-loan", category: "대출/부채", label: "예시 주택담보대출", debt: true, type: "manual", owner: "공동", values: { 2024: -190000000, 2025: -175000000, [currentPeriod()]: -160000000 } }
    ];

    const HOLDINGS = [
      { bucket: "retirementStock", name: "삼성전자", symbol: "005930.KS", shares: 0, price: 0, updatedAt: "" },
      { bucket: "hynixStock", name: "SK하이닉스", symbol: "000660.KS", shares: 0, price: 0, updatedAt: "" }
    ];

    const SYMBOL_ALIASES = {
      "삼성전자": { name: "삼성전자", symbol: "005930.KS" },
      "삼전": { name: "삼성전자", symbol: "005930.KS" },
      "sk하이닉스": { name: "SK하이닉스", symbol: "000660.KS" },
      "하이닉스": { name: "SK하이닉스", symbol: "000660.KS" },
      "tiger미국s&p500": { name: "TIGER 미국S&P500", symbol: "360750.KS" },
      "tiger미국sp500": { name: "TIGER 미국S&P500", symbol: "360750.KS" },
      "tiger s&p500": { name: "TIGER 미국S&P500", symbol: "360750.KS" },
      "tiger sp500": { name: "TIGER 미국S&P500", symbol: "360750.KS" },
      "sol미국s&p500미국채혼합50": { name: "SOL 미국S&P500미국채혼합50", symbol: "0080X0.KS" },
      "sol미국sp500미국채혼합50": { name: "SOL 미국S&P500미국채혼합50", symbol: "0080X0.KS" },
      "미국s&p500미국채혼합50": { name: "SOL 미국S&P500미국채혼합50", symbol: "0080X0.KS" },
      "미국sp500미국채혼합50": { name: "SOL 미국S&P500미국채혼합50", symbol: "0080X0.KS" },
      "미국s&p500": { name: "TIGER 미국S&P500", symbol: "360750.KS" },
      "미국sp500": { name: "TIGER 미국S&P500", symbol: "360750.KS" }
    };

    const LOCAL_SEARCH_LIST = [
      {
        name: "SK하이닉스",
        symbol: "000660.KS",
        aliases: ["하이닉스", "sk하이닉스", "sk hynix", "hynix", "000660", "에스케이하이닉스"]
      },
      {
        name: "삼성전자",
        symbol: "005930.KS",
        aliases: ["삼성", "삼성전자", "삼전", "samsung electronics", "samsung", "005930"]
      },
      {
        name: "TIGER 미국S&P500",
        symbol: "360750.KS",
        aliases: ["tiger", "tiger미국s&p500", "tiger s&p500", "tiger sp500", "미국s&p500", "미국sp500", "s&p500", "sp500", "360750"]
      },
      {
        name: "SOL 미국S&P500미국채혼합50",
        symbol: "0080X0.KS",
        aliases: ["sol", "sol미국s&p500미국채혼합50", "sol 미국s&p500 미국채혼합50", "미국채혼합", "미국채혼합50", "미국s&p500미국채혼합50", "0080x0"]
      }
    ];

    let assetRows = structuredClone(ASSET_ROWS);
    let assetPeriods = [];
    let assetFutureBackup = {};
    let assetArchivedPeriods = {};
    let pensionRows = [];
    let investmentData = {};
    let selectedInvestment = null;
    let currentSearchResults = [];
    let selectedHoldingCandidate = null;
    let activeSearchIndex = -1;
    let searchRequestId = 0;
    let assetNetChartInstance = null;
    let assetMixChartInstance = null;
    let assetCompositionChartInstance = null;
    let housePlanChartInstance = null;
    let serverSync = { connected: false, token: "", autoSave: false, lastSyncAt: "", lastSaveAt: "", lastLoadAt: "" };
    let serverSaveTimer = null;
    let serverSaveInFlight = false;
    let appBootstrapped = false;
    let suppressServerAutoSave = false;
    let pendingServerAutoSaveAfterBoot = false;

    const HOUSE_PLAN_STORAGE_KEY = "pensionHousePlanInputs";
    const HOUSE_DEFAULT_PRICE = 1600000000;
    const HOUSE_DEFAULT_LTV = 60;
    const HOUSE_DEFAULT_LOAN_RATE = 4.5;
    const HOUSE_DEFAULT_LOAN_YEARS = 30;
    const HOUSE_BAD_COST_VALUES = [12320000, 2024000, 2046000];
    const HOUSE_USER_INPUT_IDS = [
      "housePrice",
      "houseScenarioSelect",
      "existingHomePrice",
      "houseLtv",
      "houseLoanRate",
      "houseLoanYears",
      "houseCountType",
      "houseRegulated",
      "houseAreaOver85",
      "houseBrokerVat",
      "houseInterior",
      "houseReserve"
    ];
    const HOUSE_RATIO_GROUPS = [
      { key: "cash", label: "현금", defaultValue: 100 },
      { key: "stock", label: "주식", defaultValue: 100 },
      { key: "pension", label: "연금", defaultValue: 0 },
      { key: "gold", label: "금", defaultValue: 100 },
      { key: "home", label: "기존 아파트 처분가", defaultValue: 100 }
    ];
    const houseRatios = Object.fromEntries(HOUSE_RATIO_GROUPS.map((item) => [item.key, item.defaultValue]));

    const FIELD_GROUPS = [
      ["나이 입력", [
        ["start_age", "시작 나이", "60", "age"],
        ["end_age", "종료 나이", "90", "age"],
        ["national_pension_start_age", "국민연금 시작 나이", "68", "age"]
      ]],
      ["연금 원액", [
        ["private_balance", "개인연금 원액", "500,000,000원", "money"],
        ["irp_retire_balance", "IRP 퇴직재원", "600,000,000원", "money"],
        ["irp_taxable_balance", "IRP 과세재원", "600,000,000원", "money"]
      ]],
      ["연간 수령액", [
        ["target_net_cash", "목표 연간 실수령액", "80,000,000원", "money"],
        ["private_annual_withdrawal", "개인연금 연간 수령액", "15,000,000원", "money"],
        ["national_pension_annual", "국민연금 연간액", "24,840,000원", "money"],
        ["nhis_fixed_monthly", "월 건강보험료", "400,000원", "money"]
      ]],
      ["정밀 예측", [
        ["target_growth_rate", "목표 생활비 증가율", "2.0%", "percent"],
        ["national_pension_growth", "국민연금 증가율", "2.0%", "percent"],
        ["one_time_expense_age", "일시 지출 나이", "70", "age"],
        ["one_time_expense_amount", "일시 지출 금액", "0원", "money"]
      ]],
      ["수익률/세금", [
        ["private_return", "개인연금 수익률", "8%", "percent"],
        ["irp_retire_return", "IRP 퇴직재원 수익률", "5.0%", "percent"],
        ["irp_taxable_return", "IRP 과세재원 수익률", "5.0%", "percent"],
        ["irp_retire_effective_tax", "퇴직소득 유효세율", "3.0%", "percent"]
      ]]
    ];

    const SIM_COLUMNS = ["나이", "연금 수령 연차", "실수령액", "총 잔액", "총 과세", "일시 지출", "국민연금", "IRP(퇴직재원)", "IRP(과세재원)", "개인연금", "총수령액", "세금", "건보료", "개인연금 잔액", "IRP(과세재원) 잔액", "IRP(퇴직재원) 잔액", "경고"];
    const SIM_MONEY = new Set(SIM_COLUMNS.slice(2).filter((column) => column !== "경고"));
    const NATIONAL_PENSION_LEGAL_START_AGE = 65;
    const NATIONAL_PENSION_GAP_START_AGE = 55;
    const NATIONAL_PENSION_DELAY_BONUS_PER_YEAR = 0.072;
    const NATIONAL_PENSION_DELAY_BONUS_MAX = 0.36;
    const simInputs = {};
    const simDefaults = {};

    function toNumber(value) {
      if (typeof value === "number") return value;
      let text = String(value || "").trim().replaceAll(",", "").replaceAll(" ", "").replaceAll("₩", "").replaceAll("원", "").replaceAll("%", "");
      if (!text) return 0;
      const wrappedNegative = text.startsWith("(") && text.endsWith(")");
      text = text.replace(/[()]/g, "");
      const sign = wrappedNegative || text.startsWith("-") ? -1 : 1;
      text = text.replace(/^[+-]/, "");
      let total = 0;
      let matched = false;
      const eok = text.match(/(\d+(?:\.\d+)?)억/);
      if (eok) { total += Number(eok[1]) * 100000000; text = text.replace(eok[0], ""); matched = true; }
      const man = text.match(/(\d+(?:\.\d+)?)만/);
      if (man) { total += Number(man[1]) * 10000; text = text.replace(man[0], ""); matched = true; }
      if (text) { total += Number(text) || 0; matched = true; }
      return matched ? sign * total : 0;
    }

    function won(value) {
      const rounded = Math.round(value || 0);
      const formatted = `₩${Math.abs(rounded).toLocaleString("ko-KR")}`;
      return rounded < 0 ? `(${formatted})` : formatted;
    }

    function compactWon(value) {
      const abs = Math.abs(value || 0);
      const sign = value < 0 ? "-" : "";
      if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(1)}억`;
      if (abs >= 10000) return `${sign}${Math.round(abs / 10000).toLocaleString("ko-KR")}만`;
      return won(value);
    }

    function formatKoreanWonReadable(value) {
      const rounded = Math.round(Math.abs(value || 0));
      const sign = value < 0 ? "-" : "";
      const eok = Math.floor(rounded / 100000000);
      const man = Math.floor((rounded % 100000000) / 10000);
      const parts = [];
      if (eok) parts.push(`${eok.toLocaleString("ko-KR")}억`);
      if (man) {
        if (eok && man % 1000 === 0) parts.push(`${man / 1000}천만`);
        else parts.push(`${man.toLocaleString("ko-KR")}만`);
      }
      return sign + (parts.join(" ") || won(value));
    }

    function formatDateTime(value) {
      if (!value) return "-";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "-";
      const pad = (n) => String(n).padStart(2, "0");
      return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    async function sha256(text) {
      if (!window.crypto?.subtle) {
        let hash = 5381;
        for (const char of String(text || "")) hash = ((hash << 5) + hash) + char.charCodeAt(0);
        return `fallback-${Math.abs(hash >>> 0).toString(16)}`;
      }
      const data = new TextEncoder().encode(String(text || ""));
      const digest = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }


    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function pct(value) {
      if (!Number.isFinite(value)) return "-";
      return `${(value * 100).toFixed(1)}%`;
    }

    const MONTHLY_RECORD_START_PERIOD = "2026-06";

    function pad2(value) {
      return String(value).padStart(2, "0");
    }

    function currentPeriod() {
      const now = new Date();
      return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    }

    function previousMonthPeriod(period = currentPeriod()) {
      const [year, month] = String(period).split("-").map(Number);
      const date = new Date(year, month - 2, 1);
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    }

    function periodYear(period) {
      return Number(String(period).slice(0, 4));
    }

    function periodMonth(period) {
      return Number(String(period).slice(5, 7));
    }

    function periodLabel(period) {
      const year = periodYear(period);
      const month = periodMonth(period);
      if (month === 12 && year < new Date().getFullYear()) return String(year);
      return String(period).replace("-", ".");
    }

    function periodTitle(period) {
      const year = periodYear(period);
      const month = periodMonth(period);
      if (month === 12 && year < new Date().getFullYear()) return `${year}년 말`;
      return periodLabel(period);
    }

    function isValidPeriod(value) {
      return /^\d{4}-\d{2}$/.test(String(value || ""));
    }

    function comparePeriods(a, b) {
      return String(a).localeCompare(String(b));
    }

    function isCurrentMonthEnd() {
      const now = new Date();
      return now.getDate() === new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    }

    function periodForLegacyYear(year) {
      const currentYear = new Date().getFullYear();
      const numericYear = Number(year);
      if (!Number.isFinite(numericYear)) return null;
      if (numericYear < currentYear) return `${numericYear}-12`;
      if (numericYear === currentYear) return currentPeriod();
      return null;
    }

    function buildAssetPeriods(startYear = 2024) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const monthlyStartYear = periodYear(MONTHLY_RECORD_START_PERIOD);
      const monthlyStartMonth = periodMonth(MONTHLY_RECORD_START_PERIOD);
      const periods = [];
      for (let year = startYear; year < currentYear; year += 1) periods.push(`${year}-12`);
      const startMonth = currentYear === monthlyStartYear ? monthlyStartMonth : 1;
      for (let month = startMonth; month <= currentMonth; month += 1) {
        const period = `${currentYear}-${pad2(month)}`;
        if (comparePeriods(period, MONTHLY_RECORD_START_PERIOD) >= 0) periods.push(period);
      }
      return [...new Set(periods)].sort(comparePeriods);
    }

    function latestManagedPeriod() {
      const period = currentPeriod();
      return assetPeriods.includes(period) ? period : (assetPeriods.at(-1) || period);
    }

    let periodViewMode = "summary";

    function recordedAssetPeriods() {
      const periods = new Set();
      for (const row of assetRows) Object.keys(row.values || {}).forEach((period) => periods.add(period));
      Object.keys(investmentData).forEach((key) => periods.add(key.split(":")[1]));
      for (const values of Object.values(assetArchivedPeriods.rows || {})) Object.keys(values).forEach((period) => periods.add(period));
      for (const values of Object.values(assetArchivedPeriods.investmentData || {})) Object.keys(values).forEach((period) => periods.add(period));
      return [...periods].filter((period) => isValidPeriod(period) && periodMonth(period) >= 1 && periodMonth(period) <= 12 && comparePeriods(period, currentPeriod()) <= 0).sort(comparePeriods);
    }

    function selectSummaryPeriods(periods, year = new Date().getFullYear()) {
      const sorted = [...new Set(periods)].sort(comparePeriods);
      const annual = [year - 3, year - 2, year - 1].map((completedYear) => sorted.filter((period) => periodYear(period) === completedYear).at(-1)).filter(Boolean);
      return [...new Set([...annual, ...sorted.slice(-5)])].sort(comparePeriods);
    }

    function displayedAssetPeriods() {
      const periods = recordedAssetPeriods();
      if (!periods.length) return [latestManagedPeriod()];
      return periodViewMode === "all" ? periods : selectSummaryPeriods(periods);
    }

    function setPeriodViewMode(mode) {
      periodViewMode = mode === "all" ? "all" : "summary";
      document.querySelectorAll("[data-period-view]").forEach((button) => {
        const active = button.dataset.periodView === periodViewMode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      renderAssetTable();
      renderHousePlan();
    }

    function isPastManagedPeriod(period) {
      return comparePeriods(period, latestManagedPeriod()) < 0;
    }
