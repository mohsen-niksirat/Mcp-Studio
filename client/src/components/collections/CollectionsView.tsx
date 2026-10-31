import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  ListChecks,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Wrench
} from 'lucide-react';
import { StepRunResult, TestStep, TestSuite, ToolItem } from '../../types';
import { api } from '../../lib/api';
import { Badge, Button, Card, CardBody, EmptyState } from '../ui/primitives';
import { cn } from '../../lib/cn';

interface CollectionsViewProps {
  tools: ToolItem[];
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({ tools }) => {
  const [suites, setSuites] = useState<TestSuite[]>(() => {
    const saved = localStorage.getItem('mcp_studio_test_suites');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return [
      {
        id: 'suite-sanity',
        name: 'Server Sanity & Diagnostics Suite',
        description: 'Verifies math operations, host specs, and mock data generation in sequence.',
        steps: [
          {
            id: 'step-1',
            toolName: 'math_calculator',
            args: { operation: 'multiply', a: 12, b: 12 },
            expectedSubstring: '144'
          },
          {
            id: 'step-2',
            toolName: 'system_monitor',
            args: { unit: 'GB' }
          },
          {
            id: 'step-3',
            toolName: 'generate_mock_users',
            args: { count: 3, role: 'developer' },
            expectedSubstring: 'developer'
          }
        ]
      }
    ];
  });

  const [selectedSuiteId, setSelectedSuiteId] = useState<string>(suites[0]?.id || '');
  const [isRunning, setIsRunning] = useState(false);
  const [activeStepRunning, setActiveStepRunning] = useState<string | null>(null);

  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepTool, setNewStepTool] = useState(tools[0]?.name || 'math_calculator');
  const [newStepArgs, setNewStepArgs] = useState('{}');
  const [newStepAssert, setNewStepAssert] = useState('');

  useEffect(() => {
    localStorage.setItem('mcp_studio_test_suites', JSON.stringify(suites));
  }, [suites]);

  const selectedSuite = suites.find((s) => s.id === selectedSuiteId) || suites[0];

  const handleCreateSuite = () => {
    const newSuite: TestSuite = {
      id: `suite-${Date.now()}`,
      name: `Custom Test Suite ${suites.length + 1}`,
      description: 'Automated sequential execution scenario',
      steps: []
    };
    setSuites([...suites, newSuite]);
    setSelectedSuiteId(newSuite.id);
  };

  const handleDeleteSuite = (id: string) => {
    if (suites.length <= 1) return;
    const remaining = suites.filter((s) => s.id !== id);
    setSuites(remaining);
    setSelectedSuiteId(remaining[0].id);
  };

  const handleAddStep = () => {
    if (!selectedSuite) return;
    let parsedArgs = {};
    try {
      parsedArgs = JSON.parse(newStepArgs);
    } catch {
      parsedArgs = {};
    }

    const newStep: TestStep = {
      id: `step-${Date.now()}`,
      toolName: newStepTool,
      args: parsedArgs,
      expectedSubstring: newStepAssert.trim() || undefined
    };

    setSuites(
      suites.map((s) =>
        s.id === selectedSuite.id ? { ...s, steps: [...s.steps, newStep] } : s
      )
    );
    setShowAddStep(false);
    setNewStepArgs('{}');
    setNewStepAssert('');
  };

  const handleDeleteStep = (stepId: string) => {
    if (!selectedSuite) return;
    setSuites(
      suites.map((s) =>
        s.id === selectedSuite.id
          ? { ...s, steps: s.steps.filter((st) => st.id !== stepId) }
          : s
      )
    );
  };

  const handleRunSuite = async () => {
    if (!selectedSuite || isRunning || selectedSuite.steps.length === 0) return;
    setIsRunning(true);
    const startTotal = Date.now();
    const results: StepRunResult[] = [];
    let allPassed = true;

    for (const step of selectedSuite.steps) {
      setActiveStepRunning(step.id);
      const start = Date.now();
      try {
        const res = await api.callTool(step.toolName, step.args);
        const latency =
          res.latencyMs !== undefined ? res.latencyMs : Date.now() - start;
        const outStr =
          res.content?.[0]?.text || JSON.stringify(res.structuredData || res);

        let passed = true;
        if (
          step.expectedSubstring &&
          !outStr.toLowerCase().includes(step.expectedSubstring.toLowerCase())
        ) {
          passed = false;
          allPassed = false;
        }

        results.push({
          stepId: step.id,
          toolName: step.toolName,
          success: passed,
          latencyMs: latency,
          output: outStr,
          error: !passed
            ? `Assertion failed: Output did not contain "${step.expectedSubstring}"`
            : undefined
        });
      } catch (err: any) {
        allPassed = false;
        results.push({
          stepId: step.id,
          toolName: step.toolName,
          success: false,
          latencyMs: Date.now() - start,
          error: err.message || 'Execution error'
        });
      }
    }

    const totalLatencyMs = Date.now() - startTotal;
    setActiveStepRunning(null);
    setIsRunning(false);

    setSuites(
      suites.map((s) =>
        s.id === selectedSuite.id
          ? {
              ...s,
              lastRun: {
                timestamp: Date.now(),
                passed: allPassed,
                totalLatencyMs,
                results
              }
            }
          : s
      )
    );
  };

  const handleExport = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(suites, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', 'mcp-studio-collections.json');
    dlAnchor.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          setSuites(imported);
          if (imported[0]?.id) setSelectedSuiteId(imported[0].id);
        }
      } catch {
        alert('Invalid JSON collection file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Suites list */}
      <div className="w-72 border-r border-surface-800 bg-surface-950 flex flex-col shrink-0">
        <div className="p-3 border-b border-surface-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <ListChecks className="h-4 w-4 text-brand-400" />
            <span>Suites ({suites.length})</span>
          </span>

          <div className="flex items-center gap-1">
            <label
              className="p-1.5 hover:bg-surface-800 rounded-md text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
              title="Import collection JSON"
            >
              <Upload className="h-3.5 w-3.5" />
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button
              onClick={handleExport}
              title="Export collections JSON"
              className="p-1.5 hover:bg-surface-800 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <Button size="icon" variant="primary" onClick={handleCreateSuite} title="Add new suite" className="h-7 w-7">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {suites.map((s) => {
            const isSelected = selectedSuite?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSuiteId(s.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-colors',
                  isSelected
                    ? 'bg-brand-600/15 text-brand-200'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-surface-900/60'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-xs truncate">{s.name}</span>
                  <Badge tone="neutral" className="font-mono text-[10px] shrink-0">
                    {s.steps.length} steps
                  </Badge>
                </div>
                {s.lastRun && (
                  <div className="flex items-center gap-1.5 text-[10px] font-mono mt-1.5">
                    {s.lastRun.passed ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Passed ({s.lastRun.totalLatencyMs}ms)</span>
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        <span>Failed</span>
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Suite details */}
      {selectedSuite && (
        <div className="flex-1 flex flex-col bg-surface-950 overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-800 bg-surface-900/40 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-slate-100 truncate">
                  {selectedSuite.name}
                </h2>
                {selectedSuite.lastRun && (
                  <Badge
                    tone={selectedSuite.lastRun.passed ? 'success' : 'danger'}
                    className="font-mono font-semibold"
                  >
                    {selectedSuite.lastRun.passed ? 'PASSED' : 'FAILED'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">
                {selectedSuite.description}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteSuite(selectedSuite.id)}
                disabled={suites.length <= 1}
                title="Delete suite"
                className="hover:text-rose-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>

              <Button
                variant="success"
                onClick={handleRunSuite}
                disabled={isRunning || selectedSuite.steps.length === 0}
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>Run Entire Suite</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-surface-800">
              <span className="section-label">
                Execution Steps ({selectedSuite.steps.length})
              </span>
              <Button size="sm" variant="secondary" onClick={() => setShowAddStep(true)}>
                <Plus className="h-3.5 w-3.5" />
                <span>Add Step</span>
              </Button>
            </div>

            {showAddStep && (
              <Card className="border-brand-500/30">
                <CardBody className="space-y-3 text-xs">
                  <div className="font-medium text-slate-200">
                    Configure New Test Step
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="step-tool" className="block text-slate-400 mb-1">
                        Target MCP Tool
                      </label>
                      <select
                        id="step-tool"
                        value={newStepTool}
                        onChange={(e) => setNewStepTool(e.target.value)}
                        className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                      >
                        {tools.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="step-assert" className="block text-slate-400 mb-1">
                        Expected Substring Assertion (Optional)
                      </label>
                      <input
                        id="step-assert"
                        type="text"
                        placeholder='e.g. "result" or "true"'
                        value={newStepAssert}
                        onChange={(e) => setNewStepAssert(e.target.value)}
                        className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="step-args" className="block text-slate-400 mb-1">
                      Arguments JSON
                    </label>
                    <textarea
                      id="step-args"
                      rows={2}
                      value={newStepArgs}
                      onChange={(e) => setNewStepArgs(e.target.value)}
                      placeholder='{"operation": "add", "a": 5, "b": 10}'
                      className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60 resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => setShowAddStep(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" onClick={handleAddStep}>
                      Save Step
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}

            {selectedSuite.steps.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="No steps yet"
                description='Click "Add Step" to add tool invocations to this scenario.'
              />
            ) : (
              selectedSuite.steps.map((st, idx) => {
                const stepResult = selectedSuite.lastRun?.results.find(
                  (r) => r.stepId === st.id
                );
                const isStepActive = activeStepRunning === st.id;

                return (
                  <div
                    key={st.id}
                    className={cn(
                      'p-4 rounded-lg border transition-colors',
                      isStepActive
                        ? 'bg-brand-950/20 border-brand-500/50'
                        : stepResult
                        ? stepResult.success
                          ? 'bg-surface-900/40 border-surface-800'
                          : 'bg-rose-950/10 border-rose-500/25'
                        : 'bg-surface-900/40 border-surface-800'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs font-semibold text-slate-500">
                          #{idx + 1}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <Wrench className="h-4 w-4 text-brand-400 shrink-0" />
                          <span className="font-mono text-xs font-semibold text-brand-300 truncate">
                            {st.toolName}
                          </span>
                        </div>
                        {st.expectedSubstring && (
                          <Badge tone="neutral" className="font-mono text-[10px] shrink-0">
                            asserts: "{st.expectedSubstring}"
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isStepActive && (
                          <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Running</span>
                          </span>
                        )}

                        {stepResult && !isStepActive && (
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-emerald-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {stepResult.latencyMs}ms
                            </span>
                            {stepResult.success ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-rose-400" />
                            )}
                          </div>
                        )}

                        <button
                          onClick={() => handleDeleteStep(st.id)}
                          className="text-slate-600 hover:text-rose-400 p-1 rounded-md transition-colors"
                          title="Delete step"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] font-mono text-slate-400 bg-surface-950/60 p-2 rounded-md overflow-x-auto">
                      {JSON.stringify(st.args)}
                    </div>

                    {stepResult?.error && (
                      <div className="mt-2 text-xs font-mono text-rose-400 bg-rose-950/10 p-2.5 rounded-md border border-rose-500/20">
                        {stepResult.error}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
