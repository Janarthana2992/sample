import { useQuery } from '@tanstack/react-query'
import { orderService } from '../../services/orders'
import { productService } from '../../services/products'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { useEffect, useRef, useState } from 'react'

function KPICard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="card">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-extrabold text-gray-900 mt-1">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
    )
}

export default function AdminDashboard() {
    const { data: kpis, isLoading: kpisLoading } = useQuery({
        queryKey: ['admin', 'kpis'],
        queryFn: orderService.getDashboardKPIs,
        refetchInterval: 30_000,
    })

    const [period, setPeriod] = useState<'today' | '7d' | '30d'>('7d')
    const { data: topProducts } = useQuery({
        queryKey: ['admin', 'top-products', period],
        queryFn: () => orderService.getTopProducts(period),
    })

    const { data: pincodeData } = useQuery({
        queryKey: ['admin', 'pincode-map'],
        queryFn: orderService.getPincodeMap,
    })

    const mapRef = useRef<HTMLDivElement>(null)
    const [mapboxToken] = useState(import.meta.env.VITE_MAPBOX_TOKEN || '')

    useEffect(() => {
        if (!mapRef.current || !mapboxToken || !pincodeData?.length) return
        let map: any
        import('mapbox-gl').then(({ default: mapboxgl }) => {
            (mapboxgl as any).accessToken = mapboxToken
            map = new mapboxgl.Map({
                container: mapRef.current!,
                style: 'mapbox://styles/mapbox/light-v11',
                center: [79, 22],
                zoom: 4,
            })
            map.on('load', () => {
                const features = pincodeData.map((p: any) => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [80 + Math.random() * 10, 20 + Math.random() * 10] },
                    properties: { pincode: p.pincode, city: p.city, order_count: p.order_count },
                }))
                map.addSource('pincodes', { type: 'geojson', data: { type: 'FeatureCollection', features } })
                map.addLayer({
                    id: 'pincode-circles',
                    type: 'circle',
                    source: 'pincodes',
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['get', 'order_count'], 1, 6, 10, 12, 50, 20],
                        'circle-color': ['step', ['get', 'order_count'], '#22c55e', 11, '#f59e0b', 51, '#ef4444'],
                        'circle-opacity': 0.8,
                    },
                })
            })
        })
        return () => map?.remove()
    }, [mapboxToken, pincodeData])

    if (kpisLoading) return <LoadingSpinner />

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <KPICard label="Orders Today" value={kpis?.orders_today ?? '—'} />
                <KPICard label="Orders This Month" value={kpis?.orders_month ?? '—'} />
                <KPICard label="Dispatched" value={kpis?.dispatched ?? '—'} />
                <KPICard label="Pending" value={kpis?.pending ?? '—'} />
                <KPICard label="Revenue Today" value={kpis?.revenue_today ? `₹${Number(kpis.revenue_today).toLocaleString('en-IN')}` : '₹0'} />
                <KPICard label="Revenue Month" value={kpis?.revenue_month ? `₹${Number(kpis.revenue_month).toLocaleString('en-IN')}` : '₹0'} />
            </div>

            {/* Top Products */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Top Selling Products</h2>
                    <div className="flex gap-1">
                        {(['today', '7d', '30d'] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : '30 Days'}
                            </button>
                        ))}
                    </div>
                </div>
                {topProducts && topProducts.length > 0 ? (
                    <div className="space-y-2">
                        {topProducts.slice(0, 5).map((p: any, i: number) => (
                            <div key={p.product_id} className="flex items-center gap-3 text-sm">
                                <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">{i + 1}</span>
                                <span className="flex-1 text-gray-800 text-sm truncate">{p.product_name}</span>
                                <span className="text-gray-600">{p.units_sold} units</span>
                                <span className="font-semibold text-gray-900">₹{Number(p.revenue).toLocaleString('en-IN')}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400 text-sm">No data for this period</p>
                )}
            </div>

            {/* Delivery Map */}
            <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Pincode Delivery Map</h2>
                {mapboxToken ? (
                    <div ref={mapRef} className="w-full h-96 rounded-xl overflow-hidden" />
                ) : (
                    <div className="bg-gray-100 rounded-xl h-64 flex items-center justify-center text-gray-500 text-sm">
                        <div className="text-center">
                            <p className="text-2xl mb-2">🗺️</p>
                            <p>Set <code className="bg-gray-200 px-1 rounded">VITE_MAPBOX_TOKEN</code> to enable the map</p>
                            {pincodeData && pincodeData.length > 0 && (
                                <p className="mt-2 text-xs">{pincodeData.length} pincodes with orders</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
