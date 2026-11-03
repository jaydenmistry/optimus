'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { PeakHoursDashboard } from '@/lib/types';

export default function PeakHoursPage() {
  const [data, setData] = useState<PeakHoursDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState(1);

  useEffect(() => {
    loadData();
    // Refresh every 60 seconds
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [selectedStore]);

  async function loadData() {
    try {
      setLoading(true);
      const response = await api.getPeakHoursDashboard(selectedStore);
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  }

  function formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ncr-primary mx-auto"></div>
            <p className="mt-4 text-ncr-gray-600">Loading peak hour data...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-ncr-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-red-800 font-semibold mb-2">Error Loading Data</h2>
            <p className="text-red-600">{error}</p>
            <button
              onClick={loadData}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ncr-gray-50">
      {/* Header */}
      <div className="bg-gradient-purple text-white shadow-lg">
  <div className="max-w-7xl mx-auto px-8 py-8">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-4xl font-bold mb-2">Peak Hour Forecasting</h1>
        <p className="text-purple-100 text-lg">
          Real-time demand prediction for lunch and dinner rushes
        </p>
      </div>
            <Link
              href="/"
              className="px-6 py-3 bg-white text-ncr-primary rounded-lg hover:bg-ncr-gray-100 transition-colors font-semibold shadow-lg"
            >
              ← Back to Overview
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6">
        {/* Current Time & Next Peak */}
        {data && data.summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Current Time Card */}
            <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-ncr-primary">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-ncr-dark">Current Time</h2>
                <div className="text-3xl">⏰</div>
              </div>
              <p className="text-4xl font-bold text-ncr-primary">
                {formatTime(data.summary.current_time)}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                {data.summary.is_currently_peak ? (
                  <span className="text-orange-600 font-semibold">
                    🔥 {data.summary.next_peak_period.toUpperCase()} RUSH IN PROGRESS
                  </span>
                ) : (
                  `Next peak: ${data.summary.next_peak_period} rush`
                )}
              </p>
            </div>

            {/* Next Peak Countdown */}
            <div className={`rounded-xl shadow-md p-6 border-l-4 ${
              data.summary.is_currently_peak 
                ? 'bg-orange-50 border-orange-500' 
                : 'bg-ncr-primary-pale border-ncr-primary'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-ncr-dark">
                  {data.summary.is_currently_peak ? 'Peak Period Active' : 'Next Peak Period'}
                </h2>
                <div className="text-3xl">
                  {data.summary.next_peak_period === 'lunch' ? '🍽️' : '🌮'}
                </div>
              </div>
              {!data.summary.is_currently_peak ? (
                <>
                  <p className="text-4xl font-bold text-ncr-primary">
                    {Math.floor(data.summary.minutes_until_peak / 60)}h {data.summary.minutes_until_peak % 60}m
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Until {data.summary.next_peak_period} rush ({data.summary.next_peak_hour}:00)
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-orange-600">
                    ACTIVE NOW
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Monitor inventory closely during peak hours
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Critical Alerts */}
        {data && data.summary.at_risk_items.length > 0 && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  ⚠️ {data.summary.total_at_risk} Items Will Stock Out During Peak Hours
                </h3>
                <div className="space-y-2">
                  {data.summary.at_risk_items.map((item, idx) => (
                    <div key={idx} className="bg-white rounded p-3 border border-red-200">
                      <p className="font-semibold text-red-900">{item.sku_name}</p>
                      <p className="text-sm text-red-700">
                        Will run out at {formatTime(item.stockout_time)} during {item.peak_period} rush
                        {item.hours_until > 0 && ` (in ${item.hours_until} hours)`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prep Schedule */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-ncr-dark">Today&apos;s Prep Schedule</h2>
            <span className="px-3 py-1 bg-ncr-primary-pale text-ncr-primary rounded-full text-sm font-semibold">
              {data?.total_prep_tasks || 0} Tasks
            </span>
          </div>

          {data && data.prep_schedule.length > 0 ? (
            <div className="space-y-3">
              {data.prep_schedule.map((prep, idx) => (
                <div key={idx} className={`border-l-4 rounded-r-lg p-4 ${getPriorityColor(prep.priority)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="font-bold text-ncr-dark">{prep.sku_name}</h3>
                        <span className="px-2 py-1 text-xs font-bold rounded uppercase">
                          {prep.priority}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{prep.reason}</p>
                      <div className="flex items-center space-x-4 text-sm">
                        <div>
                          <span className="font-medium">Prep By:</span> {prep.prep_time_display}
                        </div>
                        <div>
                          <span className="font-medium">Quantity:</span> {prep.qty_to_prep} units
                        </div>
                        <div>
                          <span className="font-medium">Current:</span> {prep.current_on_hand} units
                        </div>
                      </div>
                    </div>
                    {prep.hours_until_prep > 0 && (
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">
                          {Math.floor(prep.hours_until_prep)}h {Math.floor((prep.hours_until_prep % 1) * 60)}m
                        </p>
                        <p className="text-xs text-ncr-gray-600">until prep time</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>No prep tasks needed - all items have sufficient inventory</p>
            </div>
          )}
        </div>

        {/* Critical Items Overview */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-2xl font-bold text-ncr-dark mb-4">Critical Items - Hourly Forecast</h2>
          {(!data?.critical_items || data.critical_items.length === 0) && (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
              <p className="font-medium mb-2">No critical items or hourly data yet</p>
              <p className="text-sm mb-4">Regenerate demo data to populate hourly sales and see forecasts here.</p>
              <Link href="/admin" className="text-ncr-primary font-semibold hover:underline">Go to Admin → Regenerate Demo Data</Link>
            </div>
          )}
          <div className="space-y-6">
            {data?.critical_items.slice(0, 5).map((item, idx) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-ncr-dark">{item.sku_name}</h3>
                    <p className="text-sm text-gray-600">{item.category} • On Hand: {item.on_hand} units</p>
                  </div>
                  {item.stockout_prediction.will_stockout && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-600">Will Stock Out</p>
                      <p className="text-lg font-bold text-red-700">
                        {formatTime(item.stockout_prediction.stockout_time!)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Simple hourly bar chart */}
                <div className="mt-4">
                  {(!item.hourly_forecast || item.hourly_forecast.length === 0) ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No hourly data yet. Regenerate demo data to populate.</p>
                  ) : (
                  <div className="flex items-end gap-0.5 h-32">
                    {item.hourly_forecast.map((forecast, fIdx) => {
                      const maxDemand = Math.max(1, ...item.hourly_forecast.map(f => f.predicted_demand));
                      const rawHeight = (forecast.predicted_demand / maxDemand) * 100;
                      const height = forecast.predicted_demand > 0 ? Math.max(8, Math.min(100, rawHeight)) : 0;
                      
                      return (
                        <div key={fIdx} className="flex-1 flex flex-col items-center min-w-0 h-full">
                          <div className="flex-1 w-full min-h-0 flex flex-col justify-end">
                            <div
                              className={`w-full rounded-t min-h-[4px] ${
                                forecast.is_peak_hour 
                                  ? 'bg-orange-500' 
                                  : 'bg-ncr-primary'
                              }`}
                              style={{ height: `${height}%` }}
                              title={`${forecast.hour_display}: ${forecast.predicted_demand} units`}
                            />
                          </div>
                          <p className="text-[10px] text-gray-600 mt-1 truncate w-full text-center">{forecast.hour_display}</p>
                        </div>
                      );
                    })}
                  </div>
                  )}
                  <div className="flex items-center justify-center space-x-4 mt-2 text-xs">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-ncr-primary rounded mr-1"></div>
                      <span>Regular Hours</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-orange-500 rounded mr-1"></div>
                      <span>Peak Hours</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 bg-ncr-primary-pale border border-ncr-primary rounded-lg p-4">
          <h3 className="font-bold text-ncr-dark mb-2">Peak Hours Definition</h3>
          <div className="grid grid-cols-2 gap-4 text-sm text-ncr-dark">
            <div>
              <span className="font-medium">Lunch Rush:</span> 11:00 AM - 2:00 PM
            </div>
            <div>
              <span className="font-medium">Dinner Rush:</span> 5:00 PM - 8:00 PM
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
