(function () {
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has("family")) {
    location.replace("/manage" + location.hash);
    return;
  }
  const byId = id => document.getElementById(id);
  const colors = { "부동산": "#be9c67", "주식": "#219689", "현금": "#648dcc", "연금": "#aa8ac2", "금": "#dca456", "기타": "#729d87" };
  const format = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
  function wonAmount(amount) {
    if (Math.abs(amount) >= 100000000) return format.format(amount / 100000000) + "억원";
    if (Math.abs(amount) >= 10000) return format.format(amount / 10000) + "만원";
    return format.format(amount) + "원";
  }
  async function load() {
    const button = byId("publicAssetRefresh");
    const status = byId("publicAssetStatus");
    button.disabled = true;
    try {
      const response = await fetch("/api/public_assets", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const { summary } = await response.json();
      if (!summary) {
        status.textContent = "공개 자산 기록이 없습니다.";
        return;
      }
      byId("publicAssetPeriod").textContent = summary.period.replace("-", ".") + " 기준";
      byId("publicNet").textContent = wonAmount(summary.net);
      byId("publicAssets").textContent = wonAmount(summary.assets);
      byId("publicDebt").textContent = wonAmount(summary.debt);
      byId("publicAllocation").replaceChildren();
      const list = document.createElement("ul");
      list.className = "lab-public-categories";
      for (const { label, amount } of summary.categories) {
        const ratio = summary.assets ? amount / summary.assets * 100 : 0;
        const color = colors[label];
        const segment = document.createElement("span");
        segment.style.width = ratio + "%";
        segment.style.backgroundColor = color;
        byId("publicAllocation").append(segment);
        const row = document.createElement("li");
        const marker = document.createElement("i");
        marker.style.background = color;
        const name = document.createElement("span");
        name.textContent = label;
        const share = document.createElement("span");
        share.textContent = ratio.toFixed(1) + "%";
        const total = document.createElement("strong");
        total.textContent = wonAmount(amount);
        row.append(marker, name, share, total);
        list.append(row);
      }
      byId("publicAllocation").hidden = !summary.categories.length;
      byId("publicCategories").replaceChildren(list);
      byId("publicAssetSummary").hidden = false;
      status.textContent = "";
    } catch {
      status.textContent = "자산 요약을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    } finally {
      button.disabled = false;
    }
  }
  byId("publicAssetRefresh").onclick = load;
  void load();
})();
