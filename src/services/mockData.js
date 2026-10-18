/**
 * Prototype mock data for PagePulse Digital Observatory.
 * Kept isolated in a dedicated module so it can be swapped for an HTTP client.
 */

export const DEFAULT_STORE = {
  version: 2,
  monitors: [
    {
      id: 'atelier-nordic',
      name: 'Atelier Nordic Tiering',
      initials: 'AN',
      url: 'atelier-nordic.com/pricing',
      fullUrl: 'https://atelier-nordic.com/pricing',
      status: 'changed', // 'changed' | 'healthy' | 'attention' | 'paused' | 'pending'
      previousStatus: 'healthy',
      lastChecked: '4m ago',
      lastChange: 'Price shift: €39 → €49 / mo',
      checkCadence: '15m',
      mode: 'both', // 'text' | 'visual' | 'both'
      cssSelector: '.pricing-grid',
      isReviewed: false,
      compareId: 'atelier-nordic',
      createdAt: '2026-10-10T10:00:00Z',
      isPrototype: true
    },
    {
      id: 'linear-app',
      name: 'Linear App Releases',
      initials: 'LN',
      url: 'linear.app/releases',
      fullUrl: 'https://linear.app/releases',
      status: 'healthy',
      previousStatus: 'healthy',
      lastChecked: '11m ago',
      lastChange: 'v2025.02 Release notes',
      checkCadence: '1h',
      mode: 'text',
      cssSelector: '#changelog-stream',
      isReviewed: true,
      compareId: 'linear-app',
      createdAt: '2026-10-08T09:30:00Z',
      isPrototype: true
    },
    {
      id: 'minimalissimo',
      name: 'Minimalissimo Store',
      initials: 'ML',
      url: 'minimalissimo.com/shop',
      fullUrl: 'https://minimalissimo.com/shop',
      status: 'attention',
      previousStatus: 'healthy',
      lastChecked: '1h ago',
      lastChange: 'Critical layout shift detected',
      checkCadence: '15m',
      mode: 'both',
      cssSelector: 'main .product-grid',
      isReviewed: false,
      compareId: 'minimalissimo',
      createdAt: '2026-10-09T14:15:00Z',
      isPrototype: true
    },
    {
      id: 'stripe-docs',
      name: 'Stripe Documentation Portal',
      initials: 'ST',
      url: 'stripe.com/docs',
      fullUrl: 'https://stripe.com/docs',
      status: 'healthy',
      previousStatus: 'healthy',
      lastChecked: '25m ago',
      lastChange: 'Navigation header layout tweak',
      checkCadence: '6h',
      mode: 'text',
      cssSelector: 'header.docs-nav',
      isReviewed: true,
      compareId: 'stripe-docs',
      createdAt: '2026-10-05T11:00:00Z',
      isPrototype: true
    },
    {
      id: 'readcv',
      name: 'ReadCV Showcase',
      initials: 'RC',
      url: 'readcv.com/explore',
      fullUrl: 'https://readcv.com/explore',
      status: 'healthy',
      previousStatus: 'healthy',
      lastChecked: '2h ago',
      lastChange: 'New designer roster item indexed',
      checkCadence: '24h',
      mode: 'visual',
      cssSelector: '',
      isReviewed: true,
      compareId: 'readcv',
      createdAt: '2026-10-04T16:20:00Z',
      isPrototype: true
    },
    {
      id: 'raycast',
      name: 'Raycast Store & Changelog',
      initials: 'RY',
      url: 'raycast.com/changelog',
      fullUrl: 'https://raycast.com/changelog',
      status: 'healthy',
      previousStatus: 'healthy',
      lastChecked: '3h ago',
      lastChange: 'Extension store badge updated',
      checkCadence: '1h',
      mode: 'text',
      cssSelector: '',
      isReviewed: true,
      compareId: 'raycast',
      createdAt: '2026-10-02T13:45:00Z',
      isPrototype: true
    }
  ],

  comparisons: {
    'atelier-nordic': {
      id: 'atelier-nordic',
      title: 'atelier-nordic.com/pricing (Pro Tier)',
      url: 'atelier-nordic.com/pricing',
      activeSnapshotId: '#849',
      snapshots: {
        '#849': {
          id: '#849',
          timestamp: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC · Current',
          baselineTimestamp: new Date(Date.now() - 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + new Date(Date.now() - 86400000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC · Baseline',
          baselineVersion: 'v1.8.4',
          hasScreenshots: true,
          baselineTier: {
            name: 'Studio Tier',
            badge: 'Active',
            price: '₹999',
            period: '/ month',
            billed: 'Billed annually at ₹11,988',
            features: [
              'Full Scandinavian monographs library',
              'Bi-monthly physical print edition',
              'Direct curator studio dialogue'
            ],
            buttonText: 'Subscribe Baseline'
          },
          currentTier: {
            name: 'Studio Tier',
            badge: '1 Modification',
            currentBadge: 'Current',
            price: '₹1,199',
            oldPrice: '₹999',
            diffPercent: '+20%',
            period: '/ month',
            billed: 'Billed annually at ₹14,388 (+₹2,400)',
            features: [
              'Full Scandinavian monographs library',
              'Bi-monthly physical print edition',
              'Direct curator studio dialogue'
            ],
            buttonText: 'Subscribe Updated'
          },
          changeSummary: {
            heading: 'Price adjustment detected',
            details: 'Atelier Pro subscription increased by ₹200/month (+20%) from ₹999 to ₹1,199. Onboarding assistance was removed from standard tier inclusions. All other terms and layout elements remain unchanged.',
            domNodesModified: 42
          },
          textDiff: {
            removed: [
              'Studio Subscription: €39 / mo',
              'Included seats: 3 curators',
              'Vector visual history: 30 days',
              'Complimentary Onboarding Assistance'
            ],
            added: [
              'Studio Subscription: €49 / mo (+25.6%)',
              'Included seats: 5 curators (+2 seats)',
              'Vector visual history: 90 days (Extended)',
              'Enterprise Onboarding: Auxiliary SOW only'
            ]
          }
        },
        '#848': {
          id: '#848',
          timestamp: '15 Oct, 04:30 UTC · Routine Scan',
          baselineTimestamp: '14 Oct, 10:30 UTC · Baseline',
          baselineVersion: 'v1.8.4',
          hasScreenshots: true,
          baselineTier: {
            name: 'Studio Tier',
            badge: 'Active',
            price: '₹999',
            period: '/ month',
            billed: 'Billed annually at ₹11,988',
            features: [
              'Full Scandinavian monographs library',
              'Bi-monthly physical print edition',
              'Direct curator studio dialogue'
            ],
            buttonText: 'Subscribe Baseline'
          },
          currentTier: {
            name: 'Studio Tier',
            badge: 'Clean',
            currentBadge: 'Verified',
            price: '₹999',
            period: '/ month',
            billed: 'Billed annually at ₹11,988',
            features: [
              'Full Scandinavian monographs library',
              'Bi-monthly physical print edition',
              'Direct curator studio dialogue'
            ],
            buttonText: 'Subscribe Baseline'
          },
          changeSummary: {
            heading: 'Routine telemetry audit',
            details: 'Zero deviations recorded across all monitored DOM targets and screenshot diff buffers.',
            domNodesModified: 0
          },
          textDiff: {
            removed: [],
            added: []
          }
        },
        '#847': {
          id: '#847',
          timestamp: '14 Oct, 22:30 UTC · Routine Scan',
          baselineTimestamp: '14 Oct, 10:30 UTC · Baseline',
          baselineVersion: 'v1.8.4',
          hasScreenshots: true,
          baselineTier: {
            name: 'Studio Tier',
            badge: 'Active',
            price: '₹999',
            period: '/ month',
            billed: 'Billed annually at ₹11,988',
            features: [
              'Full Scandinavian monographs library',
              'Bi-monthly physical print edition',
              'Direct curator studio dialogue'
            ],
            buttonText: 'Subscribe Baseline'
          },
          currentTier: {
            name: 'Studio Tier',
            badge: 'Clean',
            currentBadge: 'Verified',
            price: '₹999',
            period: '/ month',
            billed: 'Billed annually at ₹11,988',
            features: [
              'Full Scandinavian monographs library',
              'Bi-monthly physical print edition',
              'Direct curator studio dialogue'
            ],
            buttonText: 'Subscribe Baseline'
          },
          changeSummary: {
            heading: 'Routine telemetry audit',
            details: 'Standard telemetry heartbeat nominal. DOM tree checksum matched baseline signature.',
            domNodesModified: 0
          },
          textDiff: {
            removed: [],
            added: []
          }
        }
      },
      chronology: [
        { id: '#849', label: 'Price increase detected (+₹200)', status: '1 Change', statusType: 'changed', time: 'Today, 10:30 UTC' },
        { id: '#848', label: 'Routine telemetry audit · No deviations', status: 'Clean', statusType: 'clean', time: 'Today, 04:30 UTC' },
        { id: '#847', label: 'Routine telemetry audit · No deviations', status: 'Clean', statusType: 'clean', time: 'Yesterday, 22:30 UTC' }
      ]
    },

    'linear-app': {
      id: 'linear-app',
      title: 'linear.app/releases',
      url: 'linear.app/releases',
      activeSnapshotId: '#412',
      snapshots: {
        '#412': {
          id: '#412',
          timestamp: 'Today, 10:24 AM · Current',
          baselineTimestamp: '12 Oct, 14:00 UTC · Baseline',
          baselineVersion: 'v2024.09',
          hasScreenshots: true,
          baselineTier: {
            name: 'Changelog View',
            badge: 'Active',
            price: 'v2024.09',
            period: 'Release',
            billed: 'Card layout format with release notes',
            features: [
              'Grid-based release card components',
              'Standard issue link tags',
              'Legacy search'
            ],
            buttonText: 'View Baseline'
          },
          currentTier: {
            name: 'Changelog View',
            badge: 'Layout Overhaul',
            currentBadge: 'Current',
            price: 'v2025.02',
            oldPrice: 'v2024.09',
            diffPercent: 'UX',
            period: 'Release',
            billed: 'Unified vertical stream timeline',
            features: [
              'Project timeline integrated view',
              'Unified global search',
              'Commit-level release markers'
            ],
            buttonText: 'View Current'
          },
          changeSummary: {
            heading: 'Timeline UI Overhaul',
            details: 'Transitioned from card-based release notes to a unified vertical stream, prioritizing commit markers over long release titles.',
            domNodesModified: 18
          },
          textDiff: {
            removed: ['Card-based release notes archive', 'Search input v1'],
            added: ['Project timeline view', 'Unified search dialog']
          }
        }
      },
      chronology: [
        { id: '#412', label: 'Unified timeline view deployed', status: '1 Change', statusType: 'changed', time: 'Today, 10:24 AM' },
        { id: '#411', label: 'Changelog asset refresh', status: 'Clean', statusType: 'clean', time: '13 Oct, 08:00 UTC' }
      ]
    },

    'minimalissimo': {
      id: 'minimalissimo',
      title: 'minimalissimo.com/shop',
      url: 'minimalissimo.com/shop',
      activeSnapshotId: '#904',
      snapshots: {
        '#904': {
          id: '#904',
          timestamp: '1h ago · Current',
          baselineTimestamp: '14 Oct, 08:00 UTC · Baseline',
          baselineVersion: 'v3.2',
          hasScreenshots: false, // Honest placeholder!
          baselineTier: {
            name: 'Storefront Grid',
            badge: 'Active',
            price: '3 Columns',
            period: 'Layout',
            billed: 'Curated physical editions showcase',
            features: [
              'Even 3-column architectural grid',
              'Fixed viewport height hero',
              'Cart drawer v2'
            ],
            buttonText: 'Inspect Baseline'
          },
          currentTier: {
            name: 'Storefront Grid',
            badge: 'Layout Shift Flagged',
            currentBadge: 'Shift Flagged',
            price: 'Broken Grid',
            oldPrice: '3 Columns',
            diffPercent: 'Shift',
            period: 'Layout',
            billed: 'Hero container height expanded unexpectedly',
            features: [
              'Asymmetrical container overlap detected',
              'Cart button shifted below fold (+180px)',
              'Font fallback misaligned'
            ],
            buttonText: 'Review Deviation'
          },
          changeSummary: {
            heading: 'Critical layout shift detected',
            details: 'The storefront hero container expanded by +180px, causing the primary "Add to Bag" action to drop below the viewport fold on 1440px displays.',
            domNodesModified: 89
          },
          textDiff: {
            removed: ['max-height: 520px; overflow: hidden;'],
            added: ['height: auto; min-height: 700px;']
          }
        }
      },
      chronology: [
        { id: '#904', label: 'Layout shift flagged', status: 'Requires Review', statusType: 'attention', time: '1h ago' },
        { id: '#903', label: 'Routine telemetry audit', status: 'Clean', statusType: 'clean', time: '6h ago' }
      ]
    }
  },

  history: [
    {
      id: 'h-1',
      monitorId: 'atelier-nordic',
      target: 'Atelier Nordic Tiering',
      url: 'atelier-nordic.com/pricing',
      timestamp: 'Today, 10:30 UTC',
      scanId: '#849',
      changeType: 'pricing',
      title: 'Monthly subscription shifted from ₹999 to ₹1,199 (+20%)',
      details: 'Complimentary onboarding was unbundled and removed from standard tier inclusions.',
      status: 'changed',
      isReviewed: false,
      compareId: 'atelier-nordic'
    },
    {
      id: 'h-2',
      monitorId: 'linear-app',
      target: 'Linear App Releases',
      url: 'linear.app/releases',
      timestamp: 'Today, 10:24 AM',
      scanId: '#412',
      changeType: 'ux',
      title: 'Changelog v2024.10: Added project timeline view and unified search.',
      details: 'Transitioned from card-based release notes to a unified vertical stream.',
      status: 'healthy',
      isReviewed: true,
      compareId: 'linear-app'
    },
    {
      id: 'h-3',
      monitorId: 'minimalissimo',
      target: 'Minimalissimo Store',
      url: 'minimalissimo.com/shop',
      timestamp: 'Today, 09:15 AM',
      scanId: '#904',
      changeType: 'layout',
      title: 'Critical layout shift detected on product grid fold.',
      details: 'Hero container height expanded unexpectedly causing cart button to shift below fold.',
      status: 'attention',
      isReviewed: false,
      compareId: 'minimalissimo'
    },
    {
      id: 'h-4',
      monitorId: 'stripe-docs',
      target: 'Stripe Documentation Portal',
      url: 'stripe.com/docs',
      timestamp: 'Yesterday, 16:40 UTC',
      scanId: '#128',
      changeType: 'ux',
      title: 'Navigation header layout tweak and API version badge updated.',
      details: 'Minor CSS padding adjustments and typography kerning polish.',
      status: 'healthy',
      isReviewed: true,
      compareId: 'stripe-docs'
    },
    {
      id: 'h-5',
      monitorId: 'raycast',
      target: 'Raycast Store & Changelog',
      url: 'raycast.com/changelog',
      timestamp: 'Yesterday, 11:20 UTC',
      scanId: '#309',
      changeType: 'features',
      title: 'Extension store badge updated and macOS Sequoia compatibility verified.',
      details: '14 new community extensions indexed.',
      status: 'healthy',
      isReviewed: true,
      compareId: 'raycast'
    }
  ],

  insights: {
    featured: {
      id: 'featured-1',
      badge: 'Pricing Shift · High Impact',
      source: 'nordic-atelier.se/pricing · Today, 10:30 AM',
      title: 'Atelier Nordic unbundled onboarding services alongside a 20% price increase.',
      summary: 'Monthly rate adjusted from ₹999 to ₹1,199. Complimentary onboarding is no longer bundled in standard plans.',
      observed: '₹999 replaced with ₹1,199 on landing plan ledger.',
      inference: 'Shifts standard customer onboarding into an enterprise auxiliary professional services contract.',
      compareId: 'atelier-nordic',
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDiQwwGK7x1gK9WEZ5e0iufT8EjUVlq2MRwRdrR3xyFkQv6ApFtIMwcp0CPUn2cMtzg-_y-y-715VLcNE4mDZiHCdOGUTUlSnVqFbqJ01xhYWjH2LrD3zva5yDRYVQo7s2KInv9Tx6uXR56H75LMr4vUGS6DFuf0TjjFfCkszt5TtNv1SgeI3scgh0Ou50lJlf8UAEzPgd8fF7WyW5C6yT75oIJtIX_pAF7Qymcb-oShIUsc4YHl1Cu'
    },
    dispatches: [
      {
        id: 'disp-1',
        category: 'UX',
        filterType: 'Design & UX',
        source: 'linear.app/releases',
        time: 'Today, 09:15 AM',
        title: 'Overhauled changelog layout to a continuous timeline.',
        body: 'Transitioned from card-based release notes to a unified vertical stream, prioritizing commit markers over long release titles.',
        compareId: 'linear-app'
      },
      {
        id: 'disp-2',
        category: 'Compliance',
        filterType: 'Pricing & Terms',
        source: 'stripe.com/legal/in',
        time: 'Yesterday, 4:40 PM',
        title: 'Updated settlement schedule from 30 calendar days to 7 business days.',
        body: 'Clarified GST automated invoice timelines and cross-border software export payouts under expedited settlement rules.',
        compareId: 'stripe-docs'
      },
      {
        id: 'disp-3',
        category: 'Marketing',
        filterType: 'Features',
        source: 'framer.com',
        time: '2 days ago',
        title: 'Testing headline copy variant targeting design-to-production speed.',
        body: 'Allocating 28% of incoming traffic to a messaging variant highlighting seamless Figma-to-code workflow rather than visual builder tools.',
        compareId: 'atelier-nordic'
      }
    ]
  }
};

export const INSIGHTS_DATA = DEFAULT_STORE.insights;
export const INITIAL_MONITORS = DEFAULT_STORE.monitors;
export const COMPARISONS_DATA = DEFAULT_STORE.comparisons;
export const RECENT_ACTIVITY_ITEMS = DEFAULT_STORE.history;
