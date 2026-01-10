import PurchaseHistoryClient from '@/components/PurchaseHistoryClient'

export const dynamic = 'force-dynamic'

export default function PurchaseHistoryPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-h2 font-semibold text-gray-900 dark:text-kick-text">Purchase History</h1>
        <p className="text-body text-gray-600 dark:text-kick-text-secondary">
          View your past shop and ticket purchases.
        </p>
      </div>

      <PurchaseHistoryClient />
    </div>
  )
}
