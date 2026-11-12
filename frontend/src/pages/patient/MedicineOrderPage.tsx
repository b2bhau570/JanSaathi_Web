import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { getCaseOrderDetails, placeCaseMedicineOrder } from '../../api/patientApi';

interface OrderItem {
  id: string;
  medicine_name: string;
  generic_name: string;
  dosage: string;
  strength?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  quantity: number;
  subsidized_price: number;
  mrp: number;
  savings_percent: number;
  in_stock: boolean;
}

interface OrderData {
  public_case_id: string;
  patient_name: string;
  patient_contact?: string;
  doctor_name: string;
  assessment?: string;
  items: OrderItem[];
  total_mrp: number;
  total_subsidized: number;
  total_savings: number;
  discount_percentage: number;
  delivery_modes: Array<{ id: string; label: string; fee: number; eta: string; description: string }>;
  nearest_kendra: { name: string; address: string; phone: string; distance: string };
  schemes: Array<{ id: string; name: string; discount: string }>;
}

export const MedicineOrderPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token =
    searchParams.get('token') ||
    (caseId ? sessionStorage.getItem(`case_token_${caseId}`) : null);

  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [deliveryMode, setDeliveryMode] = useState<string>('drone_delivery');
  const [villageAddress, setVillageAddress] = useState<string>('');
  const [whatsappNumber, setWhatsappNumber] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('bsky_subsidized');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [orderResult, setOrderResult] = useState<any | null>(null);

  useEffect(() => {
    if (!caseId || !token) {
      navigate(`/patient/case-access?id=${caseId || ''}`, { replace: true });
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getCaseOrderDetails(caseId, token);
        setOrderData(data);
        if (data.patient_contact) {
          setWhatsappNumber(data.patient_contact);
        }
      } catch (err: any) {
        console.error(err);
        if (err.response?.status === 401 || err.response?.status === 403) {
          setError('Access credentials expired or invalid. Please re-enter your access token.');
        } else if (err.response?.data?.detail) {
          setError(err.response.data.detail);
        } else {
          setError('Failed to fetch prescription and medicine pricing details.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [caseId, token, navigate]);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || !token) return;

    if (!whatsappNumber.trim()) {
      alert('Please enter your 10-digit WhatsApp / Mobile number for delivery updates.');
      return;
    }

    if (!villageAddress.trim() && deliveryMode !== 'kendra_pickup') {
      alert('Please enter your village / gram panchayat delivery address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        delivery_type: deliveryMode,
        delivery_address: deliveryMode === 'kendra_pickup' ? 'Self Pickup at Kendra' : villageAddress,
        contact_number: whatsappNumber,
        payment_method: paymentMethod,
      };

      const res = await placeCaseMedicineOrder(caseId, token, payload);
      setOrderResult(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to place medicine order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-inkmute space-y-3">
        <div className="animate-spin w-8 h-8 border-3 border-magenta border-t-transparent rounded-full mx-auto" />
        <p className="text-sm font-medium text-ink">
          Fetching subsidized medicine prices from Pradhan Mantri Jan Aushadhi Kendra (PMBJP)...
        </p>
      </div>
    );
  }

  if (error || !orderData) {
    return (
      <div className="max-w-md mx-auto bg-creamdeep p-8 rounded-2xl border border-magenta/25 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-magenta/15 text-magenta flex items-center justify-center mx-auto">
          <iconify-icon icon="ph:warning-circle-fill" width="24" height="24"></iconify-icon>
        </div>
        <h2 className="font-serif opsz-72 text-lg font-semibold text-ink">Order Unavailable</h2>
        <p className="text-xs text-inkmute leading-relaxed">{error || 'Prescription information could not be loaded.'}</p>
        <Link
          to={`/patient/case/${caseId}?token=${token}`}
          className="pill pill-ink px-5 py-2.5 text-xs inline-flex"
        >
          <iconify-icon icon="ph:arrow-left-bold" width="12" height="12"></iconify-icon>
          <span>Return to Case Overview</span>
        </Link>
      </div>
    );
  }

  if (orderResult) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-ink text-cream rounded-2xl p-8 md:p-10 text-center space-y-6">
          <div className="w-16 h-16 bg-magenta/20 text-magenta rounded-full flex items-center justify-center mx-auto ring-4 ring-magenta/30">
            <iconify-icon icon="ph:package-fill" width="32" height="32"></iconify-icon>
          </div>

          <div className="space-y-2">
            <span className="eyebrow text-cream/70 block">
              Order Confirmed & Pharmacist Dispatched
            </span>
            <h1 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-cream">
              ଔଷଧ ଅର୍ଡର ସଫଳ ହୋଇଛି! (Medicine Order Confirmed)
            </h1>
            <p className="text-xs text-cream/70 max-w-md mx-auto">
              Your prescription has been transmitted to Jan Aushadhi Kendra. Medicines are packaged under government quality control.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left bg-creamdeep/10 p-5 rounded-xl border border-cream/10 text-xs">
            <div>
              <span className="text-cream/55 block text-[10px]">Order ID:</span>
              <span className="font-mono font-bold text-cream text-sm">{orderResult.order_id}</span>
            </div>
            <div>
              <span className="text-cream/55 block text-[10px]">Tracking ID:</span>
              <span className="font-mono font-bold text-magenta text-sm">{orderResult.tracking_id}</span>
            </div>
            <div>
              <span className="text-cream/55 block text-[10px]">Patient Name:</span>
              <span className="font-medium text-cream">{orderResult.patient_name}</span>
            </div>
            <div>
              <span className="text-cream/55 block text-[10px]">Total Payable:</span>
              <span className="font-bold text-magenta text-sm">
                ₹{orderResult.total_payable}{' '}
                {paymentMethod === 'bsky_subsidized' && (
                  <span className="text-[10px] text-cream bg-magenta px-1.5 py-0.5 rounded-full ml-1">
                    BSKY Covered
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs bg-cream/10 p-3 rounded-xl border border-cream/15 text-cream/90">
            <iconify-icon icon="ph:paper-plane-tilt-fill" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
            <span>
              SMS & WhatsApp notification sent to <strong>+91 {orderResult.recipient_contact}</strong>. Live delivery alerts active.
            </span>
          </div>

          {/* Progress Tracker */}
          <div className="bg-creamdeep text-ink p-6 rounded-xl text-left space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-inkmute flex items-center gap-1.5">
              <iconify-icon icon="ph:truck-fill" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
              <span>Live Order Journey (ଅର୍ଡର ଟ୍ରାକିଂ ସ୍ଥିତି)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="border-l-3 sm:border-l-0 sm:border-t-3 border-magenta pl-3 sm:pl-0 sm:pt-2">
                <span className="font-semibold text-ink block text-[11px]">1. Verified</span>
                <span className="text-[10px] text-inkmute">Prescription approved</span>
              </div>
              <div className="border-l-3 sm:border-l-0 sm:border-t-3 border-magenta pl-3 sm:pl-0 sm:pt-2">
                <span className="font-semibold text-ink block text-[11px]">2. Packaged</span>
                <span className="text-[10px] text-inkmute">Jan Aushadhi sealed</span>
              </div>
              <div className="border-l-3 sm:border-l-0 sm:border-t-3 border-ink pl-3 sm:pl-0 sm:pt-2">
                <span className="font-semibold text-ink block text-[11px]">3. In Transit</span>
                <span className="text-[10px] text-inkmute">{orderResult.estimated_delivery}</span>
              </div>
              <div className="border-l-3 sm:border-l-0 sm:border-t-3 border-ink/20 pl-3 sm:pl-0 sm:pt-2">
                <span className="font-medium text-inkmute block text-[11px]">4. Delivered</span>
                <span className="text-[10px] text-inkmute/70">At village / home</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={`/patient/case/${caseId}?token=${token}`}
              className="pill pill-cream px-6 py-2.5 text-xs font-medium"
            >
              <iconify-icon icon="ph:arrow-left-bold" width="12" height="12"></iconify-icon>
              <span>Back to Case Overview</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-magenta text-cream text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
              PMBJP Subsidized
            </span>
            <span className="text-xs text-inkmute font-mono">Case #{orderData.public_case_id}</span>
          </div>
          <h1 className="font-serif opsz-72 font-semibold text-lg text-ink flex items-center gap-2">
            <iconify-icon icon="ph:pill-fill" width="18" height="18" style={{ color: '#d6246e' }}></iconify-icon>
            <span>ପ୍ରଧାନମନ୍ତ୍ରୀ ଜନ ଔଷଧି କେନ୍ଦ୍ର - ରିହାତି ଔଷଧ ଅର୍ଡର</span>
          </h1>
          <p className="text-xs text-inkmute">
            Order Doctor-Prescribed Generic Medicines with 70–90% Govt Subsidy & Express Rural Delivery
          </p>
        </div>

        <Link
          to={`/patient/case/${caseId}?token=${token}`}
          className="pill pill-secondary px-4 py-2 text-xs"
        >
          <iconify-icon icon="ph:arrow-left-bold" width="12" height="12"></iconify-icon>
          <span>Case Details</span>
        </Link>
      </div>

      {/* Prescription Summary */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-ink/10 pb-3">
          <div>
            <h2 className="font-serif opsz-72 text-sm font-semibold text-ink">
              Prescribed Medications (ଡାକ୍ତରଙ୍କ ଦ୍ୱାରା ଲିଖିତ ଔଷଧ)
            </h2>
            <p className="text-xs text-inkmute">
              Prescribed by <strong className="text-ink">{orderData.doctor_name}</strong> for{' '}
              <strong className="text-ink">{orderData.patient_name}</strong>
            </p>
          </div>
          <span className="bg-magenta/10 text-magenta text-xs font-semibold px-2.5 py-1 rounded-full border border-magenta/20">
            {orderData.discount_percentage}% Cost Savings
          </span>
        </div>

        {/* Medicines Table */}
        <div className="overflow-x-auto rounded-xl border border-ink/10 bg-cream">
          <table className="w-full text-left text-xs">
            <thead className="bg-creamdeep text-ink font-semibold border-b border-ink/10">
              <tr>
                <th className="p-3">Medicine & Generic Form</th>
                <th className="p-3">Dosage / Instructions</th>
                <th className="p-3 text-right">Brand MRP</th>
                <th className="p-3 text-right font-bold text-magenta">Jan Aushadhi Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {orderData.items.map((item) => (
                <tr key={item.id} className="hover:bg-creamdeep/40">
                  <td className="p-3">
                    <p className="font-semibold text-ink">{item.medicine_name}</p>
                    <span className="text-[11px] text-inkmute block">Generic: {item.generic_name}</span>
                    <span className="inline-block mt-0.5 text-[10px] bg-ink/5 text-inkmute px-2 py-0.5 rounded-full font-mono">
                      Pack of {item.quantity} units
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="text-ink font-medium block">
                      {item.dosage || item.strength || 'As prescribed'} • {item.frequency || 'Daily'}
                    </span>
                    <span className="text-[11px] text-inkmute">{item.instructions || 'After food'}</span>
                  </td>
                  <td className="p-3 text-right text-inkmute/60 line-through">
                    ₹{item.mrp.toFixed(2)}
                  </td>
                  <td className="p-3 text-right">
                    <span className="font-bold text-magenta text-sm">
                      ₹{item.subsidized_price.toFixed(2)}
                    </span>
                    <span className="block text-[10px] text-magenta/80 font-semibold">
                      Save {item.savings_percent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-creamdeep font-semibold text-ink border-t border-ink/10">
              <tr>
                <td colSpan={2} className="p-3 text-right text-xs">
                  Total Commercial Market MRP:
                </td>
                <td className="p-3 text-right text-inkmute/60 line-through text-xs">
                  ₹{orderData.total_mrp.toFixed(2)}
                </td>
                <td className="p-3 text-right text-magenta font-serif opsz-72 font-bold text-base">
                  ₹{orderData.total_subsidized.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Savings banner */}
        <div className="bg-magenta/8 border border-magenta/20 rounded-xl p-3.5 flex items-center justify-between text-xs text-ink">
          <div className="flex items-center gap-2">
            <iconify-icon icon="ph:sparkle-fill" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
            <span>
              <strong>Total Direct Citizen Benefit:</strong> You save{' '}
              <strong className="text-magenta font-semibold">₹{orderData.total_savings.toFixed(2)}</strong> on this order through PMBJP subsidized pharmaceuticals.
            </span>
          </div>
        </div>
      </div>

      {/* Order Form */}
      <form onSubmit={handlePlaceOrder} className="space-y-6">
        {/* Delivery Mode Selection */}
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
          <h2 className="font-serif opsz-72 text-sm font-semibold text-ink flex items-center gap-2 border-b border-ink/10 pb-3">
            <iconify-icon icon="ph:truck-bold" width="16" height="16"></iconify-icon>
            <span>Select Delivery Option (ଡେଲିଭରୀ ବିକଳ୍ପ ଚୟନ କରନ୍ତୁ)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {orderData.delivery_modes.map((mode) => (
              <label
                key={mode.id}
                className={`border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between ${
                  deliveryMode === mode.id
                    ? 'border-magenta bg-cream shadow-sm'
                    : 'border-ink/10 hover:border-ink/20 bg-creamdeep/60'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    {mode.id === 'drone_delivery' && <iconify-icon icon="ph:airplane-tilt-bold" width="20" height="20" style={{ color: '#d6246e' }}></iconify-icon>}
                    {mode.id === 'speed_post' && <iconify-icon icon="ph:truck-bold" width="20" height="20" style={{ color: '#16130f' }}></iconify-icon>}
                    {mode.id === 'kendra_pickup' && <iconify-icon icon="ph:buildings-bold" width="20" height="20" style={{ color: '#5a544a' }}></iconify-icon>}
                    <input
                      type="radio"
                      name="delivery_mode"
                      value={mode.id}
                      checked={deliveryMode === mode.id}
                      onChange={() => setDeliveryMode(mode.id)}
                      className="text-magenta focus:ring-magenta/30"
                    />
                  </div>
                  <h3 className="font-semibold text-xs text-ink mt-1">{mode.label}</h3>
                  <p className="text-[11px] text-inkmute leading-snug">{mode.description}</p>
                </div>

                <div className="pt-2.5 mt-2.5 border-t border-ink/10 flex items-center justify-between text-xs">
                  <span className="font-semibold text-magenta">
                    {mode.fee === 0 ? 'FREE / ଉପଲବ୍ଧ' : `₹${mode.fee}`}
                  </span>
                  <span className="text-[10px] bg-ink/5 px-2 py-0.5 rounded-full text-inkmute">
                    {mode.eta}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Delivery Details & WhatsApp Contact */}
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
          <h2 className="font-serif opsz-72 text-sm font-semibold text-ink flex items-center gap-2 border-b border-ink/10 pb-3">
            <iconify-icon icon="ph:map-pin-bold" width="16" height="16"></iconify-icon>
            <span>Delivery Address & WhatsApp Mobile (ଠିକଣା ଓ ଯୋଗାଯୋଗ)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-ink mb-1.5 flex items-center gap-1.5">
                <iconify-icon icon="ph:phone-bold" width="14" height="14" style={{ color: '#d6246e' }}></iconify-icon>
                <span>WhatsApp / Mobile Number for SMS Tracking: *</span>
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-ink/14 bg-cream text-inkmute font-mono text-xs">
                  +91
                </span>
                <input
                  type="tel"
                  required
                  placeholder="9876543210"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="w-full border border-ink/14 rounded-r-xl px-3 py-2 text-xs font-mono bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
                />
              </div>
              <p className="text-[11px] text-inkmute mt-1.5">
                You will receive instant dispatch SMS and 1-click WhatsApp live map tracking link.
              </p>
            </div>

            {deliveryMode !== 'kendra_pickup' ? (
              <div>
                <label className="block font-semibold text-ink mb-1.5">
                  Village / Gram Panchayat / Delivery Address: *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Ward No. 4, Nuapada Village, Near Gram Panchayat Office, Cuttack"
                  value={villageAddress}
                  onChange={(e) => setVillageAddress(e.target.value)}
                  className="w-full border border-ink/14 rounded-xl p-2.5 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all resize-y"
                />
              </div>
            ) : (
              <div className="bg-cream border border-ink/10 rounded-xl p-3.5 text-xs space-y-1">
                <span className="font-semibold text-ink block">Nearest Jan Aushadhi Kendra:</span>
                <p className="text-inkmute">{orderData.nearest_kendra.name}</p>
                <p className="text-[11px] text-inkmute/70">{orderData.nearest_kendra.address}</p>
                <p className="text-[11px] text-magenta font-medium">Distance: {orderData.nearest_kendra.distance} • Helpline: {orderData.nearest_kendra.phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Payment & Subsidy Selection */}
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
          <h2 className="font-serif opsz-72 text-sm font-semibold text-ink flex items-center gap-2 border-b border-ink/10 pb-3">
            <iconify-icon icon="ph:shield-check-bold" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
            <span>Health Scheme & Subsidized Payment (ସ୍ୱାସ୍ଥ୍ୟ ବୀମା ଓ ଦେୟ)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label
              className={`border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between ${
                paymentMethod === 'bsky_subsidized'
                  ? 'border-magenta bg-cream shadow-sm'
                  : 'border-ink/10 hover:border-ink/20 bg-creamdeep/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <iconify-icon icon="ph:shield-check-fill" width="20" height="20" style={{ color: '#d6246e' }}></iconify-icon>
                  <input
                    type="radio"
                    name="payment_method"
                    value="bsky_subsidized"
                    checked={paymentMethod === 'bsky_subsidized'}
                    onChange={() => setPaymentMethod('bsky_subsidized')}
                    className="text-magenta focus:ring-magenta/30"
                  />
                </div>
                <h3 className="font-semibold text-xs text-ink">BSKY / Ayushman Card</h3>
                <p className="text-[11px] text-inkmute">100% Cashless Govt Health Mission coverage</p>
              </div>
              <span className="text-[11px] font-bold text-magenta mt-2.5 block">100% FREE</span>
            </label>

            <label
              className={`border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between ${
                paymentMethod === 'cash_on_delivery'
                  ? 'border-magenta bg-cream shadow-sm'
                  : 'border-ink/10 hover:border-ink/20 bg-creamdeep/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <iconify-icon icon="ph:money-bold" width="20" height="20" style={{ color: '#16130f' }}></iconify-icon>
                  <input
                    type="radio"
                    name="payment_method"
                    value="cash_on_delivery"
                    checked={paymentMethod === 'cash_on_delivery'}
                    onChange={() => setPaymentMethod('cash_on_delivery')}
                    className="text-magenta focus:ring-magenta/30"
                  />
                </div>
                <h3 className="font-semibold text-xs text-ink">Cash on Delivery (COD)</h3>
                <p className="text-[11px] text-inkmute">Pay cash to delivery courier at village</p>
              </div>
              <span className="text-[11px] font-bold text-ink mt-2.5 block">
                ₹{orderData.total_subsidized.toFixed(2)}
              </span>
            </label>

            <label
              className={`border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between ${
                paymentMethod === 'upi_qr'
                  ? 'border-magenta bg-cream shadow-sm'
                  : 'border-ink/10 hover:border-ink/20 bg-creamdeep/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <iconify-icon icon="ph:qr-code-bold" width="20" height="20" style={{ color: '#5a544a' }}></iconify-icon>
                  <input
                    type="radio"
                    name="payment_method"
                    value="upi_qr"
                    checked={paymentMethod === 'upi_qr'}
                    onChange={() => setPaymentMethod('upi_qr')}
                    className="text-magenta focus:ring-magenta/30"
                  />
                </div>
                <h3 className="font-semibold text-xs text-ink">UPI / QR Payment</h3>
                <p className="text-[11px] text-inkmute">Scan & Pay via PhonePe, GPay, Paytm</p>
              </div>
              <span className="text-[11px] font-bold text-ink mt-2.5 block">
                ₹{orderData.total_subsidized.toFixed(2)}
              </span>
            </label>
          </div>
        </div>

        {/* Order Submit Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-creamdeep rounded-2xl border border-ink/8">
          <div>
            <span className="text-xs text-inkmute block">Total Amount Payable:</span>
            <span className="font-serif opsz-72 text-xl font-bold text-ink">
              {paymentMethod === 'bsky_subsidized' ? (
                <>
                  <span className="text-magenta">₹0.00</span>{' '}
                  <span className="text-xs font-normal text-inkmute">(BSKY Covered)</span>
                </>
              ) : (
                `₹${orderData.total_subsidized.toFixed(2)}`
              )}
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto pill pill-magenta px-7 py-3 text-xs font-semibold disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-cream border-t-transparent rounded-full" />
                <span>Processing Order...</span>
              </>
            ) : (
              <>
                <iconify-icon icon="ph:check-circle-bold" width="16" height="16"></iconify-icon>
                <span>ଅର୍ଡର ନିଶ୍ଚିତ କରନ୍ତୁ (Confirm Medicine Order)</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
