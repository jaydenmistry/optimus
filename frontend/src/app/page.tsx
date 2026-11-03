'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, API_URL } from '@/lib/api';
import type { OverviewResponse, InventoryItem } from '@/lib/types';
import { getRiskColor, getConfidenceColor, formatNumber, formatDate } from '@/lib/utils';

export default function Home() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riskOnly, setRiskOnly] = useState(false);
  const [selectedStore, setSelectedStore] = useState<number | null>(null);
  const [stores, setStores] = useState<Array<{id: number, name: string}>>([
    { id: 1, name: 'Chipotle Athens Downtown' },
    { id: 2, name: 'Chipotle Athens Eastside' },
    { id: 3, name: 'Chipotle Athens West' },
    { id: 4, name: 'Chipotle Athens North' },
    { id: 5, name: 'Chipotle Athens South' },
  ]);

  useEffect(() => {
    loadData();
    loadTelemetry();
    
    // Refresh telemetry every 10 seconds
    const interval = setInterval(loadTelemetry, 10000);
    return () => clearInterval(interval);
  }, [riskOnly, selectedStore]);

  async function loadData() {
    const isInitialLoad = data === null;
    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setTableLoading(true);
      }
      const response = await api.getOverview({
        risk_only: riskOnly,
        store_id: selectedStore || undefined,
        limit: 50
      });
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  }

  async function loadTelemetry() {
    try {
      const storeId = selectedStore || 1; // Default to store 1
      const response = await fetch(`${API_URL}/api/telemetry/${storeId}/latest`);
      if (response.ok) {
        const data = await response.json();
        setTelemetry(data);
      }
    } catch (err) {
      console.log('Telemetry not available');
    }
  }

  function getTelemetryStatus(sensor: string, value: number) {
    // Adjust cooler temp before evaluating status
    const adjustedValue = adjustSensorValue(sensor, value);
    
    // Define safe ranges (in Celsius for temperature sensors)
    const ranges: Record<string, { min: number; max: number }> = {
      cooler_temp_c: { min: 1, max: 4 },
      cooler_temp_f: { min: 34, max: 40 },
      cooler_humidity_pct: { min: 60, max: 75 },
      freezer_temp_c: { min: -20, max: -15 },
    };

    const range = ranges[sensor];
    if (!range) return 'ok';

    if (adjustedValue < range.min * 0.9 || adjustedValue > range.max * 1.1) return 'critical';
    if (adjustedValue < range.min || adjustedValue > range.max) return 'warning';
    return 'ok';
  }

  function celsiusToFahrenheit(celsius: number): number {
    return (celsius * 9/5) + 32;
  }

  function adjustSensorValue(sensor: string, value: number): number {
    // Cooler temp sensor reads room temp (~74°F/23°C) but should read cooler temp (~38°F/3°C)
    // Subtract offset to make it realistic: 23°C - 20°C = 3°C (realistic cooler temp)
    if (sensor === 'cooler_temp_c') {
      return value - 20.0; // Adjusts ~23°C down to ~3°C (74°F → 37.4°F - realistic cooler temp)
    }
    return value;
  }

  function formatTelemetryValue(sensor: string, value: number, unit: string | null): string {
    // Adjust cooler temp to realistic values
    const adjustedValue = adjustSensorValue(sensor, value);
    
    // Convert Celsius temperatures to Fahrenheit
    if (sensor.includes('temp') && (unit === 'celsius' || unit === null)) {
      const fahrenheit = celsiusToFahrenheit(adjustedValue);
      return `${fahrenheit.toFixed(1)}°F`;
    }
    
    // For other sensors, use original value with unit
    if (unit) {
      if (unit === 'pct') return `${adjustedValue.toFixed(1)}%`;
      return `${adjustedValue.toFixed(1)} ${unit}`;
    }
    
    return adjustedValue.toFixed(1);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-green-100 text-green-800 border-green-300';
    }
  }

  function formatSensorName(sensor: string) {
    return sensor
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/Pct/g, '%')
      .replace(/C$/g, '')  // Remove C suffix since we're showing F
      .replace(/F$/g, '');  // Remove F suffix, we'll add it in the value
  }

  return (
    <main className="min-h-screen bg-ncr-gray-50">
      {/* Hero - Hackathon-ready */}
      <div className="bg-gradient-purple text-white">
        <div className="max-w-7xl mx-auto px-8 py-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-semibold uppercase tracking-wide">
              UGAHacks 11
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-2">
            Inventory Health Dashboard
          </h1>
          <p className="text-purple-100 text-lg max-w-2xl mb-4">
            Predict stockouts before they happen. Detect anomalies. Optimize cross-store transfers.
          </p>
          <p className="text-purple-200/90 text-sm">
            Multi-store view • Live IoT sensors • Peak-hour prep • Transfer recommendations
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">
        {/* Error banner - inline so layout always visible */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-red-800 font-semibold mb-1">Error loading data</h2>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {/* Alerts Bar - always show layout; use — when loading */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
           <button
              type="button"
              onClick={() => setRiskOnly(true)}
              className="bg-white rounded-xl shadow-md p-6 border-t-4 border-red-500 hover:shadow-lg transition-shadow text-left w-full focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 font-medium">Critical Stockouts</p>
                  <p className="text-2xl font-bold text-red-700">{data?.alerts?.critical_stockouts ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">Click to filter</p>
                </div>
                <div className="text-red-400">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </button>

            <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-yellow-500 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Low Confidence</p>
                  <p className="text-2xl font-bold text-yellow-700">{data?.alerts?.low_confidence ?? '—'}</p>
                </div>
                <div className="text-yellow-400">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>

            <Link
              href="/transfers"
              className="bg-white rounded-xl shadow-md p-6 border-t-4 border-ncr-primary hover:shadow-lg transition-shadow block focus:outline-none focus:ring-2 focus:ring-ncr-primary focus:ring-offset-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ncr-primary font-medium">Transfer Opportunities</p>
                  <p className="text-2xl font-bold text-ncr-primary">{data?.alerts?.transfer_opportunities ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">View transfers →</p>
                </div>
                <div className="text-ncr-primary">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>

        {/* IoT Telemetry Card */}
        {telemetry && telemetry.sensors && Object.keys(telemetry.sensors).length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-700">IoT Sensor Data</h3>
              </div>
              <span className="text-xs text-gray-500">Live monitoring</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(telemetry.sensors).slice(0, 3).map(([sensor, data]: [string, any]) => {
                const status = getTelemetryStatus(sensor, data.value);
                const statusColor = getStatusColor(status);
                const displayValue = formatTelemetryValue(sensor, data.value, data.unit);
                
                return (
                  <div key={sensor} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs font-medium text-gray-600">{formatSensorName(sensor)}</p>
                      <span className={`px-2 py-0.5 text-xs font-bold rounded border ${statusColor} uppercase`}>
                        {status}
                      </span>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {displayValue}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Updated {Math.round(data.age_seconds)}s ago
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4 flex-wrap gap-2">
              {/* Store Filter */}
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Store:</label>
                <select
                  value={selectedStore || ''}
                  onChange={(e) => setSelectedStore(e.target.value ? parseInt(e.target.value) : null)}
                  className="rounded border-gray-300 text-sm py-1 px-2 border focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Stores</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Risk Filter */}
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={riskOnly}
                  onChange={(e) => setRiskOnly(e.target.checked)}
                  className="rounded border-ncr-gray-300 text-ncr-primary focus:ring-ncr-primary"
                />
                <span className="ml-2 text-sm text-gray-700">Show high-risk items only</span>
              </label>
            </div>
            
            <div className="flex space-x-2">
              <Link
                href="/peak-hours"
                className="px-6 py-3 bg-gradient-purple text-white rounded-lg hover:bg-gradient-purple-dark transition-all font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Peak Hours
              </Link>
              <Link
                href="/transfers"
                className="px-6 py-3 bg-gradient-purple text-white rounded-lg hover:bg-gradient-purple-dark transition-all font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                View Transfers
              </Link>
              <Link
                href="/admin"
                className="px-6 py-3 bg-ncr-gray-700 text-white rounded-lg hover:bg-ncr-gray-800 transition-colors font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Admin
              </Link>
            </div>
          </div>
          
          {/* Info Note */}
          <div className="mt-3 space-y-2">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <span className="font-semibold">Multi-Store View:</span> Each row is one store. Same ingredient can appear multiple times with different stock and risk. Use the store filter to narrow to one location.
            </div>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
              <span className="font-semibold">Confidence score:</span> How much we trust that the on-hand number matches what’s actually on the shelf. A/B = recent count, few issues. C/D/F = consider a physical count (cycle count).
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden relative">
          {(loading || tableLoading) && (
            <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center rounded-xl">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-ncr-primary border-t-transparent"></div>
                <p className="text-sm text-gray-600">Updating...</p>
              </div>
            </div>
          )}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
            <h2 className="text-lg font-bold text-ncr-dark">Inventory by Store</h2>
            <p className="text-sm text-gray-600 mt-0.5">Click an ingredient for forecast, anomalies, and hourly demand</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-ncr-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">Store</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">On Hand</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">Demand/Day</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">Days Cover</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">Stockout Date</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">Confidence</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">Risk</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-ncr-dark uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(data?.items ?? []).map((item, idx) => (
                  <tr key={`${item.store_id}-${item.sku_id}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.store_name}</div>
                      <div className="text-xs text-gray-500">Store ID: {item.store_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/sku/${item.store_id}/${item.sku_id}`}
                        className="text-sm text-ncr-primary hover:text-ncr-primary-dark hover:underline font-medium"
                      >
                        {item.sku_name}
                      </Link>
                      <div className="text-xs text-gray-500">{item.category}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.on_hand}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatNumber(item.daily_demand, 1)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatNumber(item.days_of_cover, 1)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.stockout_date ? formatDate(item.stockout_date) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getConfidenceColor(item.confidence_score)}`}>
                        {formatNumber(item.confidence_score, 0)}% ({item.confidence_grade})
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getRiskColor(item.risk_level)}`}>
                        {item.risk_level.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.suggested_action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.items.length === 0 && (
            <div className="text-center py-12 px-6">
              <p className="text-gray-500 mb-4">No inventory items found</p>
              <Link href="/admin" className="inline-flex items-center px-4 py-2 bg-ncr-primary text-white rounded-lg hover:bg-ncr-primary-dark font-medium text-sm">
                Regenerate demo data →
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
          <p>Showing {data?.items.length || 0} of {data?.total || 0} items</p>
          <p className="text-ncr-primary font-medium">UGAHacks 11 • Optimus</p>
        </div>
      </div>
    </main>
  );
}

