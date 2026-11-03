import React from 'react';
import {
  Activity,
  Bot,
  FileDown,
  FolderArchive,
  Layers,
  ListChecks,
  MessageSquareText,
  Wrench,
  Zap
} from 'lucide-react';
import { ActiveTab, ServerState } from '../../types';
import { Badge, Button } from '../ui/primitives';
import { cn } from '../../lib/cn';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  logCount: number;
  activeState: ServerState | null;
  onOpenImport: () => void;
}

// Icon semantics are documented in DESIGN.md; every glyph maps to what the
// tab actually does. Exported so the narrow-viewport tab strip in App.tsx
// renders the exact same navigation.
export const NAV_ITEMS = [
  {
    id: 'chat' as ActiveTab,
    label: 'AI Chat Sandbox',
    icon: Bot,
    description: 'Natural-language tool testing'
  },
  {
    id: 'tools' as ActiveTab,
    label: 'Tools Runner',
    icon: Wrench,
    badgeKey: 'tools',
    description: 'Execute tools with schema forms'
  },
  {
    id: 'resources' as ActiveTab,
    label: 'Resources',
    icon: FolderArchive,
    badgeKey: 'resources',
    description: 'Browse exposed resources'
  },
  {
    id: 'prompts' as ActiveTab,
    label: 'Prompts',
    icon: MessageSquareText,
    badgeKey: 'prompts',
    description: 'Inspect prompt templates'
  },
  {
    id: 'collections' as ActiveTab,
    label: 'Test Suites',
    icon: ListChecks,
    description: 'Sequential assertion runner'
  },
  {
    id: 'traffic' as ActiveTab,
    label: 'Protocol Inspector',
    icon: Activity,
    badgeKey: 'logs',
    description: 'Live JSON-RPC stream'
  },
  {
    id: 'benchmark' as ActiveTab,
    label: 'Benchmark',
    icon: Zap,
    description: 'Latency measurement'
  }
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  toolCount,
  resourceCount,
  promptCount,
  logCount,
  activeState,
  onOpenImport
}) => {
  const badgeCount: Record<string, number | undefined> = {
    tools: toolCount,
    resources: resourceCount,
    prompts: promptCount,
    logs: logCount
  };

  return (
    <aside className="hidden md:flex w-60 border-r border-surface-800 bg-surface-950 flex-col shrink-0">
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto" aria-label="Workspaces">
        <div className="px-3 py-2 section-label">Workspaces</div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const count = item.badgeKey ? badgeCount[item.badgeKey] : undefined;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600/15 text-brand-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-900/60'
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-brand-400' : 'text-slate-400'
                  )}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {count !== undefined && count > 0 && (
                <Badge tone={isActive ? 'brand' : 'neutral'}>
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-surface-800 space-y-2">
        <Button
          variant="secondary"
          size="sm"
          className="w-full justify-center"
          onClick={onOpenImport}
        >
          <FileDown className="h-3.5 w-3.5 text-brand-400" />
          <span>Import Configs</span>
        </Button>

        {activeState && (
          <div className="bg-surface-900/50 border border-surface-800 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300 truncate">
                {activeState.config.name}
              </span>
              <Badge tone="neutral" className="font-mono text-[10px] uppercase">
                {activeState.config.transport}
              </Badge>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              {activeState.serverInfo?.protocolVersion
                ? `MCP ${activeState.serverInfo.protocolVersion}`
                : 'Protocol 2024-11-05'}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
