import React, { useState, useEffect } from 'react';
import {
  Activity,
  Bot,
  Download,
  FolderArchive,
  ListChecks,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wrench,
  Zap
} from 'lucide-react';
import { ActiveTab, ToolItem } from '../../types';
import { cn } from '../../lib/cn';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  tools: ToolItem[];
  onSelectTool?: (toolName: string) => void;
  onOpenAddServer: () => void;
  onOpenImport: () => void;
  onClearLogs: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  tools,
  onOpenAddServer,
  onOpenImport,
  onClearLogs
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          setQuery('');
          setSelectedIndex(0);
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items = [
    { id: 'tab-chat', label: 'AI Chat Sandbox', type: 'Navigation', icon: Bot, action: () => onSelectTab('chat') },
    { id: 'tab-tools', label: 'Tools Runner', type: 'Navigation', icon: Wrench, action: () => onSelectTab('tools') },
    { id: 'tab-resources', label: 'Resources Explorer', type: 'Navigation', icon: FolderArchive, action: () => onSelectTab('resources') },
    { id: 'tab-prompts', label: 'Prompt Inspector', type: 'Navigation', icon: Sparkles, action: () => onSelectTab('prompts') },
    { id: 'tab-collections', label: 'Test Suites (Runner)', type: 'Navigation', icon: ListChecks, action: () => onSelectTab('collections') },
    { id: 'tab-traffic', label: 'Protocol Inspector (Logs)', type: 'Navigation', icon: Activity, action: () => onSelectTab('traffic') },
    { id: 'tab-benchmark', label: 'Benchmark & Health Suite', type: 'Navigation', icon: Zap, action: () => onSelectTab('benchmark') },
    { id: 'act-add', label: 'Add MCP Server...', type: 'Action', icon: Plus, action: onOpenAddServer },
    { id: 'act-import', label: 'Import from Claude / Cursor', type: 'Action', icon: Download, action: onOpenImport },
    { id: 'act-clear', label: 'Clear Protocol Logs', type: 'Action', icon: Trash2, action: onClearLogs },
    ...tools.map((t) => ({
      id: `tool-${t.name}`,
      label: `Tool: ${t.name}`,
      type: 'MCP Tool',
      icon: Wrench,
      action: () => {
        onSelectTab('tools');
      }
    }))
  ];

  const filtered = items.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.type.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (idx: number) => {
    const item = filtered[idx];
    if (item) {
      item.action();
      onClose();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelect(selectedIndex);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-surface-950 border border-surface-800 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search */}
        <div className="p-4 border-b border-surface-800 flex items-center gap-3">
          <Search className="h-4 w-4 text-brand-400 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Type a command, search tools, or jump to workspace..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono bg-surface-800 border border-surface-700 rounded text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-mono">
              No matching commands or tools found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = selectedIndex === idx;

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(idx)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-xs transition-colors',
                    isSelected
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-300 hover:bg-surface-800/60'
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isSelected ? 'text-white' : 'text-slate-400'
                      )}
                    />
                    <span className="font-medium truncate">{item.label}</span>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-mono px-2 py-0.5 rounded-full',
                      isSelected
                        ? 'bg-brand-700/60 text-brand-100'
                        : 'bg-surface-800 text-slate-500'
                    )}
                  >
                    {item.type}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-surface-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Navigate with ↑ ↓ and Enter</span>
          <span>MCP-Studio Quick Actions</span>
        </div>
      </div>
    </div>
  );
};
