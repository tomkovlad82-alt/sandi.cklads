(() => {
  const KEY = "textile-warehouse-v1",
    CATS = [
      "Рушники банні та лицеві",
      "Рушники кухонні та серветки",
      "Покривала",
      "Пледи",
      "Махрові простирадла",
      "Дитячі товари",
      "Постільна білизна",
      "Зимова постільна білизна",
      "Літня постільна білизна",
      "Килимок",
      "Іграшки з пледами",
      "Килими",
      "Подушки",
      "Декоративні наволочки",
      "Рушники для сауни",
      "Набори для сауни",
      "Коробки для подарунків",
      "Носові хустинки",
      "Новий рік",
    ];
  const base = {
    fx: 41.5,
    markup: 20,
    round: 5,
    categories: CATS,
    brands: [],
    products: [],
    suppliers: [],
    customers: [],
    receipts: [],
    supplierLedger: [],
    invoices: [],
    customerPayments: [],
    accounting: [],
    notebook: [],
  };
  let db;
  try {
    db = { ...base, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    db = { ...base };
  }
  let page = "director",
    clientId = "",
    supplierId = "",
    draft = [{ productId: "", qty: 1 }],
    accountingPeriod = "month",
    showArchivedProducts = false,
    showArchivedSuppliers = false;
  const $ = (s) => document.querySelector(s),
    view = $("#view");
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      $("#storage-status").textContent =
        "Сохранено · " +
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        });
    } catch {
      toast(
        "Браузерное хранилище заполнено. Уменьшите размер фото или запустите серверное хранение.",
      );
    }
  };
  const id = () =>
      Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    n = (x) => Number(String(x ?? "").replace(",", ".")) || 0;
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const cash = (x, c = "UAH") =>
    new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency: c,
      maximumFractionDigits: c === "USD" ? 2 : 0,
    }).format(n(x));
  const dt = (x) =>
    x
      ? new Date(x).toLocaleString("uk-UA", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  const now = () => new Date().toISOString().slice(0, 16),
    find = (a, k) => a.find((x) => x.id === k),
    round = (x) =>
      Math.round(x / Math.max(1, n(db.round) || 5)) *
      Math.max(1, n(db.round) || 5);
  const price = (p) =>
    n(p.priceUAH) ||
    round(
      n(p.cost) *
        (p.currency === "USD" ? n(p.fx) : 1) *
        (1 + n(p.markup) / 100),
    );
  const clampDiscount = (value) => Math.min(100, Math.max(0, n(value)));
  const invoiceLineAmount = (unitPrice, quantity, discountPercent = 0) =>
    Math.round(
      n(unitPrice) *
        n(quantity) *
        (1 - clampDiscount(discountPercent) / 100) *
        100,
    ) / 100;
  const purchaseUnitCost = (p) => {
    const receipts = db.receipts.filter((x) => x.productId === p.id);
    const qty = receipts.reduce((sum, x) => sum + n(x.qty), 0);
    if (!qty) return n(p.cost) * (p.currency === "USD" ? n(p.fx) : 1);
    const amount = receipts.reduce((sum, x) => {
      if (x.amount != null) return sum + n(x.amount);
      const gross =
        n(p.cost) * (p.currency === "USD" ? n(p.fx) : 1) * n(x.qty);
      return (
        sum +
        Math.max(0, gross - n(x.discountAmount || gross * n(x.discountPercent) / 100))
      );
    }, 0);
    return amount / qty;
  };
  const stock = (p) =>
    db.receipts
      .filter((x) => x.productId === p)
      .reduce((s, x) => s + n(x.qty), 0) -
    db.invoices.reduce(
      (s, x) =>
        s +
        x.lines.filter((l) => l.productId === p).reduce((a, l) => a + l.qty, 0),
      0,
    ) +
    db.accounting
      .filter((x) => x.stockProductId === p)
      .reduce((s, x) => s + x.delta, 0);
  const debt = (c) =>
    db.invoices
      .filter((x) => x.customerId === c)
      .reduce((s, x) => s + x.total - x.paid, 0) -
    db.customerPayments
      .filter((x) => x.customerId === c)
      .reduce((s, x) => s + x.amount, 0);
  const payable = (s) =>
    db.supplierLedger
      .filter((x) => x.supplierId === s)
      .reduce((a, x) => a + x.amount, 0);
  const totalStock = () => db.products.reduce((s, p) => s + stock(p.id), 0);
  function inPeriod(value, key) {
    if (key === "all") return true;
    const date = new Date(value),
      end = new Date(),
      start = new Date();
    start.setHours(0, 0, 0, 0);
    if (key === "week")
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (key === "month") start.setDate(1);
    if (key === "year") {
      start.setMonth(0, 1);
    }
    return date >= start && date <= end;
  }
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.size) return resolve("");
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(
              1,
              900 / Math.max(img.naturalWidth, img.naturalHeight),
            ),
            canvas = document.createElement("canvas");
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas
            .getContext("2d")
            .drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            resolve(canvas.toDataURL("image/jpeg", 0.76));
          } catch (e) {
            reject(e);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  db.customerNotes ??= [];
  db.notebook ??= [];
  let migrated = false;
  for (const r of db.receipts) {
    if (db.accounting.some((x) => x.source === "receipt" && x.refId === r.id))
      continue;
    const p = find(db.products, r.productId);
    if (!p) continue;
    const amount = (p.currency === "USD" ? p.cost * p.fx : p.cost) * n(r.qty);
    const duplicate = db.accounting.some(
      (x) =>
        x.type === "expense" &&
        !x.source &&
        Math.abs(n(x.amount) - amount) < 0.01 &&
        new Date(x.date).toDateString() === new Date(r.date).toDateString() &&
        /закуп|поставк/i.test(x.description || ""),
    );
    if (!duplicate) {
      db.accounting.push({
        id: id(),
        type: "expense",
        amount,
        category: "Закупка товара",
        description: `Поставка ${p.name} · ${r.qty} шт.`,
        date: r.date,
        source: "receipt",
        refId: r.id,
      });
      migrated = true;
    }
  }
  for (const inv of db.invoices) {
    if (db.accounting.some((x) => x.source === "invoice" && x.refId === inv.id))
      continue;
    const duplicate = db.accounting.some(
      (x) =>
        x.type === "income" &&
        !x.source &&
        Math.abs(n(x.amount) - n(inv.total)) < 0.01 &&
        new Date(x.date).toDateString() === new Date(inv.date).toDateString() &&
        /наклад|продаж/i.test(x.description || ""),
    );
    if (!duplicate) {
      db.accounting.push({
        id: id(),
        type: "income",
        amount: n(inv.total),
        category: "Продажа",
        description: `Продажа по накладной ${inv.number}`,
        date: inv.date,
        source: "invoice",
        refId: inv.id,
      });
      migrated = true;
    }
  }
  for (const charge of db.supplierLedger) {
    if (charge.type !== "charge" || charge.source) continue;
    const receipt = String(charge.note || "").startsWith("Поставка ")
      ? db.receipts.find(
          (r) =>
            r.supplierId === charge.supplierId &&
            new Date(r.date).toDateString() ===
              new Date(charge.date).toDateString() &&
            (() => {
              const p = find(db.products, r.productId);
              return (
                p &&
                Math.abs(
                  (p.currency === "USD" ? p.cost * p.fx : p.cost) * n(r.qty) -
                    n(charge.amount),
                ) < 0.01
              );
            })(),
        )
      : null;
    if (receipt) {
      charge.source = "receipt";
      charge.refId = receipt.id;
      continue;
    }
    const duplicate = db.accounting.some(
      (x) =>
        x.type === "expense" &&
        !x.source &&
        Math.abs(n(x.amount) - n(charge.amount)) < 0.01 &&
        new Date(x.date).toDateString() ===
          new Date(charge.date).toDateString() &&
        /закуп|поставк/i.test(x.description || ""),
    );
    if (!duplicate) {
      db.accounting.push({
        id: id(),
        type: "expense",
        amount: n(charge.amount),
        category: "Закупка у поставщика",
        description: charge.note || "Закупка у поставщика",
        date: charge.date,
        source: "supplier-charge",
        refId: charge.id,
      });
      migrated = true;
    }
  }
  if (migrated) save();
  const opts = (arr, selected = "", first = "Выберите") =>
    `<option value="">${first}</option>` +
    arr
      .map(
        (x) =>
          `<option value="${esc(x.id)}" ${selected === x.id ? "selected" : ""}>${esc(x.label || x.name)}</option>`,
      )
      .join("");
  const productOpts = () =>
      opts(
        db.products.filter((p) => !p.archived).map((p) => ({
          id: p.id,
          label: p.article + " · " + p.name,
        })),
        "",
        "Выберите товар",
      ),
    clientOpts = () => opts(db.customers, clientId, "Выберите клиента"),
    supplierOpts = () =>
      opts(
        db.suppliers.filter((supplier) => !supplier.archived),
        "",
        "Выберите поставщика",
      );
  const head = (ey, title, desc, act = "") =>
    `<div class="page-head"><div><div class="eyebrow">${ey}</div><h1>${title}</h1><p>${desc}</p></div><div class="head-actions">${act}</div></div>`;
  const stat = (label, val, foot, icon) =>
    `<div class="card stat"><div class="stat-top">${label}<span class="stat-icon">${icon}</span></div><div class="stat-value">${val}</div><div class="stat-foot">${foot}</div></div>`;
  const empty = (s, ico = "◌") =>
    `<div class="empty"><div class="empty-icon">${ico}</div>${s}</div>`;
  function toast(s) {
    $("#toast-area").innerHTML = `<div class="toast">${esc(s)}</div>`;
    setTimeout(() => ($("#toast-area").innerHTML = ""), 2400);
  }
  function goto(p) {
    page = p;
    document
      .querySelectorAll("#nav button")
      .forEach((b) => b.classList.toggle("active", b.dataset.page === p));
    $("#crumb").textContent =
      "Учёт / " +
      {
        director: "Кабинет директора",
        warehouse: "Остатки склада",
        customers: "Клиентская база",
        invoices: "Накладные",
        accounting: "Бухгалтерия",
        suppliers: "Поставщики",
        notebook: "Заметки",
      }[p];
    $("#rate-chip").textContent = `Курс: 1 $ = ${n(db.fx).toFixed(2)} ₴`;
    $("#app").classList.remove("menu-open");
    render();
  }
  function render() {
    ({
      director,
      warehouse,
      customers,
      invoices,
      accounting,
      suppliers,
      notebook,
    })[page]();
  }
  function tableProducts(items) {
    return items.length
      ? `<table><thead><tr><th>Товар</th><th>Категория / бренд</th><th>Закупка</th><th>Цена продажи</th><th>Остаток</th><th>Действия</th></tr></thead><tbody>${items
          .map(
            (p) =>
              `<tr class="${p.archived ? "archived-row" : ""}"><td><div class="product-cell">${p.image ? `<img class="product-thumb" src="${p.image}" alt="">` : '<div class="product-placeholder">▦</div>'}<div><b>${esc(p.name)}</b>${p.archived ? '<span class="badge muted-badge">В архиве</span>' : ""}<span class="subline">Артикул ${esc(p.article)}</span></div></div></td><td>${esc(p.category || "Без категории")}<span class="subline">${esc(p.brand || "Без бренда")}</span></td><td>${cash(p.cost, p.currency)}<span class="subline">Наценка ${n(p.markup)}%</span></td><td><b>${cash(price(p))}</b><span class="subline">${cash(price(p) / n(p.fx || db.fx), "USD")}</span></td><td><span class="badge ${stock(p.id) <= 5 ? "warn" : ""}">${stock(p.id)} шт.</span></td><td><div class="table-actions">${p.archived ? `<button class="btn small" data-act="restore-product" data-id="${p.id}">Вернуть</button>` : `<button class="btn small" data-act="edit-product" data-id="${p.id}">Изменить</button><button class="btn small danger" data-act="delete-product" data-id="${p.id}">Удалить</button>`}</div></td></tr>`,
          )
          .join("")}</tbody></table>`
      : empty("Добавьте товар в каталог или измените поиск.", "▦");
  }
  function productEditForm(p) {
    const categoryOptions = db.categories
      .map(
        (category) =>
          `<option value="${esc(category)}" ${p.category === category ? "selected" : ""}>${esc(category)}</option>`,
      )
      .join("");
    const brandOptions = db.brands
      .map(
        (brand) =>
          `<option value="${esc(brand)}" ${p.brand === brand ? "selected" : ""}>${esc(brand)}</option>`,
      )
      .join("");
    return `<h2>Изменить товар</h2><p>Обновите карточку товара. Уже сохранённые накладные и поставки останутся в истории.</p><form id="edit-product" data-id="${p.id}"><div class="form-grid three"><div class="field"><label>Название</label><input class="input" name="name" value="${esc(p.name)}" required></div><div class="field"><label>Артикул</label><input class="input" name="article" value="${esc(p.article)}" required></div><div class="field"><label>Категория</label><select name="category"><option value="" ${p.category ? "" : "selected"}>Без категории</option>${categoryOptions}${p.category && !db.categories.includes(p.category) ? `<option value="${esc(p.category)}" selected>${esc(p.category)}</option>` : ""}</select></div><div class="field"><label>Закупочная цена</label><input class="input" name="cost" type="number" min="0" step=".01" value="${n(p.cost)}" required></div><div class="field"><label>Валюта</label><select name="currency"><option value="USD" ${p.currency === "USD" ? "selected" : ""}>USD</option><option value="UAH" ${p.currency === "UAH" ? "selected" : ""}>UAH</option></select></div><div class="field"><label>Курс доллара</label><input class="input" name="fx" type="number" min=".01" step=".01" value="${n(p.fx) || n(db.fx)}"></div><div class="field"><label>Наценка, %</label><input class="input" name="markup" type="number" step="1" value="${n(p.markup)}"></div><div class="field"><label>Бренд</label><select name="brand"><option value="">Без бренда</option>${brandOptions}${p.brand && !db.brands.includes(p.brand) ? `<option value="${esc(p.brand)}" selected>${esc(p.brand)}</option>` : ""}</select></div><div class="field span3"><label>Заменить фото (необязательно)</label><input class="input" name="image" type="file" accept="image/*"><small>Если новое фото не выбирать, останется текущее.</small><img id="edit-image-preview" class="upload-preview" src="${p.image || ""}" ${p.image ? "" : "hidden"} alt="Предпросмотр товара"></div></div><div class="form-actions"><button type="button" class="btn" data-act="close">Отмена</button><button class="btn primary">Сохранить изменения</button></div></form>`;
  }
  function director() {
    const receivable = db.customers.reduce((s, c) => s + debt(c.id), 0),
      payables = db.suppliers.reduce((s, x) => s + payable(x.id), 0);
    view.innerHTML =
      head(
        "Управление",
        "Кабинет директора",
        "Товары, закупочные цены и поступления на склад.",
        `<button class="btn" data-act="fx">Курс $ ${n(db.fx).toFixed(2)}</button>`,
      ) +
      `<div class="grid stats">${stat("Позиций каталога", db.products.filter((p) => !p.archived).length, "Артикулы и цены", "▦")}${stat("Единиц на складе", totalStock(), "По всем категориям", "▤")}${stat("Долг клиентов", cash(receivable), "Открытые балансы", "↗")}${stat("Долг поставщикам", cash(payables), "Открытые расчёты", "☏")}</div>
<details class="details"><summary>＋ Добавить товар в каталог</summary><div class="details-body"><form id="product-form"><div class="form-grid three"><div class="field"><label>Название</label><input class="input" name="name" required></div><div class="field"><label>Артикул</label><input class="input" name="article" required></div><div class="field"><label>Категория</label><select name="category">${db.categories.map((x) => `<option>${esc(x)}</option>`).join("")}<option value="">Без категории</option></select></div><div class="field"><label>Закупочная цена</label><input class="input" name="cost" type="number" min="0" step=".01" required></div><div class="field"><label>Валюта</label><select name="currency"><option value="USD">USD</option><option value="UAH">UAH</option></select></div><div class="field"><label>Курс доллара</label><input class="input" name="fx" type="number" min=".01" step=".01" value="${n(db.fx)}"></div><div class="field"><label>Наценка, %</label><input class="input" name="markup" type="number" step="1" value="${n(db.markup)}"></div><div class="field"><label>Округлять до, ₴</label><input class="input" name="round" type="number" min="1" value="${n(db.round)}"></div><div class="field"><label>Бренд</label><div class="row-between"><select name="brand"><option value="">Без бренда</option>${db.brands.map((x) => `<option>${esc(x)}</option>`).join("")}</select><button class="btn small" type="button" data-act="brand">＋</button></div></div><div class="field span3"><label>Фото товара (необязательно)</label><input class="input" name="image" type="file" accept="image/*"><small>Изображение уменьшится для хранения в браузере.</small><img id="image-preview" class="upload-preview" hidden alt="Предпросмотр товара"></div><div class="notice span3" id="price-hint">Введите закупочную стоимость для расчёта цены продажи.</div></div><div class="form-actions"><button class="btn primary">Добавить товар</button></div></form></div></details>
<details class="details"><summary>＋ Оформить поступление</summary><div class="details-body"><form id="receipt-form"><div class="form-grid three"><div class="field"><label>Товар</label><select name="productId" required>${productOpts()}</select></div><div class="field"><label>Количество, шт.</label><input class="input" name="qty" type="number" min="1" step="1" required></div><div class="field"><label>От кого поступил</label><select name="supplierId" required>${supplierOpts()}</select></div><div class="field"><label>Дата и время</label><input class="input" name="date" type="datetime-local" value="${now()}" required></div><div class="field"><label>Скидка поставщика, %</label><input class="input" name="discountPercent" type="number" min="0" max="100" step="0.1" value="0"></div><div class="notice span3" id="receipt-total">Укажите товар и количество, чтобы увидеть сумму к учёту.</div><div class="notice span3">Поступление увеличит остаток, а сумма с учётом скидки попадёт в расходы и баланс поставщика.</div></div><div class="form-actions"><button class="btn primary">Зафиксировать поступление</button></div></form>${db.suppliers.some((supplier) => !supplier.archived) ? "" : '<p class="small-text">Добавьте или восстановите поставщика в кабинете «Поставщики».</p>'}</div></details>
<div class="card panel"><div class="panel-head"><div><h2>Каталог товаров</h2><p>Поиск по названию и артикулу</p></div><button class="btn small" data-act="category">＋ Категория</button></div><div class="toolbar"><div class="search"><input class="input" id="prod-search" placeholder="Найти товар или артикул"></div><label class="archive-toggle"><input type="checkbox" id="show-archived-products"> Показать архив</label><select id="cat-filter" style="max-width:230px"><option value="">Все категории</option>${db.categories.map((c) => `<option>${esc(c)}</option>`).join("")}</select></div><div id="prod-table" class="table-wrap top-gap">${tableProducts(db.products.filter((p) => showArchivedProducts ? p.archived : !p.archived))}</div><div class="divider"></div><div class="panel-head"><div><h2>Категории</h2><p>Можно добавлять свои категории</p></div></div><div class="category-row">${db.categories.map((c) => `<span class="pill">${esc(c)}</span>`).join("")}</div></div>`;
    const pf = $("#product-form");
    pf.addEventListener("input", priceHint);
    pf.addEventListener("change", priceHint);
    pf.querySelector('[name="image"]').onchange = (e) => {
      const file = e.target.files[0],
        img = $("#image-preview");
      if (!file) {
        img.hidden = true;
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result;
        img.hidden = false;
      };
      reader.readAsDataURL(file);
    };
    pf.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(pf),
        fx = n(f.get("fx")) || db.fx,
        step = n(f.get("round")) || 5,
        cur = f.get("currency"),
        cost = n(f.get("cost")),
        markup = n(f.get("markup"));
      db.fx = fx;
      db.round = step;
      db.markup = markup;
      const brand = String(f.get("brand") || "").trim();
      if (brand && !db.brands.includes(brand)) db.brands.push(brand);
      const retail = round(
        cost * (cur === "USD" ? fx : 1) * (1 + markup / 100),
      );
      let image = "";
      try {
        image = await shrinkImage(f.get("image"));
      } catch {
        return toast("Не удалось обработать изображение");
      }
      db.products.unshift({
        id: id(),
        name: String(f.get("name")).trim(),
        article: String(f.get("article")).trim(),
        category: String(f.get("category") || ""),
        brand,
        cost,
        currency: cur,
        fx,
        markup,
        priceUAH: retail,
        image,
      });
      showArchivedProducts = false;
      save();
      toast("Товар добавлен · " + cash(retail));
      director();
    };
    $("#receipt-form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget),
        p = find(db.products, f.get("productId")),
        s = find(db.suppliers, f.get("supplierId")),
        qty = n(f.get("qty")),
        discountPercent = n(f.get("discountPercent"));
      if (!p || !s || qty <= 0) return toast("Выберите товар и поставщика");
      if (discountPercent < 0 || discountPercent > 100)
        return toast("Скидка должна быть от 0 до 100%");
      const date = new Date(f.get("date")).toISOString(),
        receiptId = id(),
        unit = p.currency === "USD" ? p.cost * p.fx : p.cost,
        grossAmount = unit * qty,
        discountAmount = Math.round(grossAmount * discountPercent) / 100,
        amount = Math.max(0, Math.round((grossAmount - discountAmount) * 100) / 100),
        discountNote = discountPercent
          ? ` · скидка ${discountPercent}% (−${cash(discountAmount)})`
          : "",
        receiptNote = `Поставка ${p.name} · ${qty} шт.${discountNote}`;
      db.receipts.unshift({
        id: receiptId,
        productId: p.id,
        qty,
        supplierId: s.id,
        date,
        grossAmount,
        discountPercent,
        discountAmount,
        amount,
      });
      db.supplierLedger.unshift({
        id: id(),
        supplierId: s.id,
        amount,
        note: receiptNote,
        date,
        type: "charge",
        source: "receipt",
        refId: receiptId,
      });
      db.accounting.unshift({
        id: id(),
        type: "expense",
        amount,
        category: "Закупка товара",
        description: receiptNote,
        date,
        source: "receipt",
        refId: receiptId,
      });
      save();
      toast("Поступление оформлено · скидка учтена в расходах и долге");
      director();
    };
    $("#prod-search").oninput = filterProducts;
    $("#cat-filter").onchange = filterProducts;
    $("#show-archived-products").checked = showArchivedProducts;
    $("#show-archived-products").onchange = (e) => {
      showArchivedProducts = e.target.checked;
      filterProducts();
    };
    $("#receipt-form").addEventListener("input", receiptPreview);
    $("#receipt-form").addEventListener("change", receiptPreview);
    priceHint();
    receiptPreview();
  }
  function receiptPreview() {
    const form = $("#receipt-form");
    if (!form) return;
    const f = new FormData(form),
      p = find(db.products, f.get("productId")),
      qty = n(f.get("qty")),
      discount = Math.min(100, Math.max(0, n(f.get("discountPercent"))));
    if (!p || qty <= 0) {
      $("#receipt-total").textContent =
        "Укажите товар и количество, чтобы увидеть сумму к учёту.";
      return;
    }
    const gross =
        (p.currency === "USD" ? p.cost * p.fx : p.cost) * qty,
      discountAmount = Math.round(gross * discount) / 100,
      net = Math.max(0, Math.round((gross - discountAmount) * 100) / 100);
    $("#receipt-total").innerHTML =
      `Закупка: <b>${cash(gross)}</b> · скидка ${discount}%: <b>− ${cash(discountAmount)}</b> · к учёту: <b>${cash(net)}</b>`;
  }
  function priceHint() {
    const f = new FormData($("#product-form"));
    const cost = n(f.get("cost"));
    if (!cost) {
      $("#price-hint").textContent =
        "Введите закупочную стоимость для расчёта цены продажи.";
      return;
    }
    const fx = n(f.get("fx")) || db.fx,
      step = n(f.get("round")) || 5,
      raw =
        cost *
        (f.get("currency") === "USD" ? fx : 1) *
        (1 + n(f.get("markup")) / 100),
      p = Math.round(raw / step) * step;
    $("#price-hint").innerHTML =
      `Наценка ${n(f.get("markup"))}%: <b>${cash(raw)}</b> · после округления до ${step} ₴: <b>${cash(p)}</b> (${cash(p / fx, "USD")})`;
  }
  function filterProducts() {
    const q = $("#prod-search").value.toLowerCase(),
      c = $("#cat-filter").value,
      products = db.products.filter((p) =>
        showArchivedProducts ? p.archived : !p.archived,
      );
    $("#prod-table").innerHTML = tableProducts(
      products.filter(
        (p) =>
          (!c || p.category === c) &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            p.article.toLowerCase().includes(q)),
      ),
    );
  }
  function warehouse() {
    const moves = [
      ...db.receipts.map((x) => ({ ...x, delta: x.qty, kind: "Приход" })),
      ...db.invoices.flatMap((inv) =>
        inv.lines.map((l) => ({
          id: inv.id + l.productId,
          productId: l.productId,
          delta: -l.qty,
          kind: "Накладная " + inv.number,
          date: inv.date,
        })),
      ),
      ...db.accounting
        .filter((x) => x.stockProductId)
        .map((x) => ({
          id: x.id,
          productId: x.stockProductId,
          delta: x.delta,
          kind: x.description,
          date: x.date,
        })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    view.innerHTML =
      head(
        "Контроль запасов",
        "Остатки склада",
        "Поступления сохраняют дату и поставщика. Накладные автоматически списывают товары.",
      ) +
      `<div class="grid stats">${stat("Всего единиц", totalStock(), "Суммарный остаток", "▤")}${stat("Разных товаров", db.products.filter((p) => !p.archived).length, "Позиций каталога", "▦")}${stat("Низкий остаток", db.products.filter((p) => !p.archived && stock(p.id) <= 5).length, "Пять штук или меньше", "!")}${stat("Отрицательный остаток", db.products.filter((p) => !p.archived && stock(p.id) < 0).length, "Возможны предзаказы", "↘")}</div><details class="details"><summary>＋ Ручная корректировка склада</summary><div class="details-body"><form id="adjust-form"><div class="form-grid three"><div class="field"><label>Товар</label><select name="productId" required>${productOpts()}</select></div><div class="field"><label>Изменение, шт. (например −2)</label><input class="input" name="delta" type="number" required></div><div class="field"><label>Комментарий</label><input class="input" name="description" required></div></div><div class="form-actions"><button class="btn primary">Сохранить изменение</button></div></form></div></details><div class="card panel"><div class="panel-head"><div><h2>Текущие остатки</h2><p>Накладные и поступления учитываются автоматически</p></div><div class="search" style="max-width:300px"><input class="input" id="stock-search" placeholder="Поиск товара"></div></div><div class="table-wrap" id="stock-table">${stockTable(db.products.filter((p) => !p.archived))}</div></div><div class="card panel top-gap"><div class="panel-head"><div><h2>Движение товара</h2><p>История поступлений и списаний</p></div></div>${
        moves.length
          ? `<div class="table-wrap"><table><thead><tr><th>Дата и время</th><th>Товар</th><th>Движение</th><th>От кого / документ</th></tr></thead><tbody>${moves
              .slice(0, 60)
              .map(
                (m) =>
                  `<tr><td>${dt(m.date)}</td><td>${esc(find(db.products, m.productId)?.name || "Товар")}</td><td><span class="badge ${m.delta < 0 ? "red" : ""}">${m.delta > 0 ? "+" : ""}${m.delta} шт.</span></td><td>${esc(find(db.suppliers, m.supplierId)?.name || m.kind)}${m.discountPercent > 0 ? `<span class="subline">Скидка ${n(m.discountPercent)}% · −${cash(m.discountAmount)}</span>` : ""}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : empty("Поступлений и списаний пока нет.", "↕")
      }</div>`;
    $("#adjust-form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget),
        d = n(f.get("delta"));
      if (!d) return toast("Укажите ненулевое изменение");
      db.accounting.unshift({
        id: id(),
        type: "stock",
        stockProductId: String(f.get("productId")),
        delta: d,
        description: String(f.get("description")),
        date: new Date().toISOString(),
      });
      save();
      toast("Остаток обновлён");
      warehouse();
    };
    $("#stock-search").oninput = (e) =>
      ($("#stock-table").innerHTML = stockTable(
        db.products.filter((p) =>
          !p.archived &&
          (p.name + " " + p.article)
            .toLowerCase()
            .includes(e.target.value.toLowerCase()),
        ),
      ));
  }
  function stockTable(items) {
    return items.length
      ? `<table><thead><tr><th>Товар</th><th>Категория</th><th>Бренд</th><th>Остаток</th><th>Цена продажи</th><th>Стоимость остатка*</th></tr></thead><tbody>${items.map((p) => `<tr><td><b>${esc(p.name)}</b><span class="subline">${esc(p.article)}</span></td><td>${esc(p.category || "—")}</td><td>${esc(p.brand || "—")}</td><td><span class="badge ${stock(p.id) < 0 ? "red" : stock(p.id) <= 5 ? "warn" : ""}">${stock(p.id)} шт.</span></td><td>${cash(price(p))}</td><td>${cash(stock(p.id) * purchaseUnitCost(p))}</td></tr>`).join("")}</tbody></table><p class="small-text">* По закупочной стоимости с учётом скидок поставщиков.</p>`
      : empty("В каталоге пока нет товаров.", "▤");
  }
  function customerRows(items) {
    return items.length
      ? items
          .map((c) => {
            const count = db.invoices.filter(
              (x) => x.customerId === c.id,
            ).length;
            return `<div class="record-item ${clientId === c.id ? "selected" : ""}" data-act="client" data-id="${c.id}"><div><strong>${esc(c.name)}</strong><small>${esc(c.phone || "Телефон не указан")} · заказов: ${count}</small></div><span class="badge ${debt(c.id) > 0 ? "warn" : ""}">${cash(debt(c.id))}</span></div>`;
          })
          .join("")
      : empty("Клиентов пока нет.", "♙");
  }
  function customerCard(c) {
    const inv = db.invoices
        .filter((x) => x.customerId === c.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
      pay = db.customerPayments
        .filter((x) => x.customerId === c.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
      notes = db.customerNotes
        .filter((x) => x.customerId === c.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
      ordered = inv.reduce((s, x) => s + x.total, 0),
      paid =
        inv.reduce((s, x) => s + x.paid, 0) +
        pay.reduce((s, x) => s + x.amount, 0);
    return `<div class="profile-head"><div><h2>${esc(c.name)}</h2><p>${esc(c.phone || "Телефон не указан")} · ${esc(c.address || "Адрес не указан")}</p><button class="btn small top-gap" data-act="edit-client" data-id="${c.id}">Изменить данные</button></div><div class="balance-card"><span>Клиент должен</span><strong>${cash(debt(c.id))}</strong></div></div><div class="grid stats" style="grid-template-columns:repeat(2,1fr)">${stat("Заказано", cash(ordered), "Сумма накладных", "▧")}${stat("Оплачено", cash(paid), "Учтённые оплаты", "✓")}</div><div class="divider"></div><b>Записать оплату</b><form id="client-payment" class="inline-form top-gap"><div class="field"><label>Сумма, ₴</label><input class="input" name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>Дата</label><input class="input" name="date" type="datetime-local" value="${now()}"></div><button class="btn primary">Записать</button></form><div class="small-text top-gap">Оплата уменьшает долг. Доход по накладной уже учтён в бухгалтерии.</div><div class="divider"></div><h2 style="font-size:14px">Заметки и история общения</h2><div class="client-chat">${notes.length ? notes.map((x) => `<div class="chat-entry"><div>${esc(x.text)}</div><time>${dt(x.date)}</time></div>`).join("") : empty("Заметок пока нет. Добавьте договорённости или важные детали.", "✎")}</div><form id="client-note" class="top-gap"><div class="field"><label>Новая заметка</label><textarea name="text" required placeholder="Что клиент заказал, что вы ему сообщили, о чём договорились…"></textarea></div><div class="form-actions"><button class="btn soft">＋ Добавить заметку</button></div></form><div class="divider"></div><h2 style="font-size:14px">Накладные и оплаты</h2>${inv.length || pay.length ? `<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Запись</th><th>Сумма</th><th>Оплачено</th><th>Остаток</th></tr></thead><tbody>${inv.map((x) => `<tr><td>${dt(x.date)}</td><td>Накладная ${esc(x.number)}</td><td>${cash(x.total)}</td><td>${cash(x.paid)}</td><td>${cash(x.total - x.paid)}</td></tr>`).join("")}${pay.map((x) => `<tr><td>${dt(x.date)}</td><td>Оплата клиента</td><td class="amount-positive">− ${cash(x.amount)}</td><td>—</td><td>—</td></tr>`).join("")}</tbody></table></div>` : empty("Истории заказов пока нет.", "▧")}`;
  }
  function customers() {
    if (clientId && !find(db.customers, clientId)) clientId = "";
    const c = find(db.customers, clientId);
    view.innerHTML =
      head(
        "Контакты и расчёты",
        "Клиентская база",
        "Карточки, история общения, заказы и остаток долга.",
      ) +
      `<div class="client-layout"><div class="stack"><details class="details"><summary>＋ Добавить клиента</summary><div class="details-body"><form id="client-form"><div class="form-grid"><div class="field"><label>Имя</label><input class="input" name="first" required></div><div class="field"><label>Фамилия</label><input class="input" name="last" required></div><div class="field"><label>Телефон</label><input class="input" name="phone" type="tel"></div><div class="field span2"><label>Адрес</label><input class="input" name="address"></div></div><div class="form-actions"><button class="btn primary">Создать карточку</button></div></form></div></details><div class="card panel"><div class="panel-head"><h2>Клиенты · ${db.customers.length}</h2></div><div class="search"><input class="input" id="client-search" placeholder="Имя или телефон"></div><div class="record-list top-gap" id="client-list">${customerRows(db.customers)}</div></div></div><div class="card panel" id="client-card">${c ? customerCard(c) : empty("Выберите клиента или создайте карточку.", "♙")}</div></div>`;
    $("#client-form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget),
        x = {
          id: id(),
          name: (f.get("first") + " " + f.get("last")).trim(),
          phone: String(f.get("phone") || "").trim(),
          address: String(f.get("address") || "").trim(),
        };
      db.customers.unshift(x);
      clientId = x.id;
      save();
      toast("Карточка клиента создана");
      customers();
    };
    $("#client-search").oninput = (e) =>
      ($("#client-list").innerHTML = customerRows(
        db.customers.filter((c) =>
          (c.name + " " + c.phone)
            .toLowerCase()
            .includes(e.target.value.toLowerCase()),
        ),
      ));
    const pf = $("#client-payment");
    if (pf)
      pf.onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(pf),
          amount = n(f.get("amount"));
        if (amount <= 0) return;
        db.customerPayments.unshift({
          id: id(),
          customerId: clientId,
          amount,
          date: new Date(f.get("date") || now()).toISOString(),
        });
        save();
        toast("Оплата записана");
        customers();
      };
    const nf = $("#client-note");
    if (nf)
      nf.onsubmit = (e) => {
        e.preventDefault();
        const text = String(new FormData(nf).get("text") || "").trim();
        if (!text) return;
        db.customerNotes.unshift({
          id: id(),
          customerId: clientId,
          text,
          date: new Date().toISOString(),
        });
        save();
        toast("Заметка добавлена");
        customers();
      };
  }
  function invoiceLineHtml() {
    return draft
      .map((l, i) => {
        const p = find(db.products, l.productId);
        return `<div class="line-item"><div class="line-desc">${p ? `<b>${esc(p.name)}</b><small>${esc(p.article)} · ${cash(price(p))} / шт.</small>` : '<span class="muted">Товар не выбран</span>'}</div><label class="line-field"><span>Кол-во</span><input class="input qty" data-i="${i}" type="number" min="1" value="${Math.max(1, n(l.qty))}" aria-label="Количество"></label><label class="line-field"><span>Скидка %</span><input class="input line-discount" data-i="${i}" type="number" min="0" max="100" step="0.1" value="${clampDiscount(l.discountPercent)}" aria-label="Скидка на этот товар, процентов"></label><b class="line-total">${p ? cash(invoiceLineAmount(price(p), l.qty, l.discountPercent)) : "—"}</b><button class="btn small danger" type="button" data-act="remove-line" data-i="${i}">×</button></div>`;
      })
      .join("");
  }
  function preview(inv = null) {
    let c, number, date, lines, total, paid;
    if (inv) {
      c = find(db.customers, inv.customerId);
      number = inv.number;
      date = inv.date;
      lines = inv.lines.map((l) => ({
        p: l,
        qty: l.qty,
        unit: l.unitPrice,
        discount: clampDiscount(l.discountPercent),
        total:
          l.lineTotal ??
          invoiceLineAmount(l.unitPrice, l.qty, l.discountPercent),
      }));
      total = inv.total;
      paid = inv.paid;
    } else {
      c = find(db.customers, $("#inv-client")?.value);
      number =
        $("#inv-number")?.value ||
        `НК-${String(db.invoices.length + 1).padStart(4, "0")}`;
      date = $("#inv-date")?.value || now();
      lines = draft
        .map((l) => {
          const p = find(db.products, l.productId),
            qty = n(l.qty),
            discount = clampDiscount(l.discountPercent);
          return {
            p,
            qty,
            unit: p ? price(p) : 0,
            discount,
            total: p ? invoiceLineAmount(price(p), qty, discount) : 0,
          };
        })
        .filter((x) => x.p && x.qty > 0);
      total = lines.reduce((s, x) => s + x.total, 0);
      paid = Math.min(total, n($("#inv-paid")?.value));
    }
    return `<div class="invoice-brand"><div><h2>ТЕКСТИЛЬ</h2><p>Домашний текстиль · товарная накладная</p></div><div class="invoice-number"><strong>${esc(number)}</strong>${dt(date ? new Date(date).toISOString() : new Date())}</div></div><div class="invoice-meta"><div><b>Покупатель</b>${esc(c?.name || inv?.customerName || "Клиент не выбран")}<br>${esc(c?.phone || inv?.phone || "")}<br>${esc(c?.address || inv?.address || "")}</div><div><b>Поставщик</b>Домашний текстиль<br>Товарный склад</div></div><table><thead><tr><th>№</th><th>Наименование</th><th>Артикул</th><th>Кол-во</th><th>Цена</th><th>Скидка</th><th>Сумма</th></tr></thead><tbody>${
      lines.length
        ? lines
            .map((x, i) => {
              const p = x.p,
                unit = x.unit ?? price(p);
              return `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.article)}</td><td>${x.qty}</td><td>${cash(unit)}</td><td>${x.discount || 0}%</td><td>${cash(x.total ?? invoiceLineAmount(unit, x.qty, x.discount))}</td></tr>`;
            })
            .join("")
        : `<tr><td colspan="7" style="text-align:center;color:#899493;padding:28px">Добавьте товары, чтобы сформировать накладную</td></tr>`
    }</tbody></table><div class="invoice-total"><div class="total-line"><span>Количество</span><span>${lines.reduce((s, x) => s + x.qty, 0)} шт.</span></div><div class="total-line"><span>Сумма</span><span>${cash(total)}</span></div><div class="total-line"><span>Оплачено</span><span>${cash(paid)}</span></div><div class="total-line grand"><span>К оплате</span><span>${cash(total - paid)}</span></div></div><div class="invoice-foot">Товар получил(а): ____________________　Подпись: ____________________</div>`;
  }
  function updateInvoice() {
    const lines = $("#invoice-lines");
    if (lines) lines.innerHTML = invoiceLineHtml();
    const p = $("#printable");
    if (p) p.innerHTML = preview();
  }
  function invoiceHistory() {
    return db.invoices.length
      ? `<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Номер</th><th>Клиент</th><th>Количество</th><th>Сумма</th><th>Долг</th><th></th></tr></thead><tbody>${db.invoices
          .slice(0, 40)
          .map(
            (x) =>
              `<tr><td>${dt(x.date)}</td><td><b>${esc(x.number)}</b></td><td>${esc(x.customerName)}</td><td>${x.lines.reduce((s, l) => s + l.qty, 0)} шт.</td><td>${cash(x.total)}</td><td>${cash(x.total - x.paid)}</td><td><button class="btn small" data-act="print-saved" data-id="${x.id}">Печать</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : empty("Сохранённых накладных пока нет.", "▧");
  }
  function invoices() {
    if (!draft.length) draft = [{ productId: "", qty: 1, discountPercent: 0 }];
    view.innerHTML =
      head(
        "Продажи",
        "Накладные",
        "Выберите клиента и товары. Предпросмотр обновляется автоматически.",
      ) +
      `<div class="split"><div class="card panel no-print"><div class="panel-head"><div><h2>Данные накладной</h2><p>Сохранение спишет товар со склада</p></div></div><form id="inv-form"><div class="form-grid"><div class="field span2"><label>Найти клиента</label><input class="input" id="inv-client-search" placeholder="Введите имя или фамилию"></div><div class="field span2"><label>Клиент</label><select id="inv-client" name="customerId" required>${clientOpts()}</select></div><div class="field"><label>Дата и время</label><input class="input" id="inv-date" name="date" type="datetime-local" value="${now()}"></div><div class="field"><label>Номер</label><input class="input" id="inv-number" name="number" value="НК-${String(db.invoices.length + 1).padStart(4, "0")}"></div><div class="field span2"><label>Поиск товара по названию или артикулу</label><input class="input" id="inv-search" placeholder="Начните вводить товар"></div></div><div class="divider"></div><div class="row-between"><b style="font-size:12px">Товары в накладной</b><span class="small-text">Можно оформить предзаказ в минус</span></div><div id="invoice-lines" class="top-gap">${invoiceLineHtml()}</div><div class="line-add top-gap"><div class="field"><label>Добавить товар</label><select id="line-product">${productOpts()}</select></div><div class="field"><label>Количество</label><input class="input" id="line-qty" type="number" min="1" value="1"></div><button type="button" class="btn soft" data-act="add-line">＋ Строка</button></div><div class="divider"></div><div class="field"><label>Уже оплачено, ₴</label><input class="input" id="inv-paid" name="paid" type="number" min="0" step=".01" value="0"></div><div class="notice top-gap">Остаток суммы автоматически попадёт в баланс клиента.</div><div class="form-actions"><button class="btn primary">Сохранить накладную</button></div></form></div><div class="sticky"><div class="row-between no-print" style="margin-bottom:9px"><span class="small-text">Электронная накладная · предпросмотр</span><button class="btn small" data-act="print-current">Печать</button></div><div id="printable" class="invoice-paper">${preview()}</div></div></div><div class="card panel top-gap no-print"><div class="panel-head"><div><h2>Сохранённые накладные</h2><p>Последние документы</p></div></div>${invoiceHistory()}</div>`;
    $("#inv-form").addEventListener("input", (e) => {
      if (!e.target.matches(".qty, .line-discount")) updateInvoice();
    });
    $("#inv-form").addEventListener("change", (e) => {
      if (!e.target.matches(".qty, .line-discount")) updateInvoice();
    });
    $("#inv-form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget),
        c = find(db.customers, f.get("customerId")),
        lines = draft
          .map((l) => {
            const p = find(db.products, l.productId);
            return p && n(l.qty) > 0
              ? {
                  productId: p.id,
                  name: p.name,
                  article: p.article,
                  qty: n(l.qty),
                  unitPrice: price(p),
                  discountPercent: clampDiscount(l.discountPercent),
                  lineTotal: invoiceLineAmount(
                    price(p),
                    l.qty,
                    l.discountPercent,
                  ),
                }
              : null;
          })
          .filter(Boolean);
      if (!c) return toast("Выберите клиента");
      if (!lines.length) return toast("Добавьте хотя бы один товар");
      const total = lines.reduce((s, l) => s + l.lineTotal, 0),
        paid = Math.min(total, Math.max(0, n(f.get("paid")))),
        date = new Date(f.get("date") || now()).toISOString();
      const invoiceId = id(),
        number = String(f.get("number") || "");
      db.invoices.unshift({
        id: invoiceId,
        number,
        customerId: c.id,
        customerName: c.name,
        phone: c.phone,
        address: c.address,
        date,
        lines,
        total,
        paid,
      });
      db.accounting.unshift({
        id: id(),
        type: "income",
        amount: total,
        category: "Продажа",
        description: `Продажа по накладной ${number}`,
        date,
        source: "invoice",
        refId: invoiceId,
      });
      save();
      draft = [{ productId: "", qty: 1, discountPercent: 0 }];
      toast("Накладная сохранена, склад обновлён");
      invoices();
    };
    $("#inv-search").oninput = (e) => {
      const q = e.target.value.toLowerCase(),
        p = db.products.find((x) => !x.archived &&
          (x.name + " " + x.article).toLowerCase().includes(q),
        );
      if (p) $("#line-product").value = p.id;
    };
    $("#inv-client-search").oninput = (e) => {
      const q = e.target.value.toLowerCase(),
        sel = $("#inv-client"),
        chosen = sel.value,
        items = db.customers.filter((c) => c.name.toLowerCase().includes(q));
      sel.innerHTML = opts(
        items,
        chosen,
        q ? "Совпадения" : "Выберите клиента",
      );
      updateInvoice();
    };
  }
  function notebook() {
    const notes = [...db.notebook].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
    view.innerHTML =
      head(
        "Записи и фотографии",
        "Заметки",
        "Рабочая тетрадь для идей, напоминаний и фото.",
      ) +
      `<div class="card panel bottom-gap"><div class="panel-head"><div><h2>Новая запись</h2><p>Можно сохранить текст, фотографии или всё вместе</p></div></div><form id="notebook-form"><div class="form-grid"><div class="field span2"><label>Заголовок</label><input class="input" name="title" placeholder="Например, новый приход полотенец"></div><div class="field span2"><label>Текст заметки</label><textarea name="text" placeholder="Запишите нужную информацию…"></textarea></div><div class="field span2"><label>Фотографии</label><input class="input" name="photos" type="file" accept="image/*" multiple><small>Фото уменьшатся и сохранятся в этом браузере.</small></div></div><div class="form-actions"><button class="btn primary">＋ Сохранить запись</button></div></form></div>` +
      (notes.length
        ? `<div class="notebook-grid">${notes.map((x) => `<article class="card note-card"><div class="row-between"><div><h2 class="note-title">${esc(x.title || "Заметка")}</h2><time class="small-text">${dt(x.date)}</time></div><button class="btn small danger" data-act="delete-note" data-id="${x.id}" aria-label="Удалить заметку">Удалить</button></div>${x.text ? `<div class="note-text">${esc(x.text)}</div>` : ""}${x.images?.length ? `<div class="note-images">${x.images.map((src) => `<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="Фото из заметки" loading="lazy"></a>`).join("")}</div>` : ""}</article>`).join("")}</div>`
        : empty(
            "Заметок пока нет. Добавьте первую запись или фотографию.",
            "▤",
          ));
    const form = $("#notebook-form");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form),
        title = String(f.get("title") || "").trim(),
        text = String(f.get("text") || "").trim(),
        files = f.getAll("photos").filter((file) => file && file.size > 0);
      if (!title && !text && !files.length)
        return toast("Добавьте текст или выберите фото");
      let images = [];
      try {
        images = await Promise.all(files.map(shrinkImage));
      } catch {
        return toast("Не удалось обработать одно из фото");
      }
      db.notebook.unshift({
        id: id(),
        title:
          title || (text ? text.split(/\r?\n/)[0].slice(0, 60) : "Фотографии"),
        text,
        images,
        date: new Date().toISOString(),
      });
      save();
      toast("Запись сохранена");
      notebook();
    };
  }
  function accounting() {
    const names = {
        week: "Неделя",
        month: "Месяц",
        year: "Год",
        all: "Всё время",
      },
      all = db.accounting.filter(
        (x) => x.type === "income" || x.type === "expense",
      ),
      rows = all
        .filter((x) => inPeriod(x.date, accountingPeriod))
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
      inc = rows
        .filter((x) => x.type === "income")
        .reduce((s, x) => s + n(x.amount), 0),
      exp = rows
        .filter((x) => x.type === "expense")
        .reduce((s, x) => s + n(x.amount), 0),
      controls = `<div class="period-controls">${[
        ["week", "Неделя"],
        ["month", "Месяц"],
        ["year", "Год"],
        ["all", "Всё время"],
      ]
        .map(
          ([key, label]) =>
            `<button class="btn small ${accountingPeriod === key ? "primary" : ""}" data-act="period" data-period="${key}">${label}</button>`,
        )
        .join("")}</div>`;
    view.innerHTML =
      head(
        "Финансовый учёт",
        "Бухгалтерия",
        "Доходы и расходы из накладных, поставок и ваших записей.",
        controls,
      ) +
      `<div class="grid stats">${stat("Доходы", cash(inc), names[accountingPeriod], "↗")}${stat("Расходы", cash(exp), names[accountingPeriod], "↘")}${stat("Итог периода", cash(inc - exp), "Доходы минус расходы", "＝")}${stat("Операций", rows.length, names[accountingPeriod], "▤")}</div><div class="notice bottom-gap"><strong>Автоматический учёт:</strong> приход товара записывает закупку в расходы, сохранённая накладная — полную сумму продажи в доходы. Оплата долга только закрывает задолженность и второй раз в доходы или расходы не попадает.</div><div class="cols top-gap"><div class="card panel"><div class="panel-head"><div><h2>Новая операция</h2><p>Добавьте прочий доход или расход</p></div></div><form id="account-form"><div class="form-grid"><div class="field"><label>Тип операции</label><select name="type"><option value="income">Доход</option><option value="expense">Расход</option></select></div><div class="field"><label>Сумма, ₴</label><input class="input" name="amount" type="number" min=".01" step=".01" required></div><div class="field"><label>Статья</label><input class="input" name="category" placeholder="Например, бензин"></div><div class="field"><label>Дата</label><input class="input" name="date" type="datetime-local" value="${now()}"></div><div class="field span2"><label>Комментарий</label><input class="input" name="description" required placeholder="Краткое описание операции"></div></div><div class="form-actions"><button class="btn primary">Добавить операцию</button></div></form></div><div class="card panel"><div class="panel-head"><div><h2>Итог за ${names[accountingPeriod].toLowerCase()}</h2><p>Доходы − расходы</p></div></div><div class="balance-card"><span>Разница за период</span><strong>${cash(inc - exp)}</strong></div><div class="small-text top-gap">Поступления и продажи добавляются автоматически. Прочие записи вносите вручную.</div></div></div><div class="card panel top-gap"><div class="panel-head"><div><h2>Операции за период</h2><p>Новые записи сверху</p></div></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Источник</th><th>Статья / описание</th><th>Сумма</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${dt(x.date)}</td><td><span class="badge ${x.source && x.source !== "manual" ? "blue" : ""}">${x.source && x.source !== "manual" ? "Автоматически" : "Вручную"}</span></td><td><b>${esc(x.category || (x.type === "income" ? "Доход" : "Расход"))}</b><span class="subline">${esc(x.description || "")}</span></td><td class="${x.type === "income" ? "amount-positive" : "amount-negative"}">${x.type === "income" ? "+" : "−"} ${cash(x.amount)}</td></tr>`).join("")}</tbody></table></div>` : empty("За выбранный период пока нет операций.", "↗")}</div>`;
  }
  function supplierRows(items) {
    return items.length
      ? items
          .map(
            (s) =>
              `<div class="record-item ${supplierId === s.id ? "selected" : ""}" data-act="supplier" data-id="${s.id}"><div><strong>${esc(s.name)}</strong><small>${esc(s.brand || s.phone || "Без бренда")}</small></div><span class="badge ${payable(s.id) > 0 ? "warn" : ""}">${cash(payable(s.id))}</span></div>`,
          )
          .join("")
      : empty("Поставщиков пока нет.", "☏");
  }
  function supplierCard(s) {
    const rows = db.supplierLedger
      .filter((x) => x.supplierId === s.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return `<div class="profile-head"><div><h2>${esc(s.name)}${s.archived ? ' <span class="badge muted-badge">В архиве</span>' : ""}</h2><p>${esc(s.brand || "Бренд не указан")} · ${esc(s.phone || "Телефон не указан")}</p><p>${esc(s.note || "Заметок пока нет")}</p><div class="table-actions top-gap"><button class="btn small" data-act="edit-supplier" data-id="${s.id}">Изменить контакты / заметку</button>${s.archived ? `<button class="btn small primary" data-act="restore-supplier" data-id="${s.id}">Восстановить</button>` : `<button class="btn small danger" data-act="delete-supplier" data-id="${s.id}">Удалить</button>`}</div></div><div class="balance-card"><span>Остаток долга поставщику</span><strong>${cash(payable(s.id))}</strong></div></div>${s.archived ? '<div class="notice bottom-gap">Карточка в архиве: новые поставки недоступны. Здесь можно посмотреть историю и записать оплату остатка долга.</div>' : '<div class="notice">Поступления и дополнительные закупки автоматически учитываются как расходы. Оплата поставщику только уменьшает долг и не дублирует расход.</div>'}<form id="supplier-entry" class="top-gap"><div class="form-grid three"><div class="field"><label>Операция</label><select name="type">${s.archived ? '<option value="payment">Записать оплату</option>' : '<option value="charge">Добавить долг</option><option value="payment">Записать оплату</option>'}</select></div><div class="field"><label>Валюта суммы</label><select name="currency" id="supplier-currency"><option value="UAH">Гривна (₴)</option><option value="USD">Доллар ($)</option></select></div><div class="field"><label id="supplier-amount-label">Сумма, ₴</label><input class="input" name="amount" type="number" min=".01" step=".01" required></div><div class="field span3"><label>Комментарий</label><input class="input" name="note" placeholder="Закупка, перевод…"></div><div class="notice span3" id="supplier-conversion">Сумма будет учтена в гривне.</div></div><div class="form-actions"><button class="btn primary">Добавить запись</button></div></form><div class="divider"></div><h2 style="font-size:14px">История расчётов</h2>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Запись</th><th>Сумма</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${dt(x.date)}</td><td>${esc(x.note || "Расчёт")}</td><td class="${x.amount < 0 ? "amount-positive" : ""}">${x.amount < 0 ? "−" : "+"} ${cash(Math.abs(x.amount))}</td></tr>`).join("")}</tbody></table></div>` : empty("Операций пока нет.", "↔")}`;
  }
  function updateSupplierEntryAmount() {
    const form = $("#supplier-entry");
    if (!form) return;
    const currency = form.elements.currency.value,
      enteredAmount = n(form.elements.amount.value),
      label = $("#supplier-amount-label"),
      conversion = $("#supplier-conversion");
    if (label) label.textContent = "Сумма, " + (currency === "USD" ? "$" : "₴");
    if (!conversion) return;
    if (currency === "USD") {
      const rate = n(db.fx) || 1,
        amountUAH = Math.round(enteredAmount * rate * 100) / 100;
      conversion.textContent = enteredAmount > 0
        ? cash(enteredAmount, "USD") + " = " + cash(amountUAH) + " по текущему курсу 1 $ = " + rate.toFixed(2) + " ₴. В расчётах будет учтена сумма в гривне."
        : "Пересчёт по текущему курсу 1 $ = " + rate.toFixed(2) + " ₴.";
    } else {
      conversion.textContent = enteredAmount > 0
        ? "В расчётах будет учтено " + cash(enteredAmount) + "."
        : "Сумма будет учтена в гривне.";
    }
  }
  function suppliers() {
    if (supplierId && !find(db.suppliers, supplierId)) supplierId = "";
    const s = find(db.suppliers, supplierId),
      visibleSuppliers = db.suppliers.filter((supplier) =>
        showArchivedSuppliers ? supplier.archived : !supplier.archived,
      );
    view.innerHTML =
      head(
        "Контакты и расчёты",
        "Поставщики",
        "Заметки, бренды и баланс долга по каждому контакту.",
      ) +
      `<div class="supplier-layout"><div class="stack"><details class="details"><summary>＋ Добавить поставщика</summary><div class="details-body"><form id="supplier-form"><div class="form-grid"><div class="field span2"><label>Имя / компания</label><input class="input" name="name" required></div><div class="field"><label>Телефон</label><input class="input" name="phone" type="tel"></div><div class="field"><label>Бренд</label><div class="row-between"><select name="brand"><option value="">Выберите бренд</option>${db.brands.map((b) => `<option>${esc(b)}</option>`).join("")}</select><button class="btn small" type="button" data-act="brand">＋</button></div></div><div class="field span2"><label>Заметка</label><textarea name="note" placeholder="Условия, контакты, договорённости…"></textarea></div></div><div class="form-actions"><button class="btn primary">Создать карточку</button></div></form></div></details><div class="card panel"><div class="panel-head row-between"><h2>Поставщики · ${visibleSuppliers.length}</h2><label class="archive-toggle"><input type="checkbox" id="show-archived-suppliers" ${showArchivedSuppliers ? "checked" : ""}> Архив</label></div><div class="record-list">${supplierRows(visibleSuppliers)}</div></div></div><div class="card panel" id="supplier-card">${s ? supplierCard(s) : empty("Выберите поставщика или добавьте контакт.", "☏")}</div></div><div class="card panel top-gap"><div class="panel-head"><div><h2>Бренды</h2><p>Справочник для товаров и поставщиков</p></div><button class="btn small" data-act="brand">＋ Добавить бренд</button></div><div class="category-row">${db.brands.map((x) => `<span class="pill">${esc(x)}</span>`).join("") || '<span class="small-text">Добавьте первый бренд</span>'}</div></div>`;
    $("#show-archived-suppliers").onchange = (event) => {
      showArchivedSuppliers = event.target.checked;
      supplierId = "";
      suppliers();
    };
    const entryForm = $("#supplier-entry");
    entryForm?.addEventListener("input", updateSupplierEntryAmount);
    entryForm?.addEventListener("change", updateSupplierEntryAmount);
    updateSupplierEntryAmount();
  }
  function modal(html, className = "") {
    $("#overlay").innerHTML =
      `<div class="modal-backdrop"><div class="modal ${className}">${html}</div></div>`;
  }
  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-page]");
    if (nav) {
      goto(nav.dataset.page);
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "delete-note") {
      const item = find(db.notebook, b.dataset.id);
      if (item && confirm("Удалить заметку и прикреплённые фото?")) {
        db.notebook = db.notebook.filter((x) => x.id !== item.id);
        save();
        toast("Запись удалена");
        notebook();
      }
      return;
    }
    if (a === "edit-product") {
      const product = find(db.products, b.dataset.id);
      if (!product) return;
      modal(productEditForm(product), "modal-wide");
      const form = $("#edit-product");
      form.querySelector('[name="image"]').onchange = (event) => {
        const file = event.target.files[0],
          preview = $("#edit-image-preview");
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          preview.src = reader.result;
          preview.hidden = false;
        };
        reader.readAsDataURL(file);
      };
      form.onsubmit = async (event) => {
        event.preventDefault();
        const f = new FormData(form),
          name = String(f.get("name")).trim(),
          article = String(f.get("article")).trim(),
          cost = n(f.get("cost")),
          currency = String(f.get("currency")),
          fx = n(f.get("fx")) || n(db.fx),
          markup = n(f.get("markup")),
          brand = String(f.get("brand") || "").trim();
        let image = product.image || "";
        try {
          const file = f.get("image");
          if (file?.size) image = await shrinkImage(file);
        } catch {
          return toast("Не удалось обработать изображение");
        }
        if (brand && !db.brands.includes(brand)) db.brands.push(brand);
        Object.assign(product, {
          name,
          article,
          category: String(f.get("category") || ""),
          brand,
          cost,
          currency,
          fx,
          markup,
          priceUAH: round(
            cost * (currency === "USD" ? fx : 1) * (1 + markup / 100),
          ),
          image,
        });
        save();
        $("#overlay").innerHTML = "";
        toast("Товар обновлён · " + cash(product.priceUAH));
        director();
      };
      return;
    }
    if (a === "delete-product") {
      const product = find(db.products, b.dataset.id);
      if (!product) return;
      const hasHistory =
        db.receipts.some((x) => x.productId === product.id) ||
        db.invoices.some((x) =>
          x.lines.some((line) => line.productId === product.id),
        ) ||
        db.accounting.some((x) => x.stockProductId === product.id);
      if (hasHistory && stock(product.id) !== 0)
        return toast(
          `Нельзя убрать товар: на складе ${stock(product.id)} шт. Сначала оформите движение товара.`,
        );
      const message = hasHistory
        ? "У товара есть история. Переместить его в архив и сохранить накладные и поставки?"
        : "Удалить товар из каталога?";
      if (!confirm(message)) return;
      if (hasHistory) {
        product.archived = true;
        toast("Товар перемещён в архив, история сохранена");
      } else {
        db.products = db.products.filter((x) => x.id !== product.id);
        toast("Товар удалён");
      }
      save();
      director();
      return;
    }
    if (a === "restore-product") {
      const product = find(db.products, b.dataset.id);
      if (!product) return;
      product.archived = false;
      showArchivedProducts = false;
      save();
      toast("Товар возвращён в каталог");
      director();
      return;
    }
    if (a === "delete-supplier") {
      const supplier = find(db.suppliers, b.dataset.id);
      if (!supplier) return;
      const hasHistory =
        db.receipts.some((x) => x.supplierId === supplier.id) ||
        db.supplierLedger.some((x) => x.supplierId === supplier.id);
      if (
        !confirm(
          hasHistory
            ? "У поставщика есть поставки или расчёты. Переместить карточку в архив и сохранить историю?"
            : "Удалить карточку поставщика?",
        )
      )
        return;
      if (hasHistory) {
        supplier.archived = true;
        toast("Поставщик перемещён в архив, история сохранена");
      } else {
        db.suppliers = db.suppliers.filter((x) => x.id !== supplier.id);
        toast("Поставщик удалён");
      }
      supplierId = "";
      save();
      suppliers();
      return;
    }
    if (a === "restore-supplier") {
      const supplier = find(db.suppliers, b.dataset.id);
      if (!supplier) return;
      supplier.archived = false;
      supplierId = supplier.id;
      showArchivedSuppliers = false;
      save();
      toast("Поставщик восстановлен");
      suppliers();
      return;
    }
    if (a === "brand" || a === "category") {
      const val = prompt(
        a === "brand" ? "Название нового бренда" : "Название новой категории",
      );
      if (val && val.trim()) {
        const x = val.trim(),
          arr = a === "brand" ? db.brands : db.categories;
        if (!arr.includes(x)) arr.push(x);
        save();
        toast(a === "brand" ? "Бренд добавлен" : "Категория добавлена");
        render();
      }
      return;
    }
    if (a === "fx") {
      const val = prompt("Курс 1 USD к UAH", String(db.fx));
      if (val !== null && n(val) > 0) {
        db.fx = n(val);
        save();
        goto(page);
      }
      return;
    }
    if (a === "period") {
      accountingPeriod = b.dataset.period || "month";
      accounting();
      return;
    }
    if (a === "client") {
      clientId = b.dataset.id;
      customers();
      return;
    }
    if (a === "supplier") {
      supplierId = b.dataset.id;
      suppliers();
      return;
    }
    if (a === "add-line") {
      const p = $("#line-product").value,
        q = Math.max(1, n($("#line-qty").value));
      if (!p) return toast("Сначала добавьте товары в каталог");
      draft.push({ productId: p, qty: q, discountPercent: 0 });
      updateInvoice();
      return;
    }
    if (a === "remove-line") {
      draft.splice(Number(b.dataset.i), 1);
      if (!draft.length)
        draft = [{ productId: "", qty: 1, discountPercent: 0 }];
      updateInvoice();
      return;
    }
    if (a === "print-current") {
      window.print();
      return;
    }
    if (a === "print-saved") {
      const inv = find(db.invoices, b.dataset.id);
      if (!inv) return;
      $("#overlay").innerHTML =
        `<div class="modal-backdrop"><div style="background:white;padding:24px;border-radius:12px;max-height:90vh;overflow:auto;width:min(850px,100%)"><div class="row-between no-print"><b>${esc(inv.number)}</b><button class="btn small" data-act="print-modal">Печать накладной</button><button class="btn small" data-act="close">Закрыть</button></div><div id="saved-print" class="invoice-paper top-gap">${preview(inv)}</div></div></div>`;
      return;
    }
    if (a === "print-modal") {
      document.body.classList.add("print-saved");
      window.print();
      return;
    }
    if (a === "close") {
      document.body.classList.remove("print-saved");
      $("#overlay").innerHTML = "";
      return;
    }
    if (a === "edit-client") {
      const c = find(db.customers, b.dataset.id);
      if (!c) return;
      modal(
        `<h2>Данные клиента</h2><p>Измените имя, телефон или адрес.</p><form id="edit-client" data-id="${c.id}"><div class="form-grid"><div class="field span2"><label>Имя и фамилия</label><input class="input" name="name" value="${esc(c.name)}" required></div><div class="field span2"><label>Телефон</label><input class="input" name="phone" value="${esc(c.phone)}"></div><div class="field span2"><label>Адрес</label><input class="input" name="address" value="${esc(c.address)}"></div></div><div class="form-actions"><button type="button" class="btn" data-act="close">Отмена</button><button class="btn primary">Сохранить</button></div></form>`,
      );
      return;
    }
    if (a === "edit-supplier") {
      const s = find(db.suppliers, b.dataset.id);
      if (!s) return;
      modal(
        `<h2>Данные поставщика</h2><p>Обновите контакты и заметку.</p><form id="edit-supplier" data-id="${s.id}"><div class="form-grid"><div class="field span2"><label>Имя / компания</label><input class="input" name="name" value="${esc(s.name)}" required></div><div class="field"><label>Телефон</label><input class="input" name="phone" value="${esc(s.phone)}"></div><div class="field"><label>Бренд</label><input class="input" name="brand" value="${esc(s.brand)}"></div><div class="field span2"><label>Заметка</label><textarea name="note">${esc(s.note)}</textarea></div></div><div class="form-actions"><button type="button" class="btn" data-act="close">Отмена</button><button class="btn primary">Сохранить</button></div></form>`,
      );
      return;
    }
  });
  document.addEventListener("input", (e) => {
    if (
      e.target.classList.contains("qty") ||
      e.target.classList.contains("line-discount")
    ) {
      const i = Number(e.target.dataset.i);
      if (draft[i] && e.target.classList.contains("qty"))
        draft[i].qty = Math.max(1, n(e.target.value));
      if (draft[i] && e.target.classList.contains("line-discount")) {
        draft[i].discountPercent = clampDiscount(e.target.value);
        if (e.target.value && (n(e.target.value) < 0 || n(e.target.value) > 100))
          e.target.value = String(draft[i].discountPercent);
      }
      const row = e.target.closest(".line-item"),
        item = find(db.products, draft[i]?.productId);
      if (row && item)
        row.querySelector(".line-total").textContent = cash(
          invoiceLineAmount(
            price(item),
            draft[i]?.qty,
            draft[i]?.discountPercent,
          ),
        );
      const p = $("#printable");
      if (p) p.innerHTML = preview();
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id === "account-form") {
      e.preventDefault();
      const f = new FormData(e.target),
        amount = n(f.get("amount"));
      if (amount <= 0) return toast("Введите сумму больше нуля");
      db.accounting.unshift({
        id: id(),
        type: String(f.get("type")),
        amount,
        category:
          String(f.get("category") || "").trim() ||
          (f.get("type") === "income" ? "Прочий доход" : "Прочий расход"),
        description: String(f.get("description")).trim(),
        date: new Date(f.get("date") || now()).toISOString(),
        source: "manual",
      });
      save();
      toast("Операция добавлена");
      accounting();
    }
    if (e.target.id === "supplier-form") {
      e.preventDefault();
      const f = new FormData(e.target),
        s = {
          id: id(),
          name: String(f.get("name")).trim(),
          phone: String(f.get("phone") || "").trim(),
          brand: String(f.get("brand") || "").trim(),
          note: String(f.get("note") || "").trim(),
        };
      if (s.brand && !db.brands.includes(s.brand)) db.brands.push(s.brand);
      db.suppliers.unshift(s);
      showArchivedSuppliers = false;
      supplierId = s.id;
      save();
      toast("Поставщик добавлен");
      suppliers();
    }
    if (e.target.id === "supplier-entry") {
      e.preventDefault();
      const f = new FormData(e.target),
        tenderAmount = n(f.get("amount")),
        currency = String(f.get("currency") || "UAH"),
        exchangeRate = currency === "USD" ? n(db.fx) : 1,
        amount = Math.round(tenderAmount * exchangeRate * 100) / 100,
        type = String(f.get("type"));
      if (tenderAmount <= 0) return toast("Введите сумму больше нуля");
      if (currency === "USD" && exchangeRate <= 0)
        return toast("Укажите корректный курс доллара в кабинете директора");
      const supplier = find(db.suppliers, supplierId);
      if (supplier?.archived && type === "charge")
        return toast("Восстановите поставщика, чтобы добавить новую закупку");
      const entryId = id(),
        date = new Date().toISOString(),
        noteBase =
          String(f.get("note") || "").trim() ||
          (type === "payment" ? "Оплата поставщику" : "Дополнительная закупка"),
        note = noteBase + (currency === "USD"
          ? " · " + cash(tenderAmount, "USD") + " по курсу " + exchangeRate.toFixed(2) + " ₴/$"
          : "");
      db.supplierLedger.unshift({
        id: entryId,
        supplierId,
        amount: type === "payment" ? -amount : amount,
        tenderAmount,
        currency,
        exchangeRate,
        note,
        date,
        type,
        source: "manual",
      });
      if (type === "charge")
        db.accounting.unshift({
          id: id(),
          type: "expense",
          amount,
          category: "Закупка у поставщика",
          description: note,
          date,
          source: "supplier-charge",
          refId: entryId,
        });
      save();
      toast(
        type === "charge"
          ? "Закупка добавлена в расходы"
          : "Баланс поставщика обновлён",
      );
      suppliers();
    }
    if (e.target.id === "edit-client") {
      e.preventDefault();
      const c = find(db.customers, e.target.dataset.id),
        f = new FormData(e.target);
      if (c) {
        c.name = String(f.get("name")).trim();
        c.phone = String(f.get("phone") || "").trim();
        c.address = String(f.get("address") || "").trim();
      }
      save();
      $("#overlay").innerHTML = "";
      toast("Данные клиента обновлены");
      customers();
    }
    if (e.target.id === "edit-supplier") {
      e.preventDefault();
      const s = find(db.suppliers, e.target.dataset.id),
        f = new FormData(e.target);
      if (s) {
        s.name = String(f.get("name")).trim();
        s.phone = String(f.get("phone") || "").trim();
        s.brand = String(f.get("brand") || "").trim();
        s.note = String(f.get("note") || "").trim();
        if (s.brand && !db.brands.includes(s.brand)) db.brands.push(s.brand);
      }
      save();
      $("#overlay").innerHTML = "";
      toast("Данные поставщика обновлены");
      suppliers();
    }
  });
  window.addEventListener("afterprint", () =>
    document.body.classList.remove("print-saved"),
  );
  $("#mobile-toggle").onclick = () => $("#app").classList.toggle("menu-open");
  goto("director");
})();




