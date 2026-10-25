import React from 'react';
import {
  Wrench,
  FolderArchive,
  Sparkles,
  Activity,
  Zap,
  Layers,
  FileCode,
  FileDown,
  Bot
} from 'lucide-react';
import { ActiveTab, ServerState } from '../../types';

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
  const navItems = [
    {
      id: 'chat' as ActiveTab,
      label: 'AI Chat Sandbox',
      icon: Bot,
      badge: 'AI',
      badgeColor: 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold',
      description: 'Test tools with autonomous LLM agent'
    },
    {
      id: 'tools' as ActiveTab,
      label: 'Tools Runner',
      icon: Wrench,
      badge: toolCount > 0 ? toolCount : undefined,
      description: 'Execute tools with dynamic schema forms'
    },
    {
      id: 'resources' as ActiveTab,
      label: 'Resources',
      icon: FolderArchive,
      badge: resourceCount > 0 ? resourceCount : undefined,
      description: 'Browse contextual resources & templates'
    },
    {
      id: 'prompts' as ActiveTab,
      label: 'Prompts',
      icon: Sparkles,
      badge: promptCount > 0 ? promptCount : undefined,
      description: 'Inspect & render prompt templates'
    },
    {
      id: 'traffic' as ActiveTab,
      label: 'Protocol Inspector',
      icon: Activity,
      badge: logCount > 0 ? logCount : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-400',
      description: 'Live JSON-RPC request & response stream'
    },
    {
      id: 'benchmark' as ActiveTab,
      label: 'Benchmark & Health',
      icon: Zap,
      description: 'Latency metrics & schema conformance'
    }
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-[#0a0f1d] flex flex-col justify-between shrink-0 h-[calc(100vh-4rem)]">
      {/* Top Nav List */}
      <div className="p-3 space-y-1">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider uppercase text-slate-500">
          Studio Workspaces
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon
                  className={`h-4 w-4 transition-colors ${
                    isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                    item.badgeColor ||
                    (isActive
                      ? 'bg-indigo-500/30 text-indigo-300'
                      : 'bg-slate-800 text-slate-400')
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Profile / Quick Action Card */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        <button
          onClick={onOpenImport}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all"
        >
          <FileDown className="h-4 w-4 text-indigo-400" />
          <span>Import Configs</span>
        </button>

        {activeState && (
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-medium text-slate-300 truncate max-w-[130px]">
                {activeState.config.name}
              </span>
              <span className="font-mono uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                {activeState.config.transport}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono truncate">
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
