    function renderSimInputs() {
      const form = document.getElementById("inputForm");
      form.innerHTML = "";
      for (const [group, fields] of FIELD_GROUPS) {
        const fs = document.createElement("fieldset");
        fs.innerHTML = `<legend>${group}</legend>`;
        for (const [key, label, value, kind] of fields) {
          simDefaults[key] = value;
          fs.insertAdjacentHTML("beforeend", `
            <div class="field" data-field="${key}">
              <label for="${key}">${label}</label>
              <input id="${key}" data-kind="${kind}" value="${value}">
              <span>${kind === "percent" ? "%" : kind === "age" ? "세" : "원"}</span>
              <div class="stepper">
                <button type="button" data-step-target="${key}" data-direction="up" aria-label="${label} 증가">▲</button>
                <button type="button" data-step-target="${key}" data-direction="down" aria-label="${label} 감소">▼</button>
              </div>
              <div class="compact-hint" id="${key}_hint"></div>
            </div>
          `);
        }
        form.append(fs);
      }
      form.querySelectorAll("input").forEach((input) => {
        simInputs[input.id] = input;
        input.addEventListener("input", () => onSimInputChanged({ format: false }));
      });
      form.querySelectorAll("button[data-step-target]").forEach((button) => button.addEventListener("click", onSimStepperClick));
      updateSimCompactHints();
    }

    function readSimInputs() {
      const p = {};
      for (const [key, input] of Object.entries(simInputs)) {
        let value = toNumber(input.value);
        if (input.dataset.kind === "percent") value /= 100;
        if (input.dataset.kind === "age") value = Math.round(value);
        p[key] = value;
      }
      if (p.start_age > p.end_age) throw new Error("시작 나이는 종료 나이보다 작거나 같아야 합니다.");
      return p;
    }

    function autoRunEnabled() {
      return document.getElementById("autoRunPension")?.checked !== false;
    }

    function simMoneyStep(key, value) {
      const abs = Math.abs(value || 0);
      if (key === "nhis_fixed_monthly") return 50000;
      if (["target_net_cash", "private_annual_withdrawal", "national_pension_annual"].includes(key)) return 1000000;
      if (["private_balance", "irp_retire_balance", "irp_taxable_balance"].includes(key)) {
        if (abs < 10000000) return 100000;
        if (abs < 100000000) return 1000000;
        return 10000000;
      }
      if (abs < 10000000) return 100000;
      if (abs < 100000000) return 1000000;
      if (abs < 1000000000) return 10000000;
      return 100000000;
    }

    function clampSimValue(key, value) {
      if (key === "national_pension_start_age") return Math.min(70, Math.max(65, Math.round(value)));
      if (key === "start_age") return Math.min(Math.round(value), toNumber(simInputs.end_age?.value || value));
      if (key === "end_age") return Math.max(Math.round(value), toNumber(simInputs.start_age?.value || value));
      if (key === "one_time_expense_age") {
        const start = toNumber(simInputs.start_age?.value || value);
        const end = toNumber(simInputs.end_age?.value || value);
        return Math.min(end, Math.max(start, Math.round(value)));
      }
      if (simInputs[key]?.dataset.kind === "age") return Math.max(0, Math.round(value));
      if (simInputs[key]?.dataset.kind === "percent") return Math.max(0, value);
      return Math.max(0, value);
    }

    function formatSimInputValue(key, value) {
      const input = simInputs[key];
      if (!input) return String(value);
      if (input.dataset.kind === "money") return won(value);
      if (input.dataset.kind === "percent") return `${value.toFixed(1)}%`;
      return String(Math.round(value));
    }

    function updateSimCompactHints() {
      for (const [key, input] of Object.entries(simInputs)) {
        const hint = document.getElementById(`${key}_hint`);
        if (!hint) continue;
        if (input.dataset.kind === "money") {
          const value = toNumber(input.value);
          hint.textContent = value ? compactWon(value) : "";
        } else {
          hint.textContent = "";
        }
      }
    }

    function onSimInputChanged({ format = false } = {}) {
      if (format) {
        for (const [key, input] of Object.entries(simInputs)) {
          input.value = formatSimInputValue(key, clampSimValue(key, toNumber(input.value)));
        }
      }
      updateSimCompactHints();
      scheduleServerAutoSave();
      if (autoRunEnabled()) {
        runPension();
      } else {
        const status = document.getElementById("status");
        if (status) status.textContent = "입력값이 변경되었습니다. 시뮬레이션 실행을 눌러 결과를 갱신하세요.";
      }
    }

    function onSimStepperClick(event) {
      const button = event.currentTarget;
      const key = button.dataset.stepTarget;
      const input = simInputs[key];
      if (!input) return;
      const direction = button.dataset.direction === "up" ? 1 : -1;
      let value = toNumber(input.value);
      if (input.dataset.kind === "money") {
        value += direction * simMoneyStep(key, value);
      } else if (input.dataset.kind === "percent") {
        value += direction * (event.shiftKey ? 1.0 : 0.1);
      } else {
        value += direction;
      }
      input.value = formatSimInputValue(key, clampSimValue(key, value));
      onSimInputChanged();
    }

    function nationalPensionDelayBonus(startAge) {
      const delayedYears = Math.max(0, Math.round(startAge) - NATIONAL_PENSION_LEGAL_START_AGE);
      return Math.min(NATIONAL_PENSION_DELAY_BONUS_MAX, delayedYears * NATIONAL_PENSION_DELAY_BONUS_PER_YEAR);
    }

    function selectedNationalPensionAnnual(p) {
      return p.national_pension_annual * (1 + nationalPensionDelayBonus(p.national_pension_start_age));
    }

    function renderNationalPensionGuide(p = readSimInputs()) {
      const guide = document.getElementById("nationalPensionGuide");
      const detail = document.getElementById("nationalPensionDetail");
      const gap = document.getElementById("incomeGapDetail");
      if (!guide || !detail || !gap) return;
      const selectedAge = Math.round(p.national_pension_start_age);
      const bonus = nationalPensionDelayBonus(selectedAge);
      const gapEnd = selectedAge - 1;
      guide.querySelector("strong").textContent = `1992년생 기준 법정 개시 ${NATIONAL_PENSION_LEGAL_START_AGE}세, 현재 시나리오 ${selectedAge}세${bonus > 0 ? " 지연개시" : " 개시"}`;
      detail.textContent = `법정 기본 개시연령: ${NATIONAL_PENSION_LEGAL_START_AGE}세 · 시뮬레이션 선택 개시연령: ${selectedAge}세 · 지연 가산율 ${(bonus * 100).toFixed(1)}% · 적용 연간액 ${won(selectedNationalPensionAnnual(p))}`;
      gap.textContent = gapEnd >= NATIONAL_PENSION_GAP_START_AGE
        ? `소득공백 구간 ${NATIONAL_PENSION_GAP_START_AGE}~${gapEnd}세`
        : "소득공백 구간 없음";
    }

    function pensionGapText(p) {
      const gapEnd = Math.round(p.national_pension_start_age) - 1;
      return gapEnd >= NATIONAL_PENSION_GAP_START_AGE
        ? `${NATIONAL_PENSION_GAP_START_AGE}~${gapEnd}세`
        : "없음";
    }

    function depletionAgeFor(column) {
      const row = pensionRows.find((item) => item[column] <= 0.5);
      return row ? `${row["나이"]}세` : "고갈 없음";
    }

    function renderPensionDiagnostics(p = readSimInputs()) {
      const gapEl = document.getElementById("diagnosticGap");
      const nationalEl = document.getElementById("diagnosticNational");
      const warningEl = document.getElementById("diagnosticPrivateWarning");
      const depletionEl = document.getElementById("diagnosticDepletion");
      if (!gapEl || !nationalEl || !warningEl || !depletionEl) return;
      const selectedAge = Math.round(p.national_pension_start_age);
      const bonus = nationalPensionDelayBonus(selectedAge);
      const warningYears = pensionRows.filter((row) => row["경고"]).length;
      const overall = pensionRows.find((row) => row["총 잔액"] <= 0.5);
      gapEl.textContent = pensionGapText(p);
      nationalEl.textContent = `${selectedAge}세 / +${(bonus * 100).toFixed(1)}%`;
      warningEl.textContent = `${warningYears}년`;
      depletionEl.textContent = `개인 ${depletionAgeFor("개인연금 잔액")} · 과세 ${depletionAgeFor("IRP(과세재원) 잔액")} · 퇴직 ${depletionAgeFor("IRP(퇴직재원) 잔액")} · 전체 ${overall ? `${overall["나이"]}세` : "고갈 없음"}`;
    }

    function taxRateByAge(age) {
      if (age < 70) return 0.055;
      if (age < 80) return 0.044;
      return 0.033;
    }

    function taxableTax(amount, age) {
      if (amount <= 0) return 0;
      if (amount <= 15000000) return amount * taxRateByAge(age);
      return amount * 0.15;
    }

    function retireTax(amount, receiptYear, p) {
      if (amount <= 0) return 0;
      return amount * p.irp_retire_effective_tax * (receiptYear > 10 ? 0.60 : 0.70);
    }

    function nhis(privateW, irpTaxW, nationalPension, p) {
      const reflected = (privateW + irpTaxW + nationalPension) * 0.30;
      const annualHealth = (p.nhis_fixed_monthly + reflected / 12 * 0.0719) * 12;
      return annualHealth + annualHealth * 0.1314;
    }

    function yearResult(age, privateW, irpTaxW, irpRetW, receiptYear, nationalPension, p) {
      const nextYear = (irpRetW > 0 || irpTaxW > 0) ? receiptYear + 1 : receiptYear;
      const tax = taxableTax(privateW, age) + taxableTax(irpTaxW, age) + retireTax(irpRetW, nextYear, p);
      const health = nhis(privateW, irpTaxW, nationalPension, p);
      const gross = nationalPension + privateW + irpTaxW + irpRetW;
      return { total_tax: tax, nhis_total: health, gross_total: gross, net_cash: gross - tax - health };
    }

    function nextWithdrawal(age, balances, receiptYear, nationalPension, target, p) {
      const basePrivate = Math.min(p.private_annual_withdrawal, balances.private);
      const withdrawals = { private: basePrivate, irp_taxable: 0, irp_retire: 0 };
      const caps = { irp_retire: balances.irp_retire, irp_taxable: balances.irp_taxable, private_extra: Math.max(0, balances.private - basePrivate) };
      const resultFor = (w) => yearResult(age, w.private, w.irp_taxable, w.irp_retire, receiptYear, nationalPension, p);
      let chosen = resultFor(withdrawals);
      for (const source of ["irp_retire", "irp_taxable", "private_extra"]) {
        if (chosen.net_cash >= target || caps[source] <= 0) continue;
        let low = 0;
        let high = caps[source];
        let candidate = { ...withdrawals };
        if (source === "private_extra") candidate.private = basePrivate + high;
        else candidate[source] = high;
        let highResult = resultFor(candidate);
        if (highResult.net_cash < target) {
          Object.assign(withdrawals, candidate);
          chosen = highResult;
          continue;
        }
        for (let i = 0; i < 30; i += 1) {
          const mid = (low + high) / 2;
          candidate = { ...withdrawals };
          if (source === "private_extra") candidate.private = basePrivate + mid;
          else candidate[source] = mid;
          const midResult = resultFor(candidate);
          if (midResult.net_cash >= target) { high = mid; highResult = midResult; }
          else low = mid;
        }
        if (source === "private_extra") withdrawals.private = basePrivate + high;
        else withdrawals[source] = high;
        chosen = highResult;
      }
      return { private_withdraw: withdrawals.private, irp_taxable_withdraw: withdrawals.irp_taxable, irp_retire_withdraw: withdrawals.irp_retire, ...chosen };
    }

    function simulatePension() {
      const p = readSimInputs();
      let privateBal = p.private_balance;
      let irpRetBal = p.irp_retire_balance;
      let irpTaxBal = p.irp_taxable_balance;
      let receiptYear = 0;
      const out = [];
      const nationalAnnualWithDelay = selectedNationalPensionAnnual(p);
      for (let i = 0, age = p.start_age; age <= p.end_age; i += 1, age += 1) {
        privateBal += privateBal * p.private_return;
        const retireGrowth = irpRetBal * p.irp_retire_return;
        const taxableGrowth = irpTaxBal * p.irp_taxable_return;
        irpTaxBal += taxableGrowth + retireGrowth;
        const targetBase = p.target_net_cash * ((1 + p.target_growth_rate) ** i);
        const oneTime = age === p.one_time_expense_age ? p.one_time_expense_amount : 0;
        const target = targetBase + oneTime;
        const national = age >= p.national_pension_start_age ? nationalAnnualWithDelay * ((1 + p.national_pension_growth) ** (age - p.national_pension_start_age)) : 0;
        const chosen = nextWithdrawal(age, { private: privateBal, irp_retire: irpRetBal, irp_taxable: irpTaxBal }, receiptYear, national, target, p);
        const privateW = Math.min(chosen.private_withdraw, privateBal);
        const irpTaxW = Math.min(chosen.irp_taxable_withdraw, irpTaxBal);
        const irpRetW = Math.min(chosen.irp_retire_withdraw, irpRetBal);
        if (irpRetW > 0 || irpTaxW > 0) receiptYear += 1;
        privateBal -= privateW;
        irpTaxBal -= irpTaxW;
        irpRetBal -= irpRetW;
        const privatePensionTaxWarning = privateW + irpTaxW > 15000000
          ? "사적연금 1,500만 원 초과: 종합과세 또는 15% 분리과세 선택 대상일 수 있습니다."
          : "";
        out.push({ "나이": age, "연금 수령 연차": receiptYear, "실수령액": chosen.net_cash, "총 잔액": privateBal + irpTaxBal + irpRetBal, "총 과세": chosen.total_tax + chosen.nhis_total, "일시 지출": oneTime, "국민연금": national, "IRP(퇴직재원)": irpRetW, "IRP(과세재원)": irpTaxW, "개인연금": privateW, "총수령액": chosen.gross_total, "세금": chosen.total_tax, "건보료": chosen.nhis_total, "그해 목표 실수령액": target, "개인연금 잔액": privateBal, "IRP(과세재원) 잔액": irpTaxBal, "IRP(퇴직재원) 잔액": irpRetBal, "경고": privatePensionTaxWarning });
      }
      return out;
    }

    function renderPension() {
      const p = readSimInputs();
      renderNationalPensionGuide(p);
      renderPensionDiagnostics(p);
      const final = pensionRows.at(-1);
      const depletion = pensionRows.find((r) => r["총 잔액"] <= 0.5);
      const totalNet = pensionRows.reduce((s, r) => s + r["실수령액"], 0);
      const totalTax = pensionRows.reduce((s, r) => s + r["총 과세"], 0);
      const shortfall = pensionRows.filter((r) => r["실수령액"] + 0.5 < r["그해 목표 실수령액"]).length;
      document.getElementById("depletionAge").textContent = depletion ? `${depletion["나이"]}세` : "고갈 없음";
      document.getElementById("finalBalance").textContent = compactWon(final["총 잔액"]);
      document.getElementById("totalNet").textContent = compactWon(totalNet);
      document.getElementById("totalTaxation").textContent = compactWon(totalTax);
      document.getElementById("shortfallYears").textContent = `${shortfall}년`;
      document.getElementById("status").textContent = `계산 완료: 최종 잔액 ${won(final["총 잔액"])}`;
      renderSimTable();
      renderCharts();
    }


    function renderSimTable() {
      document.getElementById("tableHead").innerHTML = `<tr>${SIM_COLUMNS.map((c, i) => `<th class="${i < 5 ? "main" : ""}">${c}</th>`).join("")}</tr>`;
      document.getElementById("tableBody").innerHTML = pensionRows.map((row) => `<tr>${SIM_COLUMNS.map((c, i) => `<td class="${i < 2 ? "center" : ""}">${SIM_MONEY.has(c) ? won(row[c]) : row[c]}</td>`).join("")}</tr>`).join("");
    }


    function runPension() {
      try {
        updateSimCompactHints();
        pensionRows = simulatePension();
        renderPension();
      } catch (error) {
        document.getElementById("status").textContent = error.message;
      }
    }

    function exportPensionCsv() {
      const lines = pensionRows.map((row) => SIM_COLUMNS.map((c) => SIM_MONEY.has(c) ? Math.round(row[c]) : row[c]).join(","));
      const csv = "\ufeff" + [SIM_COLUMNS.join(","), ...lines].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "pension_simulation_results.csv";
      link.click();
      URL.revokeObjectURL(url);
    }

    function resetPension() {
      Object.entries(simDefaults).forEach(([key, value]) => { simInputs[key].value = value; });
      updateSimCompactHints();
      scheduleServerAutoSave();
      runPension();
    }
