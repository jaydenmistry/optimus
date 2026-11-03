'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, API_URL } from '@/lib/api';
import type { DemoStats, DemoPreview } from '@/lib/types';

const DEMO_PARAMS = { num_stores: 5, num_skus: 200, days_history: 60 };

export default function AdminPage() {
  const [stats, setStats] = useState<DemoStats | null>(null);
  const [preview, setPreview] = useState<DemoPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    loadPreview();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);
      const data = await api.getDemoStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview() {
    try {
      const data = await api.getDemoPreview(DEMO_PARAMS);
      setPreview(data);
    } catch {
      setPreview(null);
    }
  }

  async function regenerateData() {
    if (!confirm('This will delete all existing data and generate new demo data. Continue?')) {
      return;
    }

    try {
      setRegenerating(true);
      await api.regenerateDemoData(DEMO_PARAMS);
      alert('Demo data regenerated successfully!');
      await loadStats();
    } catch (err) {
      alert('Failed to regenerate data: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ncr-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ncr-primary mx-auto"></div>
           <p className="mt-4 text-ncr-gray-600">Loading statistics...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ncr-gray-50">
      {/* Header */}
      <div className="bg-gradient-purple text-white">
        <div className="max-w-4xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">Data Administration</h1>
              <p className="text-purple-100 text-lg">
                Manage demo data and view system statistics
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

      <div className="max-w-4xl mx-auto px-8 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Database Statistics */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-ncr-dark mb-6">Database Statistics</h2>
          
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="border-l-4 border-ncr-primary bg-ncr-primary-pale rounded-r-lg p-4">
                <p className="text-xs text-ncr-primary font-semibold uppercase tracking-wide mb-1">Stores</p>
                <p className="text-3xl font-bold text-ncr-dark">{stats.stores}</p>
              </div>
              <div className="border-l-4 border-ncr-secondary bg-purple-50 rounded-r-lg p-4">
                <p className="text-xs text-ncr-secondary font-semibold uppercase tracking-wide mb-1">SKUs</p>
                <p className="text-3xl font-bold text-ncr-dark">{stats.skus}</p>
              </div>
              <div className="border-l-4 border-blue-500 bg-blue-50 rounded-r-lg p-4">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Inventory Snapshots</p>
                <p className="text-3xl font-bold text-ncr-dark">{stats.inventory_snapshots.toLocaleString()}</p>
              </div>
              <div className="border-l-4 border-green-500 bg-green-50 rounded-r-lg p-4">
                <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Sales Records</p>
                <p className="text-2xl font-bold text-ncr-dark">{stats.sales_records.toLocaleString()}</p>
              </div>
              <div className="border-l-4 border-red-500 bg-red-50 rounded-r-lg p-4">
                <p className="text-xs text-red-600 font-semibold uppercase tracking-wide mb-1">Anomalies Detected</p>
                <p className="text-3xl font-bold text-red-600">{stats.anomalies}</p>
              </div>
              <div className="border-l-4 border-ncr-primary bg-ncr-primary-pale rounded-r-lg p-4">
                <p className="text-xs text-ncr-primary font-semibold uppercase tracking-wide mb-1">Transfer Recommendations</p>
                <p className="text-3xl font-bold text-ncr-primary">{stats.transfer_recommendations}</p>
              </div>
            </div>
          )}

          {stats?.date_range && (
            <div className="mt-6 pt-4 border-t border-ncr-gray-200">
              <p className="text-sm text-ncr-gray-700">
                <span className="font-semibold text-ncr-dark">Data Range:</span>{' '}
                {new Date(stats.date_range.start).toLocaleDateString()} to{' '}
                {new Date(stats.date_range.end).toLocaleDateString()}{' '}
                ({stats.date_range.days} days)
              </p>
            </div>
          )}
        </div>

        {/* Demo Data Generator */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-2xl font-bold text-ncr-dark mb-6">Demo Data Generator</h2>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-yellow-800">Warning</h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Regenerating demo data will delete all existing data and create new synthetic data.
                  This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">What will be generated (based on current demo data settings):</h3>
              {preview ? (
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1.5">
                  <li>
                    <strong>{preview.stores} stores</strong> — {preview.store_names.join(', ')}
                  </li>
                  <li>
                    <strong>{preview.skus} SKUs</strong> across {preview.categories.length} categories: {preview.categories.join(', ')}
                  </li>
                  <li>
                    <strong>{preview.days_history} days</strong> of sales history with weekday/weekend patterns
                  </li>
                  <li>
                    <strong>~{preview.inventory_snapshots_approx.toLocaleString()} inventory snapshots</strong> (stores × SKUs × days)
                  </li>
                  <li>
                    Receipts: <strong>{preview.receipt_chance_pct}%</strong> chance per day per store-SKU
                  </li>
                  <li>
                    <strong>~{preview.anomalies_approx} anomalies</strong> (injected shrink / unrecorded drops)
                  </li>
                  <li>
                    Cycle counts: <strong>{preview.cycle_recent_pct}%</strong> of SKUs recent (last 7 days), <strong>{preview.cycle_older_pct}%</strong> older, <strong>{preview.cycle_none_pct}%</strong> none (per store)
                  </li>
                  <li>
                    Transfer recommendations: <strong>{preview.transfer_recommendations_approx}</strong>
                  </li>
                  <li>
                    Hourly sales: last <strong>{preview.sales_hourly_days} days</strong>, categories {preview.sales_hourly_categories.join(', ')}, up to {preview.sales_hourly_skus_per_store} SKUs per store (for Peak Hours)
                  </li>
                  <li>
                    IoT telemetry: <strong>{preview.telemetry_sensors} sensors</strong> × all stores — {preview.telemetry_description}
                  </li>
                  <li>Store distance matrix for transfer optimization (all store pairs)</li>
                </ul>
              ) : (
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  <li>5 stores (Chipotle Athens locations)</li>
                  <li>200 SKUs across 8 categories</li>
                  <li>60 days of sales and inventory history</li>
                  <li>~8 anomalies, cycle counts (60% recent / 20% older), 0–12 transfer recommendations</li>
                  <li>14 days hourly sales for Proteins, Salsas & Sauces, Produce; 4 sensors telemetry</li>
                </ul>
              )}
            </div>

            <button
              onClick={regenerateData}
              disabled={regenerating}
              className="w-full px-6 py-4 bg-gradient-purple text-white rounded-lg hover:bg-gradient-purple-dark disabled:bg-ncr-gray-400 disabled:cursor-not-allowed font-bold text-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
            >
              {regenerating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Regenerating Data...
                </span>
              ) : (
                'Regenerate Demo Data'
              )}
            </button>
          </div>
        </div>

        {/* API Information */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-2xl font-bold text-ncr-dark mb-6">API Information</h2>
          
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Backend API</p>
              <a
                href={`${API_URL}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ncr-primary hover:text-ncr-primary-dark hover:underline text-sm font-medium"
              >
                {API_URL}/docs
              </a>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Health Check</p>
              <a
                href={`${API_URL}/api/health`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                {API_URL}/api/health
              </a>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Version</p>
              <p className="text-sm text-gray-600">1.0.0</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
