import React from 'react';
import {
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

/** Brand mark: the request/response directional pair from DESIGN.md. */
export const BrandMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="7" className="fill-surface-950" />
    <path
      d="M9 11l5 5-5 5"
      className="stroke-brand-400"
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M23 21l-5-5 5-5"
      className="stroke-brand-200"
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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

/** The palette hint must name the binding this platform actually uses. */
const IS_APPLE_PLATFORM = /Mac|iPhone|iPad/i.test(navigator.userAgent);

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
        <BrandMark className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight truncate">
              MCP-Studio
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate">
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
            <ChevronDown className="h-4 w-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            aria-label={isConnected ? 'Disconnect active server' : 'Connect selected server'}
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
            title="Command palette"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5 text-brand-400" />
            <span>Search</span>
            <kbd className="text-[10px] font-mono bg-surface-800 text-slate-300 px-1 py-0.5 rounded">
              {IS_APPLE_PLATFORM ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
        )}

        <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh" aria-label="Refresh servers and entities">
          <RefreshCw className="h-4 w-4" />
        </Button>

        <a
          href="https://modelcontextprotocol.io"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1 text-xs text-slate-400 hover:text-brand-300 transition-colors px-2 py-1.5 rounded-md hover:bg-surface-800/60"
        >
          <span>Spec</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </header>
  );
};
