import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

// ─── Animated Add-Product Demo ────────────────────────────────────────────────
const DEMO_STEPS = [
  { id: 'click',  label: 'Click "Add Product"',   hint: 'Button at top-right of the Products page' },
  { id: 'name',   label: 'Enter product name',    hint: 'Type the product name',        field: 'Name',          value: 'Coca Cola 330ml' },
  { id: 'price',  label: 'Set selling price',     hint: 'Enter the price customers pay', field: 'Selling Price', value: '350.00' },
  { id: 'cost',   label: 'Set cost price',        hint: 'Used for profit reports',       field: 'Cost Price',    value: '220.00' },
  { id: 'stock',  label: 'Set stock quantity',    hint: 'How many units you have',       field: 'Stock Qty',     value: '100' },
  { id: 'save',   label: 'Click Save',            hint: 'Product is added to your list!' },
];

function useTyping(target, active) {
  const [typed, setTyped] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    setTyped('');
    if (!active || !target) return;
    let i = 0;
    ref.current = setInterval(() => {
      i++;
      setTyped(target.slice(0, i));
      if (i >= target.length) clearInterval(ref.current);
    }, 60);
    return () => clearInterval(ref.current);
  }, [active, target]);
  return typed;
}

function ProductDemo() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef(null);

  const formValues = { Name: '', 'Selling Price': '', 'Cost Price': '', 'Stock Qty': '' };
  DEMO_STEPS.forEach((s, i) => {
    if (s.field && i < step) formValues[s.field] = s.value;
    if (s.field && i === step) formValues[s.field] = ''; // will be typed
  });
  const current = DEMO_STEPS[step];
  const typedVal = useTyping(current?.value, playing && !!current?.field);

  useEffect(() => {
    if (!playing) return;
    const delay = current?.field ? (current.value.length * 60 + 800) : 1200;
    timerRef.current = setTimeout(() => {
      if (step < DEMO_STEPS.length - 1) setStep(s => s + 1);
      else { setDone(true); setPlaying(false); }
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [step, playing]);

  function replay() { setStep(0); setDone(false); setPlaying(true); }
  function prev()   { setStep(s => Math.max(0, s - 1)); setDone(false); setPlaying(false); }
  function next()   { if (step < DEMO_STEPS.length - 1) { setStep(s => s + 1); setDone(false); } }

  const displayValues = { ...formValues };
  if (current?.field) displayValues[current.field] = typedVal;

  const formOpen = step >= 1;
  const saved    = step === DEMO_STEPS.length - 1 && done;

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden select-none">
      {/* Mock browser chrome */}
      <div className="bg-slate-200 px-4 py-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-3 flex-1 bg-white rounded-md px-3 py-1 text-xs text-slate-400 font-mono">LMUC POS — Products</span>
      </div>

      {/* Mock app */}
      <div className="relative bg-white min-h-[320px] p-4">

        {/* Products header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-sm">Products</h3>
          <button className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all duration-300
            ${step === 0 ? 'bg-orange-500 ring-4 ring-orange-300 scale-105' : 'bg-orange-500'}`}>
            + Add Product
          </button>
        </div>

        {/* Mock product list */}
        <div className="space-y-1.5 mb-3">
          {['Apple iPhone Case', 'USB-C Cable 1m', 'Wireless Mouse'].map(p => (
            <div key={p} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-xs text-slate-600">{p}</span>
              <span className="text-xs font-semibold text-slate-700">LKR 1,200</span>
            </div>
          ))}
        </div>

        {/* Add Product modal */}
        {formOpen && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center p-4"
            style={{ animation: 'fadeIn 0.2s ease' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              style={{ animation: 'slideUp 0.25s ease' }}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <span className="font-bold text-slate-800 text-sm">Add Product</span>
                <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs">✕</span>
              </div>
              <div className="p-5 space-y-3">
                {['Name', 'Selling Price', 'Cost Price', 'Stock Qty'].map(f => (
                  <div key={f}>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">{f}</label>
                    <div className={`border rounded-lg px-3 py-2 text-sm font-mono transition-all duration-200
                      ${current?.field === f ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200'}`}>
                      {displayValues[f] || <span className="text-slate-300">—</span>}
                      {current?.field === f && (
                        <span className="inline-block w-0.5 h-4 bg-orange-500 ml-0.5 animate-pulse align-middle" />
                      )}
                    </div>
                  </div>
                ))}
                <button className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300
                  ${step === DEMO_STEPS.length - 1 ? 'bg-orange-500 ring-4 ring-orange-200 scale-105' : 'bg-orange-400'}`}>
                  Save Product
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success toast */}
        {done && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-green-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg"
            style={{ animation: 'slideDown 0.3s ease' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            Product added successfully!
          </div>
        )}
      </div>

      {/* Step indicator */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          {DEMO_STEPS.map((s, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-500
              ${i < step ? 'bg-orange-500' : i === step ? 'bg-orange-300' : 'bg-slate-200'}`} />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700">
              Step {step + 1}/{DEMO_STEPS.length}: {current?.label}
            </p>
            <p className="text-xs text-slate-400">{current?.hint}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={prev} disabled={step === 0}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-600 disabled:opacity-30 transition-colors">‹</button>
            <button onClick={done ? replay : next}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors">
              {done ? '↺ Replay' : '›'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes slideDown { from { transform: translateY(-12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
}

// ─── Animated Stock Intake Demo ──────────────────────────────────────────────
const INTAKE_STEPS = [
  { id: 'click',   label: 'Click "Stock Intake"',    hint: 'Top-right of the Products page' },
  { id: 'search',  label: 'Search product',          hint: 'Type product name to find it',   field: 'Search Product', value: 'Coca Cola' },
  { id: 'select',  label: 'Select product',          hint: 'Click the product from results' },
  { id: 'qty',     label: 'Enter quantity received', hint: 'How many units arrived',          field: 'Qty Received',   value: '50' },
  { id: 'cost',    label: 'Enter cost price',        hint: 'Price you paid per unit',         field: 'Cost Price',     value: '220.00' },
  { id: 'add',     label: 'Click "Add to Intake"',  hint: 'Adds the row to the intake list' },
  { id: 'save',    label: 'Click "Save Intake"',    hint: 'Stock is updated!' },
];

function StockIntakeDemo() {
  const [step, setStep]     = useState(0);
  const [done, setDone]     = useState(false);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef(null);

  const current = INTAKE_STEPS[step];
  const formValues = { 'Search Product': '', 'Qty Received': '', 'Cost Price': '' };
  INTAKE_STEPS.forEach((s, i) => {
    if (s.field && i < step) formValues[s.field] = s.value;
    if (s.field && i === step) formValues[s.field] = '';
  });

  const typedVal = useTyping(current?.value, playing && !!current?.field);
  const displayValues = { ...formValues };
  if (current?.field) displayValues[current.field] = typedVal;

  const formOpen   = step >= 1;
  const selected   = step >= 3;
  const rowAdded   = step >= 6;
  const saved      = done;

  useEffect(() => {
    if (!playing) return;
    const delay = current?.field ? (current.value.length * 60 + 800) : 1200;
    timerRef.current = setTimeout(() => {
      if (step < INTAKE_STEPS.length - 1) setStep(s => s + 1);
      else { setDone(true); setPlaying(false); }
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [step, playing]);

  function replay() { setStep(0); setDone(false); setPlaying(true); }
  function prev()   { setStep(s => Math.max(0, s - 1)); setDone(false); setPlaying(false); }
  function next()   { if (step < INTAKE_STEPS.length - 1) setStep(s => s + 1); }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden select-none">
      {/* Mock browser chrome */}
      <div className="bg-slate-200 px-4 py-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-3 flex-1 bg-white rounded-md px-3 py-1 text-xs text-slate-400 font-mono">LMUC POS — Stock Intake</span>
      </div>

      <div className="relative bg-white min-h-[320px] p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-sm">Products</h3>
          <div className="flex gap-2">
            <button className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all duration-300
              ${step === 0 ? 'bg-blue-500 ring-4 ring-blue-200 scale-105' : 'bg-blue-500'}`}>
              Stock Intake
            </button>
            <button className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-orange-500">+ Add Product</button>
          </div>
        </div>

        {/* Product list */}
        <div className="space-y-1.5 mb-3">
          {[
            { name: 'Coca Cola 330ml', stock: rowAdded ? 150 : 100 },
            { name: 'Sprite 330ml',    stock: 80 },
            { name: 'Water 500ml',     stock: 200 },
          ].map(p => (
            <div key={p.name} className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all duration-500
              ${p.name === 'Coca Cola 330ml' && rowAdded ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
              <span className="text-xs text-slate-600">{p.name}</span>
              <span className={`text-xs font-semibold transition-colors duration-500 ${p.name === 'Coca Cola 330ml' && rowAdded ? 'text-green-600' : 'text-slate-700'}`}>
                {p.stock} units
              </span>
            </div>
          ))}
        </div>

        {/* Intake modal */}
        {formOpen && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center p-4"
            style={{ animation: 'fadeIn 0.2s ease' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              style={{ animation: 'slideUp 0.25s ease' }}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <span className="font-bold text-slate-800 text-sm">Stock Intake</span>
                <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs">✕</span>
              </div>
              <div className="p-5 space-y-3">
                {/* Search field */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Search Product</label>
                  <div className={`border rounded-lg px-3 py-2 text-sm font-mono transition-all duration-200
                    ${current?.field === 'Search Product' ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                    {displayValues['Search Product'] || <span className="text-slate-300">—</span>}
                    {current?.field === 'Search Product' && (
                      <span className="inline-block w-0.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle" />
                    )}
                  </div>
                  {/* Dropdown result */}
                  {step >= 2 && !selected && (
                    <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-md overflow-hidden"
                      style={{ animation: 'fadeIn 0.2s ease' }}>
                      <div className={`px-3 py-2 text-xs font-medium transition-colors
                        ${step === 2 ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'text-slate-700 hover:bg-slate-50'}`}>
                        Coca Cola 330ml — 100 units
                      </div>
                    </div>
                  )}
                  {selected && (
                    <div className="mt-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-700"
                      style={{ animation: 'fadeIn 0.2s ease' }}>
                      ✓ Coca Cola 330ml
                    </div>
                  )}
                </div>

                {selected && (
                  <>
                    {['Qty Received', 'Cost Price'].map(f => (
                      <div key={f}>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">{f}</label>
                        <div className={`border rounded-lg px-3 py-2 text-sm font-mono transition-all duration-200
                          ${current?.field === f ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                          {displayValues[f] || <span className="text-slate-300">—</span>}
                          {current?.field === f && (
                            <span className="inline-block w-0.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle" />
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button className={`flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-300
                        ${step === 5 ? 'bg-blue-500 ring-4 ring-blue-200 scale-105' : 'bg-blue-400'}`}>
                        Add to Intake
                      </button>
                      <button className={`flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-300
                        ${step === 6 || done ? 'bg-green-500 ring-4 ring-green-200 scale-105' : 'bg-slate-300 text-slate-500'}`}
                        disabled={step < 6}>
                        Save Intake
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success toast */}
        {saved && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-green-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg"
            style={{ animation: 'slideDown 0.3s ease' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
            </svg>
            Stock updated! +50 units added.
          </div>
        )}
      </div>

      {/* Step indicator */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
        <div className="flex items-center gap-1 mb-2">
          {INTAKE_STEPS.map((s, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-500
              ${i < step ? 'bg-blue-500' : i === step ? 'bg-blue-300' : 'bg-slate-200'}`} />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700">
              Step {step + 1}/{INTAKE_STEPS.length}: {current?.label}
            </p>
            <p className="text-xs text-slate-400">{current?.hint}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={prev} disabled={step === 0}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-600 disabled:opacity-30 transition-colors">‹</button>
            <button onClick={done ? replay : next}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors">
              {done ? '↺ Replay' : '›'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SECTIONS = [
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting Started',
    articles: [
      {
        title: 'Logging In',
        body: `Open LMUC POS and you will see the login screen. Select your user profile from the list, enter your password, and press Login or hit Enter.

• Admin users have full access to all features.
• Cashiers are limited to the POS (sales) screen.
• Other roles (Manager, Custom) see only the features assigned to them under Role Permissions.

If you forget your password, an Admin must reset it from Settings → Users.`,
      },
      {
        title: 'First-Time Setup',
        body: `After first login as Admin, configure these in Settings:

1. Shop Info — set your shop name, address, and logo.
2. Receipt — add your footer message and choose receipt width.
3. POS — choose your default interface (Grid or List) and tax rate.
4. Users — create staff accounts and assign roles.
5. Role Permissions — control which pages each role can access.

Once done, your cashiers can log in and start selling.`,
      },
    ],
  },
  {
    id: 'pos',
    icon: '🛒',
    title: 'Point of Sale (POS)',
    articles: [
      {
        title: 'Making a Sale',
        body: `1. Go to Sales → New Sale from the sidebar (or press the POS button).
2. Search for a product by name or scan its barcode — click or press Enter to add it to the cart.
3. Adjust quantities by clicking the + / – buttons on each cart row, or type directly.
4. Choose a customer (optional) — click the customer icon to search and select.
5. Apply a discount if needed — enter a percentage or fixed amount.
6. Click Checkout, choose the payment method (Cash / Card / Credit), and confirm.
7. A receipt is printed automatically if a printer is configured.`,
      },
      {
        title: 'Cash Drawer',
        body: `If a cash drawer is connected to your receipt printer, it opens automatically on every cash payment.

To open manually: go to Settings → POS → Open Cash Drawer.

Supported: ESC/POS printers connected via USB, Network (IP), or COM port.`,
      },
      {
        title: 'Offline Mode',
        body: `LMUC POS works without internet. Sales made offline are saved locally and show a Pending badge in the topbar.

When the connection is restored, click the Sync button (↺) in the topbar to push pending sales to the server. The sync happens automatically in the background as well.

Note: some features (reports, user management) require a connection and will be greyed out when offline.`,
      },
    ],
  },
  {
    id: 'products',
    icon: '📦',
    title: 'Products',
    articles: [
      {
        title: 'Adding a Product',
        demo: 'add-product',
        body: `Go to Products → Add Product.

Required: Name, Selling Price.
Optional: Cost Price (used for profit reports and opening balance), Barcode, Category, Stock Quantity, Unit.

• Enable "Track Stock" to deduct quantity on each sale.
• Upload a product image for the POS grid view.
• Set a Reorder Level to get low-stock alerts.`,
      },
      {
        title: 'Stock Intake (Receiving Stock)',
        demo: 'stock-intake',
        body: `Go to Products → Stock Intake to record new stock arriving.

1. Select the product.
2. Enter the quantity received and cost price per unit.
3. Save — stock is added and cost price updated automatically.

This is also linked to Purchases if you have the supplier module enabled.`,
      },
      {
        title: 'Importing Products',
        body: `Go to Products → Import to upload a CSV file.

Download the sample template first to see the required columns (name, selling_price, cost_price, stock_qty, barcode, category).

Existing products are updated by barcode match; new rows are created.`,
      },
    ],
  },
  {
    id: 'customers',
    icon: '👥',
    title: 'Customers',
    articles: [
      {
        title: 'Adding a Customer',
        body: `Go to Customers → Add Customer.

Enter the customer's name, phone, and optional address. You can also add a credit limit if you allow credit sales.`,
      },
      {
        title: 'Credit Sales',
        body: `During checkout, select Credit as the payment method (the customer must be selected first).

The sale is recorded and the amount added to the customer's outstanding balance.

Go to Customers → [Customer Name] → Credit to view their balance and record payments when they pay off the debt.`,
      },
    ],
  },
  {
    id: 'reports',
    icon: '📊',
    title: 'Reports',
    articles: [
      {
        title: 'Sales Report',
        body: `Go to Reports → Sales.

Filter by date range, cashier, or payment method. The report shows:
• Total sales amount
• Number of transactions
• Average sale value
• Sales by product (top sellers)
• Payment method breakdown

Use the Print button to print or export as PDF.`,
      },
      {
        title: 'Profit Report',
        body: `The Profit report shows gross profit per product (selling price − cost price × qty sold).

Requires cost prices to be set on products. Go to Products and update cost prices if they show as 0.`,
      },
    ],
  },
  {
    id: 'accounting',
    icon: '📒',
    title: 'Accounting',
    articles: [
      {
        title: 'Overview',
        body: `The Accounting module uses double-entry bookkeeping. Every sale automatically creates a journal entry:
• Debit: Cash / Accounts Receivable
• Credit: Sales Revenue
• Debit: Cost of Goods Sold → Credit: Inventory

Go to Accounting from the sidebar to view the Chart of Accounts, Journal Entries, and Trial Balance.`,
      },
      {
        title: 'Setting Opening Balance',
        body: `On first use, set your opening balance to establish starting values for assets:

1. Go to Accounting → Set Opening Balance (button in the header).
2. Enter your Cash on Hand, Bank Balance, and Accounts Receivable.
3. Inventory value is auto-fetched from your product stock × cost prices.
4. Review the Owner's Equity credit (calculated automatically).
5. Click Post Opening Balance.

This can only be done once. If you need to correct it, contact your accountant.`,
      },
      {
        title: 'Trial Balance',
        body: `The Trial Balance tab shows all accounts with their total debits and credits. The bottom row shows whether the books are balanced (Debit total = Credit total).

If the trial balance is unbalanced, check for any manual journal entries with incorrect amounts.`,
      },
    ],
  },
  {
    id: 'users',
    icon: '👤',
    title: 'Users & Roles',
    articles: [
      {
        title: 'Creating a User',
        body: `Go to Users → Add User (Admin only).

Enter name, email, and password. Assign a role:
• Admin — full access, cannot be restricted.
• Cashier — POS only by default.
• Manager — management features by default.
• Custom — you choose exactly which pages they can see.

The user can log in immediately after creation.`,
      },
      {
        title: 'Role Permissions',
        body: `Go to Role Permissions to control what each role can access.

Select a role from the list and toggle features on/off. Changes take effect on the user's next login.

You can create new roles with any name and assign specific features to them. The built-in "admin" role always has full access and cannot be restricted.`,
      },
    ],
  },
  {
    id: 'settings',
    icon: '⚙️',
    title: 'Settings',
    articles: [
      {
        title: 'Shop Settings',
        body: `Settings → Shop tab:
• Shop Name, Address, Phone — appears on receipts.
• Shop Logo — upload a PNG/JPG (shown in sidebar and receipts).
• Currency Symbol and Decimal Places.
• Tax Rate (%) — applied by default in the POS.`,
      },
      {
        title: 'Receipt Settings',
        body: `Settings → Receipt tab:
• Receipt Width — 58mm or 80mm to match your paper roll.
• Footer Message — thank-you note printed at the bottom.
• Show/hide columns (cost price, tax, discount).
• Auto-print on sale — toggle to print automatically without confirmation.`,
      },
      {
        title: 'Appearance',
        body: `Settings → Appearance tab:
• Sidebar Theme — choose from Slate, Black, Navy, Green, Teal, Purple, Coffee.
• Dark Mode — toggle dark/light mode (also available from the topbar moon icon).
• UI Zoom — scale the interface up or down (useful for small/large screens).`,
      },
      {
        title: 'System / Backup',
        body: `Settings → System tab:
• Backup Database — downloads a copy of your SQLite database file.
• Clear All Data — wipes the local database (use with caution, cannot be undone).
• App Version — shows the current installed version.
• Check for Updates — manually trigger the auto-updater.`,
      },
    ],
  },
  {
    id: 'extensions',
    icon: '🧩',
    title: 'Extensions',
    articles: [
      {
        title: 'What are Extensions?',
        body: `Extensions add optional modules to LMUC POS. Go to Extensions from the sidebar to see available modules.

Currently available:
• Accounting — full double-entry bookkeeping (Chart of Accounts, Journal Entries, Trial Balance).

Toggle an extension on to enable it — a restart may be required for sidebar changes to appear.`,
      },
    ],
  },
  {
    id: 'license',
    icon: '🔑',
    title: 'License & Activation',
    articles: [
      {
        title: 'Trial Period',
        body: `On first launch, LMUC POS automatically registers your device and issues a 3-day free trial. No action is needed — the app starts working immediately.

After the trial expires, the activation screen appears. Contact support to purchase a license.`,
      },
      {
        title: 'Activating a License',
        body: `When prompted:
1. Note your Device ID shown on the activation screen.
2. Send it to support@lumac.cc along with your preferred plan (Monthly / Yearly / Lifetime).
3. You'll receive a license key in the format LMUC-XXXX-XXXX-XXXX-XXXX.
4. Enter the key on the activation screen and click Activate License.

Once activated, the app works offline — no internet needed for daily use.`,
      },
      {
        title: 'License Plans',
        body: `• Trial — 3 days, free, auto-issued on first launch.
• Monthly — 30 days, renew each month.
• Yearly — 365 days, best value.
• Lifetime — never expires.

Your current license info (plan, expiry) is shown on the activation screen if you need to renew.`,
      },
    ],
  },
];

export default function Help() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dark = theme === 'dark';

  const [search, setSearch]     = useState('');
  const [activeId, setActiveId] = useState('getting-started');
  const [openArt, setOpenArt]   = useState(null);

  const q = search.toLowerCase();
  const filtered = SECTIONS.map(s => ({
    ...s,
    articles: s.articles.filter(a =>
      !q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
    ),
  })).filter(s => !q || s.articles.length > 0 || s.title.toLowerCase().includes(q));

  const activeSection = filtered.find(s => s.id === activeId) || filtered[0];

  return (
    <div className={`flex flex-col h-full ${dark ? 'bg-[#1c1c1c] text-white' : 'bg-slate-50 text-slate-900'}`}>

      {/* Header */}
      <div className={`shrink-0 px-6 py-4 border-b flex items-center gap-3 ${dark ? 'border-[#2a2a2a] bg-[#141414]' : 'border-slate-200 bg-white'}`}>
        <button onClick={() => navigate(-1)}
          className={`p-1.5 rounded-lg transition-colors ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-bold">Help & User Guide</h1>
          <p className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Everything you need to know about LMUC POS</p>
        </div>
        <div className="ml-auto relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpenArt(null); }}
            placeholder="Search help…"
            className={`pl-9 pr-4 py-2 text-sm rounded-xl border outline-none w-56 transition
              ${dark ? 'bg-[#252525] border-[#2a2a2a] text-white placeholder:text-slate-500 focus:border-orange-500' : 'bg-slate-50 border-slate-200 focus:border-orange-400'}`}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className={`w-56 shrink-0 border-r flex flex-col py-3 overflow-y-auto ${dark ? 'border-[#2a2a2a] bg-[#141414]' : 'border-slate-200 bg-white'}`}>
          {filtered.map(s => (
            <button key={s.id}
              onClick={() => { setActiveId(s.id); setOpenArt(null); setSearch(''); }}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors
                ${activeId === s.id
                  ? 'bg-orange-500 text-white'
                  : dark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'}`}>
              <span>{s.icon}</span>
              <span className="truncate">{s.title}</span>
            </button>
          ))}

          <div className={`mt-auto px-4 pt-4 pb-2 border-t ${dark ? 'border-[#2a2a2a]' : 'border-slate-100'}`}>
            <p className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Need more help?</p>
            <a href="mailto:support@lumac.cc" className="text-xs text-orange-500 hover:underline font-medium">support@lumac.cc</a>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 max-w-3xl">
          {activeSection ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{activeSection.icon}</span>
                <h2 className="text-xl font-bold">{activeSection.title}</h2>
              </div>

              <div className="space-y-3">
                {activeSection.articles.map((art, i) => {
                  const isOpen = openArt === i;
                  return (
                    <div key={i}
                      className={`rounded-2xl border overflow-hidden transition-all
                        ${dark ? 'border-[#2a2a2a] bg-[#1a1a1a]' : 'border-slate-200 bg-white shadow-sm'}`}>
                      <button
                        onClick={() => setOpenArt(isOpen ? null : i)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left gap-3">
                        <span className="font-semibold text-sm">{art.title}</span>
                        <svg className={`w-4 h-4 shrink-0 transition-transform ${dark ? 'text-slate-400' : 'text-slate-400'} ${isOpen ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </button>
                      {isOpen && (
                        <div className={`px-5 pb-5 border-t text-sm leading-relaxed whitespace-pre-line
                          ${dark ? 'border-[#2a2a2a] text-slate-300' : 'border-slate-100 text-slate-600'}`}>
                          {art.demo === 'add-product'   && <ProductDemo />}
                          {art.demo === 'stock-intake'  && <StockIntakeDemo />}
                          <div className="pt-4">{art.body}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <p className="text-4xl mb-3">🔍</p>
              <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>No results for "{search}"</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
