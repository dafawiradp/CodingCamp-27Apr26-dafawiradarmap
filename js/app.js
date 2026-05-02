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
 *  - Multi-currency: IDR (base) ↔ USD with fixed conversion rate
 */

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */

const STORAGE_KEY_TX       = 'sefc_transactions';
const STORAGE_KEY_CATS     = 'sefc_categories';
const STORAGE_KEY_THEME    = 'sefc_theme';
const STORAGE_KEY_CURRENCY = 'sefc_currency';

/**
 * Fixed conversion rate.
 * All amounts are stored in IDR (base currency).
 * 1 USD = IDR_PER_USD
 */
const IDR_PER_USD = 15000;

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
let transactions    = [];
let categories      = [...DEFAULT_CATEGORIES];
let sortMode        = 'date-desc';
let currentCurrency = 'IDR'; // 'IDR' | 'USD'
let spendingChart   = null;

/* ============================================================
   DOM REFERENCES
   ============================================================ */

const totalBalanceEl  = document.getElementById('totalBalance');
const txCountEl       = document.getElementById('txCount');
const balanceRateEl   = document.getElementById('balanceRate');
const txForm          = document.getElementById('txForm');
const itemNameInput   = document.getElementById('itemName');
const amountInput     = document.getElementById('amount');
const amountLabel     = document.getElementById('amountLabel');
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
const btnIDR          = document.getElementById('btnIDR');
const btnUSD          = document.getElementById('btnUSD');

/* ============================================================
   CURRENCY UTILITIES
   ============================================================ */

/**
 * Format a raw IDR amount for display in the active currency.
 * @param {number} amountIDR  - Amount stored in IDR (base)
 * @param {string} [currency] - 'IDR' | 'USD' (defaults to currentCurrency)
 * @returns {string}
 */
function formatCurrency(amountIDR, currency) {
  const cur = currency || currentCurrency;
  const display = convertCurrency(amountIDR, cur);

  if (cur === 'IDR') {
    // Format: Rp10.000 (id-ID locale uses dots as thousands separator)
    return 'Rp' + display.toLocaleString('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } else {
    // Format: $10,000.00
    return '$' + display.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}

/**
 * Convert a stored IDR amount to the target display currency.
 * @param {number} amountIDR
 * @param {string} currency - 'IDR' | 'USD'
 * @returns {number}
 */
function convertCurrency(amountIDR, currency) {
  if (currency === 'USD') {
    return amountIDR / IDR_PER_USD;
  }
  return amountIDR; // already IDR
}

/**
 * Convert a user-entered amount (in currentCurrency) to IDR for storage.
 * @param {number} inputAmount
 * @returns {number} amount in IDR
 */
function toIDR(inputAmount) {
  if (currentCurrency === 'USD') {
    return inputAmount * IDR_PER_USD;
  }
  return inputAmount;
}

/* ============================================================
   PERSISTENCE HELPERS
   ============================================================ */

function loadData() {
  try {
    const txRaw       = localStorage.getItem(STORAGE_KEY_TX);
    const catRaw      = localStorage.getItem(STORAGE_KEY_CATS);
    const themeRaw    = localStorage.getItem(STORAGE_KEY_THEME);
    const currencyRaw = localStorage.getItem(STORAGE_KEY_CURRENCY);

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

    // Apply saved currency (default IDR)
    currentCurrency = (currencyRaw === 'USD') ? 'USD' : 'IDR';

  } catch (e) {
    console.warn('SEFC: Failed to load data from localStorage.', e);
    transactions    = [];
    categories      = [...DEFAULT_CATEGORIES];
    currentCurrency = 'IDR';
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY_TX, JSON.stringify(transactions));
}

function saveCategories() {
  localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(categories));
}

function saveCurrency() {
  localStorage.setItem(STORAGE_KEY_CURRENCY, currentCurrency);
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
  const totalIDR = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalBalanceEl.textContent = formatCurrency(totalIDR);

  const count = transactions.length;
  txCountEl.textContent = count + ' transaction' + (count !== 1 ? 's' : '');

  // Show conversion rate hint
  if (currentCurrency === 'USD') {
    balanceRateEl.textContent = '1 USD = Rp' + IDR_PER_USD.toLocaleString('id-ID');
  } else {
    balanceRateEl.textContent = '1 USD = Rp' + IDR_PER_USD.toLocaleString('id-ID');
  }
}

/* ============================================================
   CHART
   ============================================================ */

function buildChartData() {
  // Accumulate totals in IDR, then convert for display
  const totalsIDR = {};
  transactions.forEach(function(tx) {
    totalsIDR[tx.category] = (totalsIDR[tx.category] !== undefined
      ? totalsIDR[tx.category]
      : 0) + tx.amount;
  });

  const labels = Object.keys(totalsIDR);
  // Store raw IDR values in chart data; tooltip will format them
  const data   = Object.values(totalsIDR);
  const colors = labels.map(getCategoryColor);
  return { labels: labels, data: data, colors: colors };
}

function renderChart() {
  var chartData = buildChartData();
  var labels = chartData.labels;
  var data   = chartData.data;
  var colors = chartData.colors;
  var hasData = data.length > 0;

  chartEmptyEl.style.display = hasData ? 'none' : 'block';
  chartCanvas.style.display  = hasData ? 'block' : 'none';

  if (!hasData) {
    if (spendingChart) {
      spendingChart.destroy();
      spendingChart = null;
    }
    return;
  }

  var legendColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--text-secondary').trim() || '#8b90b0';

  if (spendingChart) {
    spendingChart.data.labels                          = labels;
    spendingChart.data.datasets[0].data                = data;
    spendingChart.data.datasets[0].backgroundColor     = colors.map(function(c) { return c + 'cc'; });
    spendingChart.data.datasets[0].borderColor         = colors;
    spendingChart.options.plugins.legend.labels.color  = legendColor;
    spendingChart.update();
  } else {
    spendingChart = new Chart(chartCanvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data:            data,
          backgroundColor: colors.map(function(c) { return c + 'cc'; }),
          borderColor:     colors,
          borderWidth:     2,
          hoverOffset:     8,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        cutout:              '60%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color:         legendColor,
              font:          { size: 12, family: 'Segoe UI, system-ui, sans-serif' },
              padding:       14,
              boxWidth:      12,
              boxHeight:     12,
              usePointStyle: true,
              pointStyle:    'circle',
            },
          },
          tooltip: {
            callbacks: {
              // ctx.parsed is the raw IDR value stored in chart data
              label: function(ctx) {
                return ' ' + ctx.label + ': ' + formatCurrency(ctx.parsed);
              },
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
  var list = transactions.slice();
  switch (sortMode) {
    case 'date-asc':
      return list.sort(function(a, b) { return a.id - b.id; });
    case 'date-desc':
      return list.sort(function(a, b) { return b.id - a.id; });
    case 'amount-desc':
      return list.sort(function(a, b) { return b.amount - a.amount; });
    case 'amount-asc':
      return list.sort(function(a, b) { return a.amount - b.amount; });
    case 'category-asc':
      return list.sort(function(a, b) { return a.category.localeCompare(b.category); });
    default:
      return list;
  }
}

function renderTransactions() {
  var sorted = getSortedTransactions();
  txListEl.innerHTML = '';

  if (sorted.length === 0) {
    listEmptyEl.style.display = 'block';
    return;
  }

  listEmptyEl.style.display = 'none';

  sorted.forEach(function(tx) {
    var li    = document.createElement('li');
    li.className  = 'tx-item';
    li.dataset.id = tx.id;

    var color = getCategoryColor(tx.category);

    // tx.amount is always stored in IDR; formatCurrency converts for display
    li.innerHTML =
      '<span class="tx-cat-dot" style="background:' + color + ';" aria-hidden="true"></span>' +
      '<div class="tx-info">' +
        '<div class="tx-name" title="' + escapeHtml(tx.name) + '">' + escapeHtml(tx.name) + '</div>' +
        '<div class="tx-cat-label">' + escapeHtml(tx.category) + '</div>' +
      '</div>' +
      '<span class="tx-amount">-' + formatCurrency(tx.amount) + '</span>' +
      '<button class="tx-delete" data-id="' + tx.id + '" aria-label="Delete ' + escapeHtml(tx.name) + '" title="Delete">✕</button>';

    txListEl.appendChild(li);
  });
}

/* ============================================================
   ADD TRANSACTION
   ============================================================ */

function addTransaction(name, inputAmount, category) {
  // Always store in IDR regardless of active currency
  var amountIDR = toIDR(parseFloat(inputAmount));

  var tx = {
    id:       Date.now(),
    name:     name.trim(),
    amount:   amountIDR,   // stored in IDR
    category: category,
  };
  transactions.push(tx);
  saveTransactions();
  refreshUI();
  showToast('"' + tx.name + '" added!', 'success');
}

/* ============================================================
   DELETE TRANSACTION
   ============================================================ */

function deleteTransaction(id) {
  var idx = transactions.findIndex(function(tx) { return tx.id === id; });
  if (idx === -1) return;
  var name = transactions[idx].name;
  transactions.splice(idx, 1);
  saveTransactions();
  refreshUI();
  showToast('"' + name + '" removed.', 'info');
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
   CURRENCY SWITCHER
   ============================================================ */

function setCurrency(currency) {
  currentCurrency = currency;
  saveCurrency();
  updateCurrencyUI();
  refreshUI();
}

function updateCurrencyUI() {
  // Toggle active class on buttons
  if (currentCurrency === 'IDR') {
    btnIDR.classList.add('active');
    btnUSD.classList.remove('active');
    amountLabel.textContent = 'Amount (Rp)';
    amountInput.placeholder = 'e.g. 50000';
    amountInput.step        = '1';
    amountInput.min         = '1';
  } else {
    btnUSD.classList.add('active');
    btnIDR.classList.remove('active');
    amountLabel.textContent = 'Amount ($)';
    amountInput.placeholder = 'e.g. 3.50';
    amountInput.step        = '0.01';
    amountInput.min         = '0.01';
  }
}

btnIDR.addEventListener('click', function() {
  if (currentCurrency !== 'IDR') {
    setCurrency('IDR');
    showToast('Switched to Indonesian Rupiah (Rp)', 'info');
  }
});

btnUSD.addEventListener('click', function() {
  if (currentCurrency !== 'USD') {
    setCurrency('USD');
    showToast('Switched to US Dollar ($)', 'info');
  }
});

/* ============================================================
   FORM VALIDATION & SUBMISSION
   ============================================================ */

function clearErrors() {
  nameError.textContent     = '';
  amountError.textContent   = '';
  categoryError.textContent = '';
}

function validateForm() {
  var valid    = true;
  var name     = itemNameInput.value.trim();
  var amount   = amountInput.value.trim();
  var category = categorySelect.value;
  clearErrors();

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

txForm.addEventListener('submit', function(e) {
  e.preventDefault();
  if (!validateForm()) return;

  addTransaction(
    itemNameInput.value,
    amountInput.value,
    categorySelect.value
  );

  txForm.reset();
  clearErrors();
  itemNameInput.focus();
});

/* ============================================================
   DELETE – event delegation on list
   ============================================================ */

txListEl.addEventListener('click', function(e) {
  var btn = e.target.closest('.tx-delete');
  if (!btn) return;
  var id = parseInt(btn.dataset.id, 10);
  deleteTransaction(id);
});

/* ============================================================
   SORT
   ============================================================ */

sortSelect.addEventListener('change', function() {
  sortMode = sortSelect.value;
  renderTransactions();
});

/* ============================================================
   CUSTOM CATEGORIES
   ============================================================ */

toggleCustomCat.addEventListener('click', function() {
  var isVisible = customCatRow.style.display !== 'none';
  customCatRow.style.display  = isVisible ? 'none' : 'flex';
  toggleCustomCat.textContent = isVisible ? '+ Add custom category' : '− Hide custom category';
  if (!isVisible) customCatInput.focus();
});

addCatBtn.addEventListener('click', function() {
  var raw = customCatInput.value.trim();
  customCatError.textContent = '';

  if (!raw) {
    customCatError.textContent = 'Please enter a category name.';
    return;
  }

  var duplicate = categories.some(function(c) {
    return c.toLowerCase() === raw.toLowerCase();
  });
  if (duplicate) {
    customCatError.textContent = 'That category already exists.';
    return;
  }

  categories.push(raw);
  saveCategories();
  addCategoryOption(raw);
  categorySelect.value = raw;
  customCatInput.value = '';
  showToast('Category "' + raw + '" added!', 'success');
});

function addCategoryOption(name) {
  var opt         = document.createElement('option');
  opt.value       = name;
  opt.textContent = name;
  categorySelect.appendChild(opt);
}

function rebuildCategorySelect() {
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }
  var emojiMap = { Food: '🍔', Transport: '🚗', Fun: '🎉' };
  categories.forEach(function(cat) {
    var opt         = document.createElement('option');
    opt.value       = cat;
    opt.textContent = (emojiMap[cat] ? emojiMap[cat] + ' ' : '') + cat;
    categorySelect.appendChild(opt);
  });
}

/* ============================================================
   DARK / LIGHT MODE TOGGLE
   ============================================================ */

themeToggle.addEventListener('click', function() {
  var current = document.documentElement.getAttribute('data-theme');
  var next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEY_THEME, next);
  updateThemeIcon(next);

  if (spendingChart) {
    var legendColor = getComputedStyle(document.documentElement)
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

var toastTimer = null;

function showToast(message, type) {
  type = type || 'info';
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();
  if (toastTimer) clearTimeout(toastTimer);

  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  requestAnimationFrame(function() {
    requestAnimationFrame(function() { toast.classList.add('show'); });
  });

  toastTimer = setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 350);
  }, 2500);
}

/* ============================================================
   UTILITIES
   ============================================================ */

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
  updateCurrencyUI();
  refreshUI();
}

init();
