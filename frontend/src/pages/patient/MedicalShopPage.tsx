import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { INITIAL_MEDICINE_CATALOG, type MedicalProduct } from '../../data/medicineCatalog';
import { checkCase } from '../../api/patientApi';

interface CartItem {
  product: MedicalProduct;
  quantity: number;
}

export const MedicalShopPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const caseIdParam = searchParams.get('caseId') || searchParams.get('id') || '';

  // Products & Categories
  const [products] = useState<MedicalProduct[]>(INITIAL_MEDICINE_CATALOG);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartDrawer, setShowCartDrawer] = useState<boolean>(false);

  // Prescription detected state
  const [prescribedItems, setPrescribedItems] = useState<string[]>([]);
  const [patientCase, setPatientCase] = useState<any | null>(null);

  // Checkout form
  const [deliveryMode, setDeliveryMode] = useState<string>('village_courier');
  const [villageAddress, setVillageAddress] = useState<string>('');
  const [contactNumber, setContactNumber] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cod');
  const [orderConfirmed, setOrderConfirmed] = useState<any | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  const urlTokenParam = searchParams.get('token') || '';

  // If a case ID is provided, look up patient prescription to auto-select prescribed medicines
  useEffect(() => {
    if (caseIdParam) {
      const token = urlTokenParam || sessionStorage.getItem(`case_token_${caseIdParam}`) || '';
      if (token) {
        checkCase(caseIdParam, token)
          .then((data) => {
            setPatientCase(data);
            if (data.treatment?.items) {
              const medNames = data.treatment.items.map((it: any) =>
                (it.medicine_name || '').toLowerCase()
              );
              setPrescribedItems(medNames);

              // Auto add prescribed medicines into cart
              const autoItems: CartItem[] = [];
              products.forEach((p) => {
                const match = medNames.some((n: string) =>
                  p.name.toLowerCase().includes(n) || p.generic_name.toLowerCase().includes(n)
                );
                if (match) {
                  autoItems.push({ product: p, quantity: 1 });
                }
              });
              if (autoItems.length > 0) {
                setCart(autoItems);
              }
            }
          })
          .catch((err) => console.log('Case lookup for shop:', err));
      }
    }
  }, [caseIdParam, products, urlTokenParam]);

  // Categories list
  const categories = [
    'All',
    'Fever & Pain',
    'Antibiotics & Infection',
    'Digestion & ORS',
    'Chronic Care (BP & Sugar)',
    'First Aid & Devices',
    'Vitamins & Immunity',
  ];

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = activeCategory === 'All' || p.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.generic_name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, searchQuery]);

  // Cart operations
  const addToCart = (product: MedicalProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.product.id === productId ? { ...item, quantity: qty } : item
        )
      );
    }
  };

  const totalMrp = cart.reduce((acc, item) => acc + item.product.mrp * item.quantity, 0);
  const totalSubsidized = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const totalSavings = totalMrp - totalSubsidized;
  const totalItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Delivery fee
  const deliveryFee = deliveryMode === 'kendra_pickup' ? 0 : 20;
  const grandTotal = totalSubsidized + deliveryFee;

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert('Your cart is empty. Please add medicines before ordering.');
      return;
    }
    if (!contactNumber.trim()) {
      alert('Please enter your 10-digit mobile or WhatsApp number.');
      return;
    }
    if (deliveryMode !== 'kendra_pickup' && !villageAddress.trim()) {
      alert('Please enter your village / gram panchayat address.');
      return;
    }

    setIsSubmittingOrder(true);
    setTimeout(() => {
      const orderId = `ORD-OD-${Math.floor(100000 + Math.random() * 900000)}`;
      setOrderConfirmed({
        orderId,
        items: [...cart],
        grandTotal,
        totalSavings,
        deliveryMode,
        villageAddress,
        contactNumber,
        paymentMethod,
        timestamp: new Date().toLocaleString(),
      });
      setCart([]);
      setIsSubmittingOrder(false);
      setShowCartDrawer(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-cream font-sans text-ink">
      {/* ── Subsidized Store Announcement Bar ── */}
      <div className="bg-gradient-to-r from-ink via-ink to-magentadeep text-cream px-4 py-2.5 text-xs">
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="bg-magenta text-cream font-bold px-2 py-0.5 rounded text-[10px] uppercase">
              PMBJP Certified
            </span>
            <span>
              <strong>Pradhan Mantri Bharatiya Janaushadhi Kendra:</strong> Genuine generic medications up to 70–85% cheaper than market MRP.
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-cream/75">
            <span>Free Delivery across Rural Odisha Health Hubs</span>
            <span>•</span>
            <span className="text-magenta font-semibold">Emergency Helpline: 108</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-8">
        {/* ── Prescription Notification Banner (if caseId present) ── */}
        {caseIdParam && (
          <div className="bg-gradient-to-r from-magenta/15 via-creamdeep to-creamdeep rounded-3xl border border-magenta/30 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-magenta text-cream flex items-center justify-center shrink-0 shadow-md">
                <iconify-icon icon="ph:prescription-bold" width="24" height="24"></iconify-icon>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-ink">
                    Prescription Detected for Case {caseIdParam}
                  </h2>
                  <span className="bg-magenta text-cream text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                    Doctor Approved
                  </span>
                </div>
                <p className="text-xs text-inkmute mt-0.5">
                  {patientCase?.patient_name ? (
                    <>Patient: <strong className="text-ink">{patientCase.patient_name}</strong> • </>
                  ) : null}
                  Prescribed medications have been highlighted and pre-selected in your Jan Aushadhi order cart.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowCartDrawer(true)}
              className="pill pill-magenta px-5 py-2.5 text-xs font-bold shrink-0 self-start sm:self-auto flex items-center gap-1.5 shadow-sm"
            >
              <iconify-icon icon="ph:shopping-bag-bold" width="15" height="15"></iconify-icon>
              <span>View Prescribed Cart ({totalItemCount})</span>
            </button>
          </div>
        )}

        {/* ── Store Header with Search & Cart Pill ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ink/8 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif opsz-96 font-medium text-2xl sm:text-3xl text-ink">
                Jan Aushadhi Medical Store
              </h1>
              <span className="text-xs bg-magenta/10 text-magenta font-bold px-2.5 py-0.5 rounded-full border border-magenta/20">
                ଜନ ଔଷଧି କେନ୍ଦ୍ର
              </span>
            </div>
            <p className="text-xs text-inkmute mt-1">
              Browse government-subsidized pharmaceuticals, diagnostic kits, and home healthcare supplies.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-72">
              <iconify-icon
                icon="ph:magnifying-glass-bold"
                width="16"
                height="16"
                style={{ color: '#5a544a', position: 'absolute', left: '12px', top: '11px' } as any}
              ></iconify-icon>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search medicine, formula, or device..."
                className="w-full border border-ink/14 rounded-xl pl-9 pr-3.5 py-2 text-xs bg-creamdeep text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta placeholder:text-inkmute/50"
              />
            </div>

            {/* Cart Trigger Button */}
            <button
              onClick={() => setShowCartDrawer(true)}
              className="pill pill-ink px-4 py-2 text-xs font-bold relative shrink-0 flex items-center gap-2"
            >
              <iconify-icon icon="ph:shopping-cart-bold" width="16" height="16"></iconify-icon>
              <span>Cart</span>
              {totalItemCount > 0 && (
                <span className="bg-magenta text-cream text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center">
                  {totalItemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Category Filters ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none text-xs font-semibold">
          {categories.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all ${
                  active
                    ? 'bg-ink text-cream shadow-sm'
                    : 'bg-creamdeep text-inkmute hover:text-ink hover:bg-ink/5 border border-ink/8'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* ── Products Grid with Real Photos ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredProducts.map((p) => {
            const isPrescribed = prescribedItems.some((n) =>
              p.name.toLowerCase().includes(n) || p.generic_name.toLowerCase().includes(n)
            );
            const inCart = cart.find((item) => item.product.id === p.id);

            return (
              <div
                key={p.id}
                className={`bg-creamdeep rounded-3xl border transition-all duration-300 overflow-hidden flex flex-col group hover:shadow-lg ${
                  isPrescribed
                    ? 'border-magenta ring-2 ring-magenta/20'
                    : 'border-ink/10 hover:border-ink/25'
                }`}
              >
                {/* Product Image Box */}
                <div className="relative h-48 bg-cream flex items-center justify-center overflow-hidden">
                  <img
                    src={p.image}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {/* Badge overlays */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1">
                    {isPrescribed && (
                      <span className="bg-magenta text-cream text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shadow-sm flex items-center gap-1">
                        <iconify-icon icon="ph:check-bold" width="10" height="10"></iconify-icon>
                        Prescribed
                      </span>
                    )}
                    <span className="bg-ink/80 backdrop-blur-sm text-cream text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase">
                      {p.dosage_form}
                    </span>
                  </div>

                  <span className="absolute top-3 right-3 bg-green-700 text-cream text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-xs">
                    {p.discount_pct}% OFF
                  </span>
                </div>

                {/* Product Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-magenta">
                      {p.category}
                    </span>
                    <h3 className="font-serif opsz-72 text-base font-semibold text-ink leading-tight line-clamp-1" title={p.name}>
                      {p.name}
                    </h3>
                    <p className="text-[11px] text-inkmute font-medium line-clamp-1" title={p.generic_name}>
                      {p.generic_name}
                    </p>
                    <p className="text-[11px] text-inkmute/80 line-clamp-2 leading-relaxed pt-1">
                      {p.description}
                    </p>
                  </div>

                  {/* Price & Action */}
                  <div className="pt-3 border-t border-ink/8 space-y-3">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-[10px] text-inkmute line-through mr-1.5">
                          MRP ₹{p.mrp}
                        </span>
                        <span className="font-serif opsz-72 text-2xl font-bold text-ink">
                          ₹{p.price}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-green-700 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                        Save ₹{p.mrp - p.price}
                      </span>
                    </div>

                    {inCart ? (
                      <div className="flex items-center justify-between bg-cream rounded-xl border border-ink/12 p-1">
                        <button
                          onClick={() => updateQuantity(p.id, inCart.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-creamdeep text-ink flex items-center justify-center font-bold hover:bg-ink hover:text-cream transition-colors"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs font-bold text-ink px-3">
                          {inCart.quantity} in cart
                        </span>
                        <button
                          onClick={() => updateQuantity(p.id, inCart.quantity + 1)}
                          className="w-7 h-7 rounded-lg bg-creamdeep text-ink flex items-center justify-center font-bold hover:bg-ink hover:text-cream transition-colors"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(p)}
                        className={`w-full pill py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          isPrescribed ? 'pill-magenta' : 'pill-ink'
                        }`}
                      >
                        <iconify-icon icon="ph:plus-bold" width="13" height="13"></iconify-icon>
                        <span>Add to Order</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Slide-Out Cart & Checkout Drawer ── */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex justify-end">
          <div className="bg-creamdeep w-full max-w-lg h-full border-l border-ink/10 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="bg-ink text-cream p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-magenta flex items-center justify-center">
                  <iconify-icon icon="ph:shopping-cart-fill" width="16" height="16"></iconify-icon>
                </div>
                <div>
                  <h3 className="font-serif opsz-72 text-sm font-semibold">Jan Aushadhi Cart</h3>
                  <p className="text-[11px] text-cream/60">{totalItemCount} items selected</p>
                </div>
              </div>

              <button
                onClick={() => setShowCartDrawer(false)}
                className="text-cream/70 hover:text-cream p-1.5 rounded-lg hover:bg-cream/10"
              >
                <iconify-icon icon="ph:x-bold" width="18" height="18"></iconify-icon>
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cart.length === 0 ? (
                <div className="py-20 text-center text-inkmute space-y-3">
                  <div className="w-12 h-12 rounded-full bg-ink/6 flex items-center justify-center mx-auto">
                    <iconify-icon icon="ph:shopping-bag-bold" width="24" height="24"></iconify-icon>
                  </div>
                  <p className="font-medium text-ink text-xs">Your cart is currently empty.</p>
                  <p className="text-[11px]">Browse the store to add subsidized medicines.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="bg-cream p-3.5 rounded-2xl border border-ink/8 flex items-center gap-3"
                      >
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-14 h-14 rounded-xl object-cover shrink-0 border border-ink/8"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-ink truncate">{item.product.name}</h4>
                          <span className="text-[10px] text-inkmute block truncate">{item.product.generic_name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-bold text-xs text-magenta">₹{item.product.price}</span>
                            <span className="text-[10px] text-inkmute line-through">₹{item.product.mrp}</span>
                          </div>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-1.5 bg-creamdeep px-2 py-1 rounded-xl border border-ink/8">
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="text-xs font-bold text-ink w-5 h-5 flex items-center justify-center hover:text-magenta"
                          >
                            -
                          </button>
                          <span className="font-mono text-xs font-bold text-ink w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            className="text-xs font-bold text-ink w-5 h-5 flex items-center justify-center hover:text-magenta"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Checkout Details Form */}
                  <div className="bg-cream p-4 rounded-2xl border border-ink/8 space-y-3.5 text-xs pt-4">
                    <h4 className="font-bold uppercase tracking-wider text-ink text-[11px]">
                      Delivery & Contact Details
                    </h4>

                    {/* Delivery Option */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-ink block">Delivery Preference:</label>
                      <select
                        value={deliveryMode}
                        onChange={(e) => setDeliveryMode(e.target.value)}
                        className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-creamdeep text-ink text-xs focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                      >
                        <option value="village_courier">Village Home Delivery / Courier (+₹20)</option>
                        <option value="kendra_pickup">Jan Aushadhi Kendra Counter Pickup (FREE)</option>
                        <option value="phc_express">Primary Health Center (PHC) Delivery (+₹20)</option>
                      </select>
                    </div>

                    {deliveryMode !== 'kendra_pickup' && (
                      <div className="space-y-1.5">
                        <label className="font-semibold text-ink block">
                          Village / Gram Panchayat Address:
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={villageAddress}
                          onChange={(e) => setVillageAddress(e.target.value)}
                          placeholder="e.g. Ward 4, Kantabada Village, Begunia Block, Khordha, Odisha - 752062"
                          className="w-full border border-ink/14 rounded-xl p-2.5 bg-creamdeep text-ink text-xs focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="font-semibold text-ink block">
                        WhatsApp / Contact Mobile Number:
                      </label>
                      <input
                        type="tel"
                        required
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="e.g. 9876543210 (For live delivery SMS updates)"
                        className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-creamdeep text-ink text-xs focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                      />
                    </div>

                    {/* Payment Mode */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-ink block">Payment Method:</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-creamdeep text-ink text-xs focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                      >
                        <option value="cod">Cash on Delivery (COD) / Counter Cash</option>
                        <option value="upi">UPI / QR Code on Delivery</option>
                        <option value="bsky">Biju Swasthya Kalyan Yojana (BSKY Card)</option>
                      </select>
                    </div>
                  </div>

                  {/* Pricing Summary */}
                  <div className="bg-magenta/5 border border-magenta/20 p-4 rounded-2xl space-y-1.5 text-xs">
                    <div className="flex justify-between text-inkmute">
                      <span>Total Market Brand MRP:</span>
                      <span className="line-through">₹{totalMrp}</span>
                    </div>
                    <div className="flex justify-between text-ink font-semibold">
                      <span>Jan Aushadhi Subsidized Price:</span>
                      <span>₹{totalSubsidized}</span>
                    </div>
                    <div className="flex justify-between text-inkmute">
                      <span>Delivery Fee:</span>
                      <span>{deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}</span>
                    </div>
                    <div className="border-t border-magenta/20 pt-1.5 flex justify-between font-bold text-sm text-magenta">
                      <span>Total Payable:</span>
                      <span>₹{grandTotal}</span>
                    </div>
                    <p className="text-[11px] text-green-700 font-bold pt-1 text-center">
                      🎉 You are saving ₹{totalSavings} with PMBJP subsidies!
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer */}
            {cart.length > 0 && (
              <div className="p-5 bg-cream border-t border-ink/10">
                <button
                  type="button"
                  disabled={isSubmittingOrder}
                  onClick={handlePlaceOrder}
                  className="w-full pill pill-magenta py-3 text-xs font-bold shadow-md flex items-center justify-center gap-2"
                >
                  <iconify-icon icon="ph:check-circle-bold" width="16" height="16"></iconify-icon>
                  <span>{isSubmittingOrder ? 'Processing...' : `Place Medicine Order (₹${grandTotal})`}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Order Confirmed Receipt Modal ── */}
      {orderConfirmed && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-creamdeep rounded-3xl shadow-2xl max-w-md w-full border border-ink/10 p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-green-600 text-cream flex items-center justify-center mx-auto text-2xl shadow-lg">
                ✓
              </div>
              <h3 className="font-serif opsz-72 text-xl font-bold text-ink">
                Medicine Order Confirmed!
              </h3>
              <p className="text-xs text-inkmute">
                Order ID: <strong className="font-mono text-ink">{orderConfirmed.orderId}</strong>
              </p>
            </div>

            <div className="bg-cream p-4 rounded-2xl border border-ink/8 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-inkmute">Delivery To:</span>
                <span className="font-semibold text-ink text-right max-w-[200px] truncate">
                  {orderConfirmed.villageAddress || 'Kendra Counter Pickup'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-inkmute">Contact:</span>
                <span className="font-mono font-semibold text-ink">{orderConfirmed.contactNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-inkmute">Total Amount:</span>
                <span className="font-bold text-magenta text-sm">₹{orderConfirmed.grandTotal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-inkmute">Estimated ETA:</span>
                <span className="font-semibold text-green-700">Within 24 Hours</span>
              </div>
            </div>

            <div className="space-y-2">
              <Link
                to="/track"
                className="w-full pill pill-ink py-2.5 text-xs font-bold justify-center flex"
              >
                Track Order on Portal
              </Link>
              <button
                type="button"
                onClick={() => setOrderConfirmed(null)}
                className="w-full pill pill-ghost-ink py-2 text-xs"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

