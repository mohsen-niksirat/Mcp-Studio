import React, { useState } from 'react';
import {
  ArrowRight,
  Clock,
  Copy,
  Check,
  FileCode,
  FileText,
  FolderArchive,
  Layers,
  Search
} from 'lucide-react';
import { ResourceItem, ResourceTemplateItem } from '../../types';
import { api } from '../../lib/api';
import { Badge, Button, Card, CardBody, EmptyState, Spinner } from '../ui/primitives';
import { cn } from '../../lib/cn';

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
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Spinner />
          <span className="text-xs font-mono">Loading resources...</span>
        </div>
      </div>
    );
  }

  const filteredResources = resources.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.uri.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
      {/* Resource list */}
      <div className="w-full lg:w-72 max-h-56 lg:max-h-none border-b lg:border-b-0 lg:border-r border-surface-800 bg-surface-950 flex flex-col shrink-0">
        <div className="p-3 border-b border-surface-800">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search resources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search resources"
              className="w-full bg-surface-900 border border-surface-800 rounded-md pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          <div>
            <div className="px-2 py-1 section-label">
              Resources ({filteredResources.length})
            </div>
            <div className="space-y-1 mt-1">
              {filteredResources.map((r) => {
                const isSelected = selectedUri === r.uri && !selectedTemplate;
                return (
                  <button
                    key={r.uri}
                    onClick={() => handleSelectResource(r)}
                    className={cn(
                      'w-full text-left p-2.5 rounded-lg transition-colors',
                      isSelected
                        ? 'bg-brand-600/15 text-brand-200'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-surface-900/60'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FileCode
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          isSelected ? 'text-brand-400' : 'text-slate-400'
                        )}
                      />
                      <span className="text-xs font-medium truncate">
                        {r.name}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate mt-1 pl-5">
                      {r.uri}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {templates.length > 0 && (
            <div>
              <div className="px-2 py-1 section-label">
                Templates ({templates.length})
              </div>
              <div className="space-y-1 mt-1">
                {templates.map((tmpl) => {
                  const isSelected =
                    selectedTemplate?.uriTemplate === tmpl.uriTemplate;
                  return (
                    <button
                      key={tmpl.uriTemplate}
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={cn(
                        'w-full text-left p-2.5 rounded-lg transition-colors',
                        isSelected
                          ? 'bg-brand-600/15 text-brand-200'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-surface-900/60'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Layers
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            isSelected ? 'text-brand-400' : 'text-slate-400'
                          )}
                        />
                        <span className="text-xs font-medium truncate">
                          {tmpl.name}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate mt-1 pl-5">
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

      {/* Preview */}
      <div className="flex-1 flex flex-col bg-surface-950 overflow-hidden">
        {selectedTemplate && (
          <div className="p-4 bg-surface-900/40 border-b border-surface-800 space-y-3">
            <div>
              <span className="text-xs font-semibold text-brand-300">
                {selectedTemplate.name}
              </span>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                {selectedTemplate.uriTemplate}
              </p>
            </div>

            <div className="flex items-end gap-3">
              {Object.keys(templateParams).map((key) => (
                <div key={key} className="flex-1">
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    {`{${key}}`}
                  </label>
                  <input
                    type="text"
                    value={templateParams[key]}
                    onChange={(e) =>
                      setTemplateParams({
                        ...templateParams,
                        [key]: e.target.value
                      })
                    }
                    placeholder={`Value for ${key}...`}
                    className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                  />
                </div>
              ))}

              <Button
                size="sm"
                variant="primary"
                onClick={handleResolveTemplate}
                disabled={isReading}
                className="shrink-0"
              >
                <span>Read</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-b border-surface-800 flex items-center justify-between bg-surface-900/40">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono text-slate-300 truncate max-w-md">
              {selectedUri || 'No resource selected'}
            </span>
            {readLatency !== null && (
              <Badge tone="success" className="font-mono text-[11px]">
                <Clock className="h-3 w-3" />
                {readLatency}ms
              </Badge>
            )}
          </div>

          {content && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                copyToClipboard(JSON.stringify(content, null, 2))
              }
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>

        <div className="flex-1 p-5 overflow-y-auto">
          {isReading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
              <Spinner />
              <span className="text-xs font-mono">Reading resource...</span>
            </div>
          ) : error ? (
            <Card className="border-rose-500/25 bg-rose-950/10">
              <CardBody>
                <pre className="text-xs font-mono text-rose-300 whitespace-pre-wrap">
                  {error}
                </pre>
              </CardBody>
            </Card>
          ) : content?.contents?.[0] ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">MIME:</span>
                <Badge tone="brand" className="font-mono text-[10px]">
                  {content.contents[0].mimeType || 'text/plain'}
                </Badge>
              </div>
              <pre className="code-block whitespace-pre-wrap">
                {content.contents[0].text}
              </pre>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="Select a resource"
              description="Pick a resource or template on the left to inspect its contents."
            />
          )}
        </div>
      </div>
    </div>
  );
};
