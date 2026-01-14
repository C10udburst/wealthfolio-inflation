import React from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { Icons } from '@wealthfolio/ui';
import InflationComparisonPage from './pages/InflationComparisonPage';

export default function enable(ctx: AddonContext) {
  // Add a sidebar item
  const sidebarItem = ctx.sidebar.addItem({
    id: 'wealthfolio-inflation',
    label: 'Inflation comparison',
    icon: <Icons.ChartBar className="h-5 w-5" />,
    route: '/addon/wealthfolio-inflation',
    order: 100,
  });

  // Add a route
  const Wrapper = () => <InflationComparisonPage ctx={ctx} />;
  ctx.router.add({
    path: '/addon/wealthfolio-inflation',
    component: React.lazy(() => Promise.resolve({ default: Wrapper })),
  });

  // Cleanup on disable
  ctx.onDisable(() => {
    try {
      sidebarItem.remove();
    } catch (err) {
      ctx.api.logger.error(`Failed to remove sidebar item: ${String(err)}`);
    }
  });
}
