import { Link } from 'react-router-dom'
import type { Product } from '../../types'

interface Props {
    product: Product | { product_id: string; name: string; mrp: number; selling_price: number; stock_status: string; images?: { url: string }[]; image_url?: string; score?: number; promotion_badge?: string; is_featured?: boolean; is_promoted?: boolean }
}

export function ProductCard({ product }: Props) {
    const discount = product.mrp > product.selling_price
        ? Math.round(((product.mrp - product.selling_price) / product.mrp) * 100)
        : 0

    const imageUrl = 'images' in product && product.images?.[0]?.url
        ? product.images[0].url
        : ('image_url' in product ? product.image_url : undefined)
    const promotionBadge = 'promotion_badge' in product ? product.promotion_badge : undefined
    const isFeatured = 'is_featured' in product ? product.is_featured : false

    const isOutOfStock = product.stock_status === 'out_of_stock'

    return (
        <Link to={`/products/${product.product_id}`} className="group">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative aspect-square bg-gray-100">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-4xl">📦</div>
                    )}
                    {discount > 0 && (
                        <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                            -{discount}%
                        </span>
                    )}
                    {(promotionBadge || isFeatured) && (
                        <span className="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full max-w-[75%] truncate">
                            {promotionBadge || 'Featured'}
                        </span>
                    )}
                    {isOutOfStock && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <span className="text-gray-600 font-semibold text-sm">Out of Stock</span>
                        </div>
                    )}
                </div>
                <div className="p-3">
                    <h3 className="text-sm font-medium text-gray-800 line-clamp-2 group-hover:text-blue-600 transition-colors">
                        {product.name}
                    </h3>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900">₹{product.selling_price.toLocaleString('en-IN')}</span>
                        {discount > 0 && (
                            <span className="text-xs text-gray-400 line-through">₹{product.mrp.toLocaleString('en-IN')}</span>
                        )}
                    </div>
                    {product.stock_status === 'low_stock' && (
                        <p className="text-xs text-orange-600 mt-1 font-medium">Only a few left!</p>
                    )}
                </div>
            </div>
        </Link>
    )
}
