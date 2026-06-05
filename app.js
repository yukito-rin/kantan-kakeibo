const storageKey = "simple-household-ledger-v1";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

const categories = {
  expense: ["食費", "日用品", "住居", "光熱費", "通信", "交通", "医療", "娯楽", "その他"],
  income: ["給与", "副収入", "臨時収入", "その他"],
};

const formatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const entryForm = document.querySelector("#entryForm");
const monthFilter = document.querySelector("#monthFilter");
const dateInput = document.querySelector("#dateInput");
const categoryInput = document.querySelector("#categoryInput");
const amountInput = document.querySelector("#amountInput");
const memoInput = document.querySelector("#memoInput");
const entryTable = document.querySelector("#entryTable");
const emptyState = document.querySelector("#emptyState");
const categoryList = document.querySelector("#categoryList");
const incomeTotal = document.querySelector("#incomeTotal");
const expenseTotal = document.querySelector("#expenseTotal");
const balanceTotal = document.querySelector("#balanceTotal");
const exportButton = document.querySelector("#exportButton");
const clearMonthButton = document.querySelector("#clearMonthButton");

let entries = loadEntries();

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthString(dateText = todayString()) {
  return dateText.slice(0, 7);
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? [];
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function currentType() {
  return new FormData(entryForm).get("type");
}

function updateCategoryOptions() {
  const type = currentType();
  categoryInput.innerHTML = categories[type]
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");
}

function visibleEntries() {
  return entries
    .filter((entry) => monthString(entry.date) === monthFilter.value)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

function render() {
  const monthEntries = visibleEntries();
  const income = monthEntries
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expense = monthEntries
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);

  incomeTotal.textContent = formatter.format(income);
  expenseTotal.textContent = formatter.format(expense);
  balanceTotal.textContent = formatter.format(income - expense);

  renderTable(monthEntries);
  renderCategories(monthEntries, expense);
}

function renderTable(monthEntries) {
  emptyState.hidden = monthEntries.length > 0;
  entryTable.innerHTML = monthEntries
    .map((entry) => {
      const signedAmount = entry.type === "income" ? entry.amount : -entry.amount;
      const typeLabel = entry.type === "income" ? "収入" : "支出";
      return `
        <tr>
          <td>${entry.date}</td>
          <td><span class="tag ${entry.type}">${typeLabel}</span></td>
          <td>${entry.category}</td>
          <td>${entry.memo || ""}</td>
          <td class="amount-cell">${formatter.format(signedAmount)}</td>
          <td class="amount-cell">
            <button class="delete-button" type="button" data-id="${entry.id}">削除</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCategories(monthEntries, totalExpense) {
  const totals = monthEntries
    .filter((entry) => entry.type === "expense")
    .reduce((result, entry) => {
      result[entry.category] = (result[entry.category] ?? 0) + entry.amount;
      return result;
    }, {});

  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  if (!rows.length) {
    categoryList.innerHTML = `<p class="empty-state">支出を入れると内訳が出ます。</p>`;
    return;
  }

  categoryList.innerHTML = rows
    .map(([category, amount]) => {
      const percent = totalExpense ? Math.round((amount / totalExpense) * 100) : 0;
      return `
        <div class="category-item">
          <div class="category-meta">
            <span>${category}</span>
            <span>${formatter.format(amount)} / ${percent}%</span>
          </div>
          <div class="bar" aria-hidden="true"><span style="width: ${percent}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function addEntry(event) {
  event.preventDefault();
  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  entries.push({
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: currentType(),
    date: dateInput.value,
    category: categoryInput.value,
    amount: Math.round(amount),
    memo: memoInput.value.trim(),
    createdAt: Date.now(),
  });

  saveEntries();
  memoInput.value = "";
  amountInput.value = "";
  monthFilter.value = monthString(dateInput.value);
  render();
  amountInput.focus();
}

function deleteEntry(id) {
  entries = entries.filter((entry) => entry.id !== id);
  saveEntries();
  render();
}

function exportCsv() {
  const monthEntries = visibleEntries();
  const header = ["日付", "区分", "カテゴリ", "メモ", "金額"];
  const rows = monthEntries.map((entry) => [
    entry.date,
    entry.type === "income" ? "収入" : "支出",
    entry.category,
    entry.memo,
    entry.type === "income" ? entry.amount : -entry.amount,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `家計簿_${monthFilter.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearMonth() {
  const monthEntries = visibleEntries();
  if (!monthEntries.length) return;
  const ok = confirm(`${monthFilter.value} の入力をすべて削除しますか？`);
  if (!ok) return;
  const monthIds = new Set(monthEntries.map((entry) => entry.id));
  entries = entries.filter((entry) => !monthIds.has(entry.id));
  saveEntries();
  render();
}

entryForm.addEventListener("change", (event) => {
  if (event.target.name === "type") updateCategoryOptions();
});

entryForm.addEventListener("submit", addEntry);
monthFilter.addEventListener("change", render);
exportButton.addEventListener("click", exportCsv);
clearMonthButton.addEventListener("click", clearMonth);

entryTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) deleteEntry(button.dataset.id);
});

dateInput.value = todayString();
monthFilter.value = monthString();
updateCategoryOptions();
render();
