import React, { useMemo } from 'react';
import { HeroSection } from '../components/home/HeroSection';
import { CategoryGrid } from '../components/home/CategoryGrid';
import { RecentListings } from '../components/home/RecentListings';
import { HowItWorks } from '../components/home/HowItWorks';
import { resourceService } from '../services/resourceService';

export const HomePage = ({ resources = [], loading = false, stats = null }) => {
  const categoryCounts = useMemo(() => {
    return resourceService.getCategoryCounts(resources);
  }, [resources]);

  return (
    <div>
      <HeroSection stats={stats} />
      <CategoryGrid categoryCounts={categoryCounts} />
      <RecentListings resources={resources} loading={loading} />
      <HowItWorks />
    </div>
  );
};
