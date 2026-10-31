import React from 'react';
import {
  Boxes,
  ChevronDown,
  ExternalLink,
  Plus,
  Power,
  RefreshCw,
  Search
} from 'lucide-react';
import { ServerConfig, ServerState } from '../../types';
import { Button } from '../ui/primitives';
import { StatusDot, StatusKind } from '../ui/primitives';

interface NavbarProps {
  servers: ServerConfig[];
  activeState: ServerState | null;
  onSelectServer: (id: string) => void;
  onDisconnect: () => void;
  onOpenAddServer: () => void;
  onRefresh: () => void;
  onOpenCommandPalette?: () => void;
  isConnecting: boolean;
}

function getStatusKind(state: ServerState | null, isConnecting: boolean): StatusKind {
  if (isConnecting || state?.status === 'connecting') return 'connecting';
  if (state?.status === 'connected') return 'connected';
  if (state?.status === 'error') return 'error';
  return 'disconnected';
}

export const Navbar: React.FC<NavbarProps> = ({
  servers,
  activeState,
  onSelectServer,
  onDisconnect,
  onOpenAddServer,
  onRefresh,
  onOpenCommandPalette,
  isConnecting
}) => {
  const status = getStatusKind(activeState, isConnecting);
  const isConnected = status === 'connected';

  return (
    <header className="h-14 border-b border-surface-800 bg-surface-950/90 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-40">
      {/* Brand */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 p-px">
          <div className="h-full w-full bg-surface-950 rounded-[7px] flex items-center justify-center">
            <Boxes className="h-4 w-4 text-brand-400" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight truncate">
              MCP-Studio
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-brand-600/15 border border-brand-500/25 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
              IDE
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            Visual testing studio for MCP servers
          </p>
        </div>
      </div>

      {/* Server switcher */}
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
        <div className="flex items-center bg-surface-900 border border-surface-800 rounded-lg overflow-hidden">
          <div className="relative">
            <select
              value={activeState?.config.id || ''}
              onChange={(e) => onSelectServer(e.target.value)}
              aria-label="Active MCP server"
              className="appearance-none bg-transparent pl-3 pr-7 py-1.5 text-sm font-medium text-slate-200 focus:outline-none cursor-pointer max-w-[160px] sm:max-w-[220px] truncate"
            >
              <option value="" disabled className="bg-surface-900">
                Select server...
              </option>
              {servers.map((s) => (
                <option key={s.id} value={s.id} className="bg-surface-900">
                  {s.name} ({s.transport.toUpperCase()})
                </option>
              ))}
            </select>
            <ChevronDown className="h-4 w-4 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="h-4 w-px bg-surface-800" />

          <div className="flex items-center gap-2 px-3 py-1.5">
            <StatusDot status={status} />
            <span className="text-[11px] font-medium text-slate-300 capitalize hidden sm:inline">
              {isConnecting ? 'Connecting' : activeState?.status || 'Disconnected'}
            </span>
          </div>

          <button
            onClick={
              isConnected
                ? onDisconnect
                : () =>
                    activeState?.config.id &&
                    onSelectServer(activeState.config.id)
            }
            disabled={!activeState?.config.id || isConnecting}
            title={isConnected ? 'Disconnect' : 'Connect'}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-surface-800 transition-colors disabled:opacity-40 border-l border-surface-800"
          >
            {isConnected ? (
              <Power className="h-4 w-4" />
            ) : (
              <RefreshCw
                className={`h-4 w-4 ${isConnecting ? 'animate-spin' : ''}`}
              />
            )}
          </button>
        </div>

        <Button size="sm" variant="primary" onClick={onOpenAddServer}>
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Server</span>
        </Button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {isConnected && activeState?.serverInfo && (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-surface-900/60 border border-surface-800 rounded-md px-2 py-1">
            <span className="text-brand-400">{activeState.serverInfo.name}</span>
            <span className="text-slate-600">·</span>
            <span>v{activeState.serverInfo.version}</span>
          </div>
        )}

        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-surface-900 border border-surface-800 hover:border-surface-700 rounded-md px-2.5 py-1.5 transition-colors"
            title="Command palette (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5 text-brand-400" />
            <span>Search</span>
            <kbd className="text-[10px] font-mono bg-surface-800 text-slate-400 px-1 py-0.5 rounded">
              ⌘K
            </kbd>
          </button>
        )}

        <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>

        <a
          href="https://modelcontextprotocol.io"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1 text-xs text-slate-500 hover:text-brand-300 transition-colors px-2 py-1.5 rounded-md hover:bg-surface-800/60"
        >
          <span>Spec</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </header>
  );
};
