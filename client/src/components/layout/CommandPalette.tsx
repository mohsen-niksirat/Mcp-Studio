import React, { useState, useEffect } from 'react';
import {
  Search,
  Wrench,
  Bot,
  FolderArchive,
  Sparkles,
  Activity,
  Zap,
  ListChecks,
  Plus,
  Download,
  Trash2,
  X
} from 'lucide-react';
import { ActiveTab, ToolItem } from '../../types';

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

  const filtered = items.filter((item) =>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center space-x-3 bg-slate-900/60">
          <Search className="h-5 w-5 text-indigo-400 shrink-0" />
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
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-medium"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 border border-slate-700 rounded text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
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
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    <span className="font-medium truncate">{item.label}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {item.type}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Navigate with ↑ ↓ and Enter</span>
          <span>MCP-Studio Quick Actions</span>
        </div>
      </div>
    </div>
  );
};
