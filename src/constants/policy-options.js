export const WARRANTY_OPTIONS = [
    { value: "NO_WARRANTY", label: "No Warranty", description: "This product does not include any warranty coverage.", icon: "ShieldX" },
    { value: "30_DAY_WARRANTY", label: "30-Day Warranty", description: "Covered for 30 days from the date of purchase against manufacturing defects.", icon: "ShieldCheck" },
    { value: "90_DAY_WARRANTY", label: "90-Day Warranty", description: "Covered for 90 days from the date of purchase against manufacturing defects.", icon: "ShieldCheck" },
    { value: "6_MONTH_WARRANTY", label: "6-Month Warranty", description: "Covered for 6 months from the date of purchase against manufacturing defects.", icon: "ShieldCheck" },
    { value: "1_YEAR_WARRANTY", label: "1-Year Manufacturer Warranty", description: "Full manufacturer warranty for 1 year covering defects in materials and workmanship.", icon: "ShieldCheck" },
    { value: "2_YEAR_WARRANTY", label: "2-Year Manufacturer Warranty", description: "Extended 2-year manufacturer warranty covering defects in materials and workmanship.", icon: "ShieldCheck" },
    { value: "3_YEAR_WARRANTY", label: "3-Year Manufacturer Warranty", description: "Premium 3-year manufacturer warranty for extended peace of mind.", icon: "ShieldCheck" },
    { value: "5_YEAR_WARRANTY", label: "5-Year Warranty", description: "Long-term 5-year warranty covering manufacturing defects and component failures.", icon: "ShieldCheck" },
    { value: "LIFETIME_WARRANTY", label: "Lifetime Warranty", description: "Covered for the lifetime of the product against manufacturing defects.", icon: "ShieldCheck" },
    { value: "LIMITED_WARRANTY", label: "Limited Warranty", description: "Limited warranty with specific terms and conditions. Check product documentation for details.", icon: "ShieldAlert" },
    { value: "EXTENDED_WARRANTY_AVAILABLE", label: "Extended Warranty Available", description: "Optional extended warranty can be purchased separately for additional coverage.", icon: "ShieldPlus" },
]

export const RETURN_POLICY_OPTIONS = [
    { value: "NO_RETURNS", label: "No Returns", description: "This product is not eligible for returns or exchanges once delivered.", icon: "PackageX" },
    { value: "7_DAY_RETURN", label: "7-Day Return", description: "Return within 7 days of delivery for a full refund. Product must be unused and in original packaging.", icon: "PackageCheck" },
    { value: "10_DAY_RETURN", label: "10-Day Return", description: "Return within 10 days of delivery. Product must be in original condition with all accessories.", icon: "PackageCheck" },
    { value: "15_DAY_RETURN", label: "15-Day Return", description: "Hassle-free returns within 15 days of delivery. Refund processed within 5-7 business days.", icon: "PackageCheck" },
    { value: "30_DAY_RETURN", label: "30-Day Return", description: "Generous 30-day return window. Product must be unused with original packaging and tags.", icon: "PackageCheck" },
    { value: "EXCHANGE_ONLY", label: "Exchange Only", description: "This product is eligible for exchange only, not refund. Exchange within 7 days of delivery.", icon: "ArrowLeftRight" },
    { value: "REPLACEMENT_ONLY", label: "Replacement Only", description: "Eligible for free replacement in case of defective or damaged product within 7 days.", icon: "RefreshCw" },
    { value: "STORE_CREDIT", label: "Store Credit", description: "Returns accepted within 15 days. Refund issued as store credit for future purchases.", icon: "Wallet" },
    { value: "CONDITIONAL_RETURN", label: "Conditional Return", description: "Returns accepted subject to specific conditions. Check product page for eligibility details.", icon: "ClipboardCheck" },
]

export const SHIPPING_POLICY_OPTIONS = [
    { value: "STANDARD_SHIPPING", label: "Standard Shipping", description: "Free standard shipping. Estimated delivery in 5-7 business days.", icon: "Truck" },
    { value: "EXPRESS_SHIPPING", label: "Express Shipping", description: "Priority express shipping with delivery in 2-3 business days.", icon: "Zap" },
    { value: "SAME_DAY_DELIVERY", label: "Same-Day Delivery", description: "Order before 12 PM for same-day delivery in select cities.", icon: "Clock" },
    { value: "NEXT_DAY_DELIVERY", label: "Next-Day Delivery", description: "Guaranteed next business day delivery for orders placed before 2 PM.", icon: "CalendarCheck" },
    { value: "FREE_SHIPPING", label: "Free Shipping", description: "Enjoy completely free shipping on this product with no minimum order value.", icon: "Gift" },
    { value: "FLAT_RATE_SHIPPING", label: "Flat Rate Shipping", description: "Flat rate shipping fee of ₹49 regardless of order size or destination.", icon: "IndianRupee" },
    { value: "PICKUP_AVAILABLE", label: "Store Pickup Available", description: "Order online and pick up from your nearest store at no extra cost.", icon: "MapPin" },
    { value: "SHIPS_IN_24H", label: "Ships Within 24 Hours", description: "Orders are dispatched within 24 hours of confirmation on business days.", icon: "Timer" },
    { value: "SHIPS_IN_48H", label: "Ships Within 48 Hours", description: "Dispatched within 48 hours. Tracking details shared via email and SMS.", icon: "Timer" },
    { value: "INTERNATIONAL_SHIPPING", label: "International Shipping", description: "We ship worldwide. International delivery in 10-15 business days. Customs duties may apply.", icon: "Globe" },
    { value: "FRAGILE_SHIPPING", label: "Fragile Item - Special Handling", description: "This item requires special handling. Shipped with extra protective packaging.", icon: "AlertTriangle" },
]

export function getPolicyOption(options, value) {
    if (!value) return null
    const match = options.find(
        (option) =>
            option.value === value ||
            option.label.toLowerCase() === String(value).toLowerCase()
    )
    if (match) return match

    // Fallback for custom / legacy text
    return {
        value,
        label: value,
        description: value,
        icon: null,
    }
}
