import React, { useState } from 'react';
import {
  FolderArchive,
  Search,
  FileText,
  FileCode,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Layers,
  ArrowRight
} from 'lucide-react';
import { ResourceItem, ResourceTemplateItem } from '../../types';
import { api } from '../../lib/api';

interface ResourcesViewProps {
  resources: ResourceItem[];
  templates: ResourceTemplateItem[];
  isLoading: boolean;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  resources,
  templates,
  isLoading
}) => {
  const [selectedUri, setSelectedUri] = useState<string>(resources[0]?.uri || '');
  const [selectedTemplate, setSelectedTemplate] = useState<ResourceTemplateItem | null>(null);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [content, setContent] = useState<any | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [readLatency, setReadLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedUri && resources.length > 0) {
      handleSelectResource(resources[0]);
    }
  }, [resources, selectedUri]);

  const handleSelectResource = async (res: ResourceItem) => {
    setSelectedUri(res.uri);
    setSelectedTemplate(null);
    setIsReading(true);
    setError(null);
    try {
      const data = await api.readResource(res.uri);
      setContent(data);
      setReadLatency(data.latencyMs || null);
    } catch (e: any) {
      setError(e.message || 'Failed to read resource');
      setContent(null);
    } finally {
      setIsReading(false);
    }
  };

  const handleSelectTemplate = (tmpl: ResourceTemplateItem) => {
    setSelectedTemplate(tmpl);
    setSelectedUri('');
    setContent(null);
    setError(null);

    // Extract params from template: {param}
    const matches = tmpl.uriTemplate.match(/\{([^}]+)\}/g) || [];
    const initialParams: Record<string, string> = {};
    matches.forEach((m) => {
      const p = m.replace(/[{}]/g, '');
      initialParams[p] = p === 'userId' ? '101' : '';
    });
    setTemplateParams(initialParams);
  };

  const handleResolveTemplate = async () => {
    if (!selectedTemplate) return;
    let resolved = selectedTemplate.uriTemplate;
    for (const [key, val] of Object.entries(templateParams)) {
      resolved = resolved.replace(`{${key}}`, val);
    }

    setSelectedUri(resolved);
    setIsReading(true);
    setError(null);
    try {
      const data = await api.readResource(resolved);
      setContent(data);
      setReadLatency(data.latencyMs || null);
    } catch (e: any) {
      setError(e.message || 'Failed to read template resource');
      setContent(null);
    } finally {
      setIsReading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-500 font-mono text-xs">
        Loading resources from active MCP server...
      </div>
    );
  }

  const filteredResources = resources.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.uri.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column: Resource Tree & Templates */}
      <div className="w-80 border-r border-slate-800 bg-[#0c1222] flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search resources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* Static Resources */}
          <div>
            <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Exposed Resources ({filteredResources.length})
            </div>
            <div className="space-y-1 mt-1">
              {filteredResources.map((r) => {
                const isSelected = selectedUri === r.uri && !selectedTemplate;
                return (
                  <button
                    key={r.uri}
                    onClick={() => handleSelectResource(r)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-200'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <FileCode className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                      <span className="font-medium text-xs truncate">{r.name}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate mt-1 pl-5">
                      {r.uri}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resource Templates */}
          {templates.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Resource Templates ({templates.length})
              </div>
              <div className="space-y-1 mt-1">
                {templates.map((tmpl) => {
                  const isSelected = selectedTemplate?.uriTemplate === tmpl.uriTemplate;
                  return (
                    <button
                      key={tmpl.uriTemplate}
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={`w-full text-left p-2.5 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-200'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Layers className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                        <span className="font-medium text-xs truncate">{tmpl.name}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate mt-1 pl-5">
                        {tmpl.uriTemplate}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Preview & Template Resolver */}
      <div className="flex-1 flex flex-col bg-[#0b0f19] overflow-hidden">
        {/* Template Input Bar (if template selected) */}
        {selectedTemplate && (
          <div className="p-4 bg-slate-900/60 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-indigo-300">
                  Parameterize Template: {selectedTemplate.name}
                </span>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                  {selectedTemplate.uriTemplate}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {Object.keys(templateParams).map((key) => (
                <div key={key} className="flex-1">
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    {`{${key}}`}
                  </label>
                  <input
                    type="text"
                    value={templateParams[key]}
                    onChange={(e) =>
                      setTemplateParams({ ...templateParams, [key]: e.target.value })
                    }
                    placeholder={`Value for ${key}...`}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}

              <button
                onClick={handleResolveTemplate}
                disabled={isReading}
                className="mt-5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-all"
              >
                <span>Read Resource</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Content Header */}
        <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono font-medium text-slate-300 truncate max-w-md">
              {selectedUri || 'No Resource Selected'}
            </span>
            {readLatency !== null && (
              <div className="flex items-center space-x-1 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                <Clock className="h-3 w-3" />
                <span>{readLatency}ms</span>
              </div>
            )}
          </div>

          {content && (
            <button
              onClick={() => copyToClipboard(JSON.stringify(content, null, 2))}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors flex items-center space-x-1 text-xs"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>Copy</span>
            </button>
          )}
        </div>

        {/* Content Viewer */}
        <div className="flex-1 p-6 overflow-y-auto">
          {isReading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-500">
              <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono">Reading resource stream...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-mono text-rose-300">
              {error}
            </div>
          ) : content?.contents?.[0] ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-slate-500">MIME:</span>
                <span className="font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                  {content.contents[0].mimeType || 'text/plain'}
                </span>
              </div>
              <pre className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed selection:bg-indigo-500/30">
                {content.contents[0].text}
              </pre>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
              <FileText className="h-8 w-8 text-slate-700" />
              <p className="text-xs">Select a resource on the left to read its contents.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
