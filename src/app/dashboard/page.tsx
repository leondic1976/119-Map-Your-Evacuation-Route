import type { Metadata } from 'next';
import React from 'react';
import CampaignDashboardPage from '../../ui/CampaignDashboardPage';

export const metadata: Metadata = {
  title: '어린이 소방안전 통합포털 | 우리집 대피지도',
  description: '소방기관·교육기관·가정이 함께 어린이 소방안전교육을 운영하고 활동 현황을 살피는 통합 대시보드',
};

export default function DashboardPage() {
  return <CampaignDashboardPage />;
}
