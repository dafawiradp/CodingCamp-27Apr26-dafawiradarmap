/**
 * SEFC – Expense & Budget Visualizer
 * js/app.js
 *
 * Features:
 *  - Add / delete transactions (name, amount, category)
 *  - Persist data in localStorage
 *  - Live balance & transaction count
 *  - Pie chart via Chart.js
 *  - Custom categories
 *  - Sort transactions (newest, oldest, amount ↑↓, category A-Z)
 *  - Dark / light mode toggle
 */

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */

const STORAGE_KEY_TX   = 'sefc_transactions';
const STORAGE_KEY_CATS = 'sefc_categories';
const STORAGE_KEY_THEME = 'sefc_theme';

/** Default categories always available */
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

/** Accent colours assigned per category (cycles if more than palette length) */
const CATEGORY_PALETTE = [
  '#5b6af0', // blue
  '#9b59f5', // purple
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#34d399', // green
  '#fb923c', // orange
  '#facc15', // yellow
  '#f87171', // red
];

/** App state */
let transactions = [];
let categories   = [...DEFAULT_CATEGORIES];
let sortMode     = 'date-desc';
let spendingChart = null;

/* ============================================================
   DOM REFERENCES
   ============================================================ */

const totalBalanceEl  = document.getElementById('totalBalance');
const txCountEl       = document.getElementById('txCount');
const txForm          = document.getElementById('txForm');
const itemNameInput   = document.getElementById('itemName');
const amountInput     = document.getElementById('amount');
const categorySelect  = document.getElementById('category');
const nameError       = document.getElementById('nameError');
const amountError     = document.getElementById('amountError');
const categoryError   = document.getElementById('categoryError');
const txListEl        = document.getElementById('txList');
const listEmptyEl     = document.getElementById('listEmpty');
const chartCanvas     = document.getElementById('spendingChart');
const chartEmptyEl    = document.getElementById('chartEmpty');
const sortSelect      = document.getElementById('sortSelect');
const themeToggle     = document.getElementById('themeToggle');
const themeIcon       = document.getElementById('themeIcon');
const toggleCustomCat = document.getElementById('toggleCustomCat');
const customCatRow    = document.getElementById('customCatRow');
const customCatInput  = document.getElementById('customCategory');
const addCatBtn       = document.getElementById('addCatBtn');
const customCatError  = document.getElementById('customCatError');

/* ============================================================
   PERSISTENCE HELPERS
   ============================================================ */

function loadData() {
  try {
    const txRaw   = localStorage.getItem(STORAGE_KEY_TX);
    const catRaw  = localStorage.getItem(STORAGE_KEY_CATS);
    const themeRaw = localStorage.getItem(STORAGE_KEY_THEME);

    transactions = txRaw  ? JSON.parse(txRaw)  : [];
    categories   = catRaw ? JSON.parse(catRaw) : [...DEFAULT_CATEGORIES];

    // Ensure defaults are always present
    DEFAULT_CATEGORIES.forEach(c => {
      if (!categories.includes(c)) categories.unshift(c);
    });

    // Apply saved theme
    if (themeRaw) {
      document.documentElement.setAttribute('data-theme', themeRaw);
      updateThemeIcon(themeRaw);
    }
  } catch (e) {
    console.warn('SEFC: Failed to load data from localStorage.', e);
    transactions = [];
    categories   = [...DEFAULT_CATEGORIES];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(transactions));
}

function saveCategories() {
  localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(categories));
}

/* ============================================================
   CATEGORY COLOUR MAPPING
   ============================================================ */

function getCategoryColor(category) {
  const idx = categories.indexOf(category);
  const color = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
  return color !== undefined ? color : '#8b90b0';
}

/* ============================================================
   BALANCE
   ============================================================ */

function updateBalance() {
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalBalanceEl.textContent = formatCurrency(total);
  const count = transactions.length;
  txCountEl.textContent = `${count} transaction${count !== 1 ? 's' : ''}`;
}

/* ============================================================
   CHART
   ============================================================ */

function buildChartData() {
  const totals = {};
  transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] !== undefined ? totals[tx.category] : 0) + tx.amount;
  });
  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  const colors = labels.map(getCategoryColor);
  return { labels, data, colors };
}

function renderChart() {
  const { labels, data, colors } = buildChartData();
  const hasData = data.length > 0;

  chartEmptyEl.style.display = hasData ? 'none' : 'block';
  chartCanvas.style.display  = hasData ? 'block' : 'none';

  if (!hasData) {
    if (spendingChart) {
      spendingChart.destroy();
      spendingChart = null;
    }
    return;
  }

  if (spendingChart) {
    spendingChart.data.labels          = labels;
    spendingChart.data.datasets[0].data   = data;
    spendingChart.data.datasets[0].backgroundColor = colors;
    spendingChart.data.datasets[0].borderColor      = colors;
    spendingChart.update();
  } else {
    spendingChart = new Chart(chartCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => c + 'cc'), // slight transparency
          borderColor:     colors,
          borderWidth:     2,
          hoverOffset:     8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color:     getComputedStyle(document.documentElement)
                           .getPropertyValue('--text-secondary').trim() || '#8b90b0',
              font:      { size: 12, family: 'Segoe UI, system-ui, sans-serif' },
              padding:   14,
              boxWidth:  12,
              boxHeight: 12,
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }
}

/* ============================================================
   TRANSACTION LIST
   ============================================================ */

function getSortedTransactions() {
  const list = [...transactions];
  switch (sortMode) {
    case 'date-asc':
      return list.sort((a, b) => a.id - b.id);
    case 'date-desc':
      return list.sort((a, b) => b.id - a.id);
    case 'amount-desc':
      return list.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return list.sort((a, b) => a.amount - b.amount);
    case 'category-asc':
      return list.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return list;
  }
}

function renderTransactions() {
  const sorted = getSortedTransactions();
  txListEl.innerHTML = '';

  if (sorted.length === 0) {
    listEmptyEl.style.display = 'block';
    return;
  }

  listEmptyEl.style.display = 'none';

  sorted.forEach(tx => {
    const li = document.createElement('li');
    li.className = 'tx-item';
    li.dataset.id = tx.id;

    const color = getCategoryColor(tx.category);

    li.innerHTML = `
      <span class="tx-cat-dot" style="background:${color};" aria-hidden="true"></span>
      <div class="tx-info">
        <div class="tx-name" title="${escapeHtml(tx.name)}">${escapeHtml(tx.name)}</div>
        <div class="tx-cat-label">${escapeHtml(tx.category)}</div>
      </div>
      <span class="tx-amount">-${formatCurrency(tx.amount)}</span>
      <button class="tx-delete" data-id="${tx.id}" aria-label="Delete ${escapeHtml(tx.name)}" title="Delete">✕</button>
    `;

    txListEl.appendChild(li);
  });
}

/* ============================================================
   ADD TRANSACTION
   ============================================================ */

function addTransaction(name, amount, category) {
  const tx = {
    id:       Date.now(),
    name:     name.trim(),
    amount:   parseFloat(amount),
    category: category,
  };
  transactions.push(tx);
  saveTransactions();
  refreshUI();
  showToast(`"${tx.name}" added!`, 'success');
}

/* ============================================================
   DELETE TRANSACTION
   ============================================================ */

function deleteTransaction(id) {
  const idx = transactions.findIndex(tx => tx.id === id);
  if (idx === -1) return;
  const name = transactions[idx].name;
  transactions.splice(idx, 1);
  saveTransactions();
  refreshUI();
  showToast(`"${name}" removed.`, 'info');
}

/* ============================================================
   REFRESH ALL UI
   ============================================================ */

function refreshUI() {
  updateBalance();
  renderTransactions();
  renderChart();
}

/* ============================================================
   FORM VALIDATION & SUBMISSION
   ============================================================ */

function clearErrors() {
  nameError.textContent     = '';
  amountError.textContent   = '';
  categoryError.textContent = '';
}

function validateForm() {
  let valid = true;
  clearErrors();

  const name     = itemNameInput.value.trim();
  const amount   = amountInput.value.trim();
  const category = categorySelect.value;

  if (!name) {
    nameError.textContent = 'Item name is required.';
    valid = false;
  }

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    amountError.textContent = 'Enter a valid amount greater than 0.';
    valid = false;
  }

  if (!category) {
    categoryError.textContent = 'Please select a category.';
    valid = false;
  }

  return valid;
}

txForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  addTransaction(
    itemNameInput.value,
    amountInput.value,
    categorySelect.value
  );

  // Reset form
  txForm.reset();
  clearErrors();
  itemNameInput.focus();
});

/* ============================================================
   DELETE – event delegation on list
   ============================================================ */

txListEl.addEventListener('click', e => {
  const btn = e.target.closest('.tx-delete');
  if (!btn) return;
  const id = parseInt(btn.dataset.id, 10);
  deleteTransaction(id);
});

/* ============================================================
   SORT
   ============================================================ */

sortSelect.addEventListener('change', () => {
  sortMode = sortSelect.value;
  renderTransactions();
});

/* ============================================================
   CUSTOM CATEGORIES
   ============================================================ */

toggleCustomCat.addEventListener('click', () => {
  const isVisible = customCatRow.style.display !== 'none';
  customCatRow.style.display = isVisible ? 'none' : 'flex';
  toggleCustomCat.textContent = isVisible ? '+ Add custom category' : '− Hide custom category';
  if (!isVisible) customCatInput.focus();
});

addCatBtn.addEventListener('click', () => {
  const raw = customCatInput.value.trim();
  customCatError.textContent = '';

  if (!raw) {
    customCatError.textContent = 'Please enter a category name.';
    return;
  }

  // Case-insensitive duplicate check
  const duplicate = categories.some(c => c.toLowerCase() === raw.toLowerCase());
  if (duplicate) {
    customCatError.textContent = 'That category already exists.';
    return;
  }

  categories.push(raw);
  saveCategories();
  addCategoryOption(raw);
  categorySelect.value = raw;
  customCatInput.value = '';
  showToast(`Category "${raw}" added!`, 'success');
});

/** Append a new <option> to the category <select> */
function addCategoryOption(name) {
  const opt = document.createElement('option');
  opt.value       = name;
  opt.textContent = name;
  categorySelect.appendChild(opt);
}

/** Rebuild the category <select> from the current categories array */
function rebuildCategorySelect() {
  // Keep the placeholder
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }
  const emojiMap = { Food: '🍔', Transport: '🚗', Fun: '🎉' };
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value       = cat;
    opt.textContent = (emojiMap[cat] ? emojiMap[cat] + ' ' : '') + cat;
    categorySelect.appendChild(opt);
  });
}

/* ============================================================
   DARK / LIGHT MODE TOGGLE
   ============================================================ */

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY_THEME, next);
  updateThemeIcon(next);

  // Re-render chart so legend colours update
  if (spendingChart) {
    const legendColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-secondary').trim();
    spendingChart.options.plugins.legend.labels.color = legendColor;
    spendingChart.update();
  }
});

function updateThemeIcon(theme) {
  themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

let toastTimer = null;

function showToast(message, type = 'info') {
  // Remove existing toast if any
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  if (toastTimer) clearTimeout(toastTimer);

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, 2500);
}

/* ============================================================
   UTILITIES
   ============================================================ */

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   INIT
   ============================================================ */

function init() {
  loadData();
  rebuildCategorySelect();
  refreshUI();
}

init();
