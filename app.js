(function () {
  'use strict';

  const KEY = 'expenseTracker.v1';
  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const DEFAULT_CATEGORIES = [
    ['Food', '#e8743b'], ['Transport', '#3b82f6'], ['Housing', '#8b5cf6'],
    ['Utilities', '#14b8a6'], ['Entertainment', '#ec4899'], ['Health', '#22c55e'],
    ['Shopping', '#eab308'], ['Other', '#64748b']
  ].map(([name, color]) => ({ id: uid(), name, color }));

  // ---------- State ----------
  function defaultState() {
    return {
      categories: DEFAULT_CATEGORIES,
      expenses: [],
      budgets: { byCategory: {} }
    };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.categories) && Array.isArray(s.expenses)) {
        s.budgets = s.budgets || {};
        s.budgets.byCategory = s.budgets.byCategory || {};
        return s;
      }
    } catch (e) { /* fall through */ }
    return defaultState();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save data (storage unavailable).'); }
  }

  const state = load();

  function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  const ui = {
    date: todayStr(),
    tab: 'expenses',
    search: '',
    filter: 'all',
    editingExpense: null,
    editingCat: null
  };

  // ---------- Helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function money(n) {
    return 'S$' + n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const getCat = (id) => state.categories.find((c) => c.id === id);
  const dayExpenses = () => state.expenses.filter((e) => e.date === ui.date);

  function spentByCategory() {
    const map = {};
    dayExpenses().forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return map;
  }

  function shiftDay(n) {
    const [y, m, d] = ui.date.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    const p = (x) => String(x).padStart(2, '0');
    ui.date = dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }

  function level(spent, budget) {
    if (budget <= 0) return '';
    const r = spent / budget;
    return r > 1 ? 'over' : r >= 0.8 ? 'warn' : '';
  }

  function chip(cat) {
    if (!cat) return '<span class="chip" style="--chip-color:#64748b">Uncategorized</span>';
    return '<span class="chip" style="--chip-color:' + esc(cat.color) + '">' + esc(cat.name) + '</span>';
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // ---------- Render ----------
  function renderSummary() {
    const spent = dayExpenses().reduce((a, e) => a + e.amount, 0);
    $('sum-spent').textContent = money(spent);
    const by = spentByCategory();
    const over = state.categories.filter((c) => {
      const b = state.budgets.byCategory[c.id] || 0;
      return b > 0 && (by[c.id] || 0) > b;
    });
    $('sum-over').textContent = over.length;
    $('sum-over').className = over.length ? 'negative' : '';
    const hasBudgets = Object.keys(state.budgets.byCategory).length > 0;
    $('sum-note').textContent = over.length ? over.map((c) => c.name).join(', ')
      : hasBudgets ? 'All within budget' : 'No category budgets set — see the Budgets tab.';
  }

  // Phone layout: name + figures on one line, full-width bars underneath, drawn at real pixel size.
  function renderChartCompact(el, rows, max, W) {
    const ROW = 62, plotW = W - 4, H = rows.length * ROW + 4;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Spending versus budget by category">';
    rows.forEach((r, i) => {
      const y = 4 + i * ROW;
      const lvl = level(r.spent, r.budget) || 'ok';
      const over = r.budget > 0 && r.spent > r.budget;
      const name = r.c.name.length > 12 ? r.c.name.slice(0, 11) + '…' : r.c.name;
      const fig = money(r.spent) + (r.budget > 0 ? ' / ' + money(r.budget) : ' (no limit)') +
        (over ? ' · +' + money(r.spent - r.budget) : '');
      svg += '<text class="chart-label" x="2" y="' + (y + 13) + '">' + esc(name) + '<title>' + esc(r.c.name) + '</title></text>';
      svg += '<text class="' + (over ? 'chart-over' : 'chart-sub') + '" x="' + (W - 2) + '" y="' + (y + 13) + '" text-anchor="end">' + fig + '</text>';
      if (r.budget > 0) svg += '<rect class="b-budget" x="2" y="' + (y + 22) + '" width="' + Math.max(2, (r.budget / max) * plotW) + '" height="11" rx="3"/>';
      if (r.spent > 0) svg += '<rect class="b-' + lvl + '" x="2" y="' + (y + 36) + '" width="' + Math.max(2, (r.spent / max) * plotW) + '" height="14" rx="3"/>';
    });
    el.innerHTML = svg + '</svg>';
  }

  function renderChart() {
    $('chart-date').textContent = '· ' + ui.date;
    const by = spentByCategory();
    const rows = state.categories
      .map((c) => ({ c, spent: by[c.id] || 0, budget: state.budgets.byCategory[c.id] || 0 }))
      .filter((r) => r.spent > 0 || r.budget > 0);
    const el = $('chart');
    if (!rows.length) {
      el.innerHTML = '<div class="empty">Add expenses or set category budgets to see the chart.</div>';
      return;
    }
    const max = Math.max.apply(null, rows.map((r) => Math.max(r.spent, r.budget))) || 1;
    const cw = el.clientWidth || 600;
    if (cw < 520) { renderChartCompact(el, rows, max, cw); return; }
    const W = 640, L = 120, R = 150, ROW = 48, plotW = W - L - R, H = rows.length * ROW + 4;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Spending versus budget by category">';
    rows.forEach((r, i) => {
      const y = 4 + i * ROW;
      const lvl = level(r.spent, r.budget) || 'ok';
      const name = r.c.name.length > 15 ? r.c.name.slice(0, 14) + '…' : r.c.name;
      svg += '<text class="chart-label" x="' + (L - 8) + '" y="' + (y + 25) + '" text-anchor="end">' + esc(name) + '<title>' + esc(r.c.name) + '</title></text>';
      if (r.budget > 0) {
        const bw = Math.max(2, (r.budget / max) * plotW);
        svg += '<rect class="b-budget" x="' + L + '" y="' + (y + 6) + '" width="' + bw + '" height="12" rx="3"/>';
        svg += '<text class="chart-sub" x="' + (L + bw + 6) + '" y="' + (y + 16) + '">limit ' + money(r.budget) + '</text>';
      } else {
        svg += '<text class="chart-sub" x="' + (L + 2) + '" y="' + (y + 16) + '">no limit set</text>';
      }
      const sw = r.spent > 0 ? Math.max(2, (r.spent / max) * plotW) : 0;
      if (sw) svg += '<rect class="b-' + lvl + '" x="' + L + '" y="' + (y + 22) + '" width="' + sw + '" height="14" rx="3"/>';
      const over = r.budget > 0 && r.spent > r.budget;
      svg += '<text class="' + (over ? 'chart-over' : 'chart-sub') + '" x="' + (L + sw + 6) + '" y="' + (y + 33) + '">' +
        money(r.spent) + (over ? ' · ' + money(r.spent - r.budget) + ' OVER' : '') + '</text>';
    });
    el.innerHTML = svg + '</svg>';
  }

  function filteredExpenses() {
    const q = ui.search.trim().toLowerCase();
    return dayExpenses()
      .filter((e) => ui.filter === 'all' || e.category === ui.filter)
      .filter((e) => !q || e.desc.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  }

  function renderExpenses() {
    const sel = $('filter-cat');
    sel.innerHTML = '<option value="all">All categories</option>' +
      state.categories.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
    if (ui.filter !== 'all' && !getCat(ui.filter)) ui.filter = 'all';
    sel.value = ui.filter;

    const items = filteredExpenses();
    $('expense-list').innerHTML = items.length ? items.map((e) =>
      '<div class="item">' +
        '<div class="main">' +
          '<div class="title">' + esc(e.desc) + '</div>' +
          '<div class="meta">' + esc(e.date) + ' · ' + chip(getCat(e.category)) + '</div>' +
        '</div>' +
        '<div class="amount">' + money(e.amount) + '</div>' +
        '<div class="actions">' +
          '<button class="btn small icon" title="Edit" aria-label="Edit" data-action="edit-expense" data-id="' + esc(e.id) + '">✏️</button>' +
          '<button class="btn small icon danger" title="Delete" aria-label="Delete" data-action="delete-expense" data-id="' + esc(e.id) + '">🗑️</button>' +
        '</div>' +
      '</div>').join('')
      : '<div class="empty">No expenses on this day yet. Click “+ Add expense” to start.</div>';
  }

  function renderBudgets() {
    const spent = spentByCategory();
    $('budget-list').innerHTML = state.categories.map((c) => {
      const budget = state.budgets.byCategory[c.id] || 0;
      const s = spent[c.id] || 0;
      const lvl = level(s, budget);
      let note = money(s) + ' spent';
      if (budget > 0) {
        note += s > budget ? ' · ' + money(s - budget) + ' over' : ' · ' + money(budget - s) + ' left';
      }
      return '<div class="budget-row budget-item">' +
        '<div class="line">' +
          '<span class="dot" style="background:' + esc(c.color) + '"></span>' +
          '<span class="grow">' + esc(c.name) + '</span>' +
          '<input type="number" min="0" step="1" placeholder="No limit" data-budget="' + esc(c.id) + '" value="' + (budget > 0 ? budget : '') + '" aria-label="Budget for ' + esc(c.name) + '">' +
        '</div>' +
        '<div class="bar"><div class="bar-fill ' + lvl + '" style="width:' + (budget > 0 ? Math.min(100, (s / budget) * 100) : 0) + '%"></div></div>' +
        '<div class="meta">' + note + '</div>' +
      '</div>';
    }).join('');
  }

  function renderCategories() {
    const counts = {};
    state.expenses.forEach((e) => { counts[e.category] = (counts[e.category] || 0) + 1; });
    $('cat-list').innerHTML = state.categories.map((c) =>
      '<div class="item">' +
        '<span class="dot" style="background:' + esc(c.color) + '"></span>' +
        '<div class="main"><div class="title">' + esc(c.name) + '</div>' +
        '<div class="meta">' + (counts[c.id] || 0) + ' expense(s)</div></div>' +
        '<div class="actions">' +
          '<button class="btn small icon" title="Edit" aria-label="Edit" data-action="edit-cat" data-id="' + esc(c.id) + '">✏️</button>' +
          '<button class="btn small icon danger" title="Delete" aria-label="Delete" data-action="delete-cat" data-id="' + esc(c.id) + '">🗑️</button>' +
        '</div>' +
      '</div>').join('');

    const editing = ui.editingCat && getCat(ui.editingCat);
    $('cat-submit').textContent = editing ? 'Save changes' : 'Add category';
    $('cat-cancel').hidden = !editing;
  }

  function render() {
    $('day').value = ui.date;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === ui.tab));
    $('backup-stats').textContent = state.expenses.length + ' expense(s), ' + state.categories.length + ' categories';
    ['expenses', 'budgets', 'categories', 'backup'].forEach((t) => { $('tab-' + t).hidden = ui.tab !== t; });
    renderSummary();
    renderChart();
    renderExpenses();
    renderBudgets();
    renderCategories();
  }

  // ---------- Expense dialog ----------
  function openExpenseDialog(id) {
    const dlg = $('expense-dialog');
    const e = id ? state.expenses.find((x) => x.id === id) : null;
    ui.editingExpense = e ? e.id : null;
    $('expense-dialog-title').textContent = e ? 'Edit expense' : 'Add expense';
    $('e-cat').innerHTML = state.categories.map((c) =>
      '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
    $('e-desc').value = e ? e.desc : '';
    $('e-amount').value = e ? e.amount : '';
    $('e-cat').value = e ? e.category : (ui.filter !== 'all' ? ui.filter : state.categories[0].id);
    $('e-date').value = e ? e.date : ui.date;
    dlg.showModal();
    $('e-desc').focus();
  }

  function budgetWarning(catId, date) {
    const budget = state.budgets.byCategory[catId] || 0;
    const cat = getCat(catId);
    if (budget > 0 && cat) {
      const spent = state.expenses
        .filter((e) => e.category === catId && e.date === date)
        .reduce((a, e) => a + e.amount, 0);
      if (spent > budget) return '⚠️ Over your ' + cat.name + ' budget by ' + money(spent - budget);
      if (spent >= budget * 0.8) return '⚠️ ' + cat.name + ' budget is ' + Math.round((spent / budget) * 100) + '% used';
    }
    return '';
  }

  $('expense-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const desc = $('e-desc').value.trim();
    const amount = Math.round(parseFloat($('e-amount').value) * 100) / 100;
    const category = $('e-cat').value;
    const date = $('e-date').value;
    if (!desc || !(amount > 0) || !date) return;

    if (ui.editingExpense) {
      const e = state.expenses.find((x) => x.id === ui.editingExpense);
      Object.assign(e, { desc, amount, category, date });
    } else {
      state.expenses.push({ id: uid(), desc, amount, category, date, created: Date.now() });
    }
    save();
    $('expense-dialog').close();
    ui.date = date; // jump to the day of the saved expense
    render();
    const warn = budgetWarning(category, date);
    if (warn) toast(warn);
  });

  $('e-cancel').addEventListener('click', () => $('expense-dialog').close());

  // ---------- Categories ----------
  $('cat-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('cat-name').value.trim();
    const color = $('cat-color').value;
    if (!name) return;
    const dup = state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== ui.editingCat);
    if (dup) { toast('A category with that name already exists.'); return; }

    if (ui.editingCat) {
      Object.assign(getCat(ui.editingCat), { name, color });
    } else {
      state.categories.push({ id: uid(), name, color });
    }
    ui.editingCat = null;
    $('cat-form').reset();
    $('cat-color').value = '#4f8cff';
    save();
    render();
  });

  $('cat-cancel').addEventListener('click', () => {
    ui.editingCat = null;
    $('cat-form').reset();
    $('cat-color').value = '#4f8cff';
    render();
  });

  function deleteCategory(id) {
    const cat = getCat(id);
    if (!cat) return;
    if (state.categories.length <= 1) { toast('You need at least one category.'); return; }
    const used = state.expenses.filter((e) => e.category === id);
    const msg = used.length
      ? 'Delete "' + cat.name + '"? Its ' + used.length + ' expense(s) will move to another category.'
      : 'Delete "' + cat.name + '"?';
    if (!confirm(msg)) return;

    if (used.length) {
      let fallback = state.categories.find((c) => c.id !== id && c.name.toLowerCase() === 'other')
        || state.categories.find((c) => c.id !== id);
      used.forEach((e) => { e.category = fallback.id; });
      const moved = state.budgets.byCategory[id];
      if (moved > 0) state.budgets.byCategory[fallback.id] = (state.budgets.byCategory[fallback.id] || 0) + moved;
    }
    delete state.budgets.byCategory[id];
    state.categories = state.categories.filter((c) => c.id !== id);
    if (ui.editingCat === id) ui.editingCat = null;
    save();
    render();
  }

  // ---------- Export ----------
  function exportCsv() {
    const rows = [['Date', 'Description', 'Category', 'Amount']];
    state.expenses.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
      const c = getCat(e.category);
      rows.push([e.date, e.desc, c ? c.name : '', e.amount.toFixed(2)]);
    });
    // Prefix risky leading characters so spreadsheet apps don't treat text as formulas.
    const cell = (v) => {
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expenses.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Backup / restore ----------
  function exportBackup() {
    const payload = {
      app: 'expense-tracker',
      version: 1,
      exported: new Date().toISOString(),
      data: { categories: state.categories, expenses: state.expenses, budgets: state.budgets }
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expenses-backup-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exported.');
  }

  // Validate and clean imported data; returns null if the file isn't a usable backup.
  function sanitizeBackup(raw) {
    const d = raw && raw.app === 'expense-tracker' ? raw.data : null;
    if (!d || !Array.isArray(d.categories) || !Array.isArray(d.expenses)) return null;

    const ids = new Set();
    const categories = [];
    d.categories.forEach((c) => {
      if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || ids.has(c.id)) return;
      const name = c.name.trim().slice(0, 30);
      if (!name) return;
      ids.add(c.id);
      categories.push({ id: c.id, name, color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#64748b' });
    });
    if (!categories.length) return null;

    const expenses = [];
    d.expenses.forEach((e) => {
      if (!e || typeof e.desc !== 'string' || typeof e.date !== 'string') return;
      const amount = Number(e.amount);
      if (!(amount > 0) || !isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return;
      expenses.push({
        id: typeof e.id === 'string' ? e.id : uid(),
        desc: e.desc.trim().slice(0, 80) || '(no description)',
        amount: Math.round(amount * 100) / 100,
        category: ids.has(e.category) ? e.category : categories[0].id,
        date: e.date,
        created: Number(e.created) || Date.now()
      });
    });

    const byCategory = {};
    const src = (d.budgets && d.budgets.byCategory) || {};
    categories.forEach((c) => {
      const v = Math.round(Number(src[c.id]));
      if (v > 0) byCategory[c.id] = v;
    });
    return { categories, expenses, budgets: { byCategory }, skipped: d.expenses.length - expenses.length };
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read that file.');
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { toast('That file is not valid JSON.'); return; }
      const clean = sanitizeBackup(parsed);
      if (!clean) { toast('That file is not a backup from this app.'); return; }
      const msg = 'Replace ALL current data with this backup?\n\n' +
        clean.expenses.length + ' expense(s), ' + clean.categories.length + ' categories' +
        (clean.skipped ? '\n(' + clean.skipped + ' invalid entr' + (clean.skipped === 1 ? 'y' : 'ies') + ' will be skipped)' : '') +
        '\n\nThis cannot be undone.';
      if (!confirm(msg)) return;
      state.categories = clean.categories;
      state.expenses = clean.expenses;
      state.budgets = clean.budgets;
      ui.filter = 'all';
      ui.editingCat = null;
      save();
      render();
      toast('Backup restored: ' + clean.expenses.length + ' expense(s).');
    };
    reader.readAsText(file);
  }

  // ---------- Events ----------
  document.addEventListener('click', (ev) => {
    const tab = ev.target.closest('.tab');
    if (tab) { ui.tab = tab.dataset.tab; render(); return; }

    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;

    switch (btn.dataset.action) {
      case 'add-expense': openExpenseDialog(null); break;
      case 'edit-expense': openExpenseDialog(id); break;
      case 'delete-expense': {
        const e = state.expenses.find((x) => x.id === id);
        if (e && confirm('Delete "' + e.desc + '" (' + money(e.amount) + ')?')) {
          state.expenses = state.expenses.filter((x) => x.id !== id);
          save();
          render();
        }
        break;
      }
      case 'edit-cat': {
        const c = getCat(id);
        if (c) {
          ui.editingCat = id;
          $('cat-name').value = c.name;
          $('cat-color').value = c.color;
          renderCategories();
          $('cat-name').focus();
        }
        break;
      }
      case 'delete-cat': deleteCategory(id); break;
      case 'export': exportCsv(); break;
      case 'backup-export': exportBackup(); break;
      case 'backup-import': $('import-file').click(); break;
    }
  });

  $('day').addEventListener('change', (e) => { if (e.target.value) { ui.date = e.target.value; render(); } });
  $('day-prev').addEventListener('click', () => { shiftDay(-1); render(); });
  $('day-next').addEventListener('click', () => { shiftDay(1); render(); });
  $('day-today').addEventListener('click', () => { ui.date = todayStr(); render(); });
  $('search').addEventListener('input', (e) => { ui.search = e.target.value; renderExpenses(); });
  $('filter-cat').addEventListener('change', (e) => { ui.filter = e.target.value; renderExpenses(); });

  $('budget-list').addEventListener('change', (e) => {
    const id = e.target.dataset.budget;
    if (!id) return;
    const v = Math.round(parseFloat(e.target.value)); // whole dollars only
    if (v > 0) state.budgets.byCategory[id] = v; else delete state.budgets.byCategory[id];
    save();
    render();
  });

  $('import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (f) importBackup(f);
  });

  // ---------- Theme ----------
  const THEME_KEY = 'expenseTracker.theme';
  const root = document.documentElement;
  const systemDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentTheme = () => root.dataset.theme || (systemDark() ? 'dark' : 'light');

  function syncThemeButton() {
    const dark = currentTheme() === 'dark';
    const b = $('theme-toggle');
    b.textContent = dark ? '☀️' : '🌙';
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    b.title = label;
    b.setAttribute('aria-label', label);
  }

  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  } catch (e) { /* storage unavailable: follow the system */ }
  syncThemeButton();

  $('theme-toggle').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    syncThemeButton();
  });

  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth !== lastW) { lastW = window.innerWidth; renderChart(); }
  });

  render();
})();
