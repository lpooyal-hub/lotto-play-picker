'use client';

import { useState } from 'react';

import LottoPicker from './LottoPicker';
import Pension720Viewer from './Pension720Viewer';

const TABS = [
  { id: 'lotto', label: '로또 6/45' },
  { id: 'pension720', label: '연금720+' },
];

export default function GameTabs() {
  const [activeTab, setActiveTab] = useState('lotto');

  return (
    <>
      <div className="game-tab-bar" role="tablist" aria-label="복권 종류 선택">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`game-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'lotto' ? <LottoPicker /> : <Pension720Viewer />}
    </>
  );
}
