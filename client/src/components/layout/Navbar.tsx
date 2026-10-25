import React from 'react';
import {
  Boxes,
  Activity,
  Plus,
  RefreshCw,
  Power,
  ChevronDown,
  Terminal,
  Radio,
  Sparkles,
  ExternalLink,
  Search
} from 'lucide-react';
import { ServerConfig, ServerState } from '../../types';

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
  const isConnected = activeState?.status === 'connected';
  const isError = activeState?.status === 'error';

  return (
    <header className="h-16 border-b border-slate-800 bg-[#0d1424]/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Brand & Logo */}
      <div className="flex items-center space-x-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20">
          <div className="w-full h-full bg-[#0d1424] rounded-[11px] flex items-center justify-center">
            <Boxes className="h-5 w-5 text-indigo-400" />
          </div>
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              MCP-Studio
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
              IDE & Inspector
            </span>
          </div>
          <p className="text-xs text-slate-500">The Visual Testing Studio for Model Context Protocol</p>
        </div>
      </div>

      {/* Center: Server Selector & Quick Status */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-1 shadow-inner">
          <div className="relative">
            <select
              value={activeState?.config.id || ''}
              onChange={(e) => onSelectServer(e.target.value)}
              className="appearance-none bg-transparent pl-3 pr-8 py-1.5 text-sm font-medium text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="" disabled className="bg-slate-900 text-slate-400">
                Select an MCP Server...
              </option>
              {servers.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-slate-200">
                  {s.name} ({s.transport.toUpperCase()})
                </option>
              ))}
            </select>
            <ChevronDown className="h-4 w-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="h-5 w-[1px] bg-slate-800 mx-1" />

          {/* Status Indicator */}
          <div className="flex items-center space-x-2 px-3 py-1">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse'
                  : isConnecting
                  ? 'bg-amber-400 animate-spin'
                  : isError
                  ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                  : 'bg-slate-600'
              }`}
            />
            <span className="text-xs font-mono font-medium capitalize text-slate-300">
              {isConnecting ? 'Connecting...' : activeState?.status || 'Disconnected'}
            </span>
          </div>

          {/* Quick Connect / Disconnect Toggle */}
          {isConnected ? (
            <button
              onClick={onDisconnect}
              title="Disconnect Server"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
            >
              <Power className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => activeState?.config.id && onSelectServer(activeState.config.id)}
              disabled={!activeState?.config.id || isConnecting}
              title="Connect Server"
              className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${isConnecting ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Add Server Button */}
        <button
          onClick={onOpenAddServer}
          className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span>Add Server</span>
        </button>
      </div>

      {/* Right Tools & Links */}
      <div className="flex items-center space-x-3">
        {isConnected && activeState?.serverInfo && (
          <div className="hidden lg:flex items-center space-x-2 text-xs font-mono text-slate-400 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1.5 rounded-lg">
            <span className="text-indigo-400">{activeState.serverInfo.name}</span>
            <span className="text-slate-600">•</span>
            <span>v{activeState.serverInfo.version}</span>
          </div>
        )}

        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center space-x-2 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-xl transition-all"
            title="Open Command Palette (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5 text-indigo-400" />
            <span>Search or jump...</span>
            <kbd className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
              Ctrl+K
            </kbd>
          </button>
        )}

        <button
          onClick={onRefresh}
          title="Refresh All Data"
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>

        <a
          href="https://modelcontextprotocol.io"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center space-x-1 text-xs text-slate-400 hover:text-indigo-300 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/40"
        >
          <span>MCP Specs</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </header>
  );
};
