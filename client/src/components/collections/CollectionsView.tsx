import React, { useState, useEffect } from 'react';
import {
  ListChecks,
  Play,
  Plus,
  Trash2,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wrench,
  FileCode,
  Check,
  RefreshCw
} from 'lucide-react';
import { ToolItem, TestSuite, TestStep, StepRunResult } from '../../types';
import { api } from '../../lib/api';

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
    // Default initial test suite
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

  // New Step modal / form inline
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

    const updated = suites.map((s) => {
      if (s.id === selectedSuite.id) {
        return { ...s, steps: [...s.steps, newStep] };
      }
      return s;
    });

    setSuites(updated);
    setShowAddStep(false);
    setNewStepArgs('{}');
    setNewStepAssert('');
  };

  const handleDeleteStep = (stepId: string) => {
    if (!selectedSuite) return;
    const updated = suites.map((s) => {
      if (s.id === selectedSuite.id) {
        return { ...s, steps: s.steps.filter((st) => st.id !== stepId) };
      }
      return s;
    });
    setSuites(updated);
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
        const latency = res.latencyMs !== undefined ? res.latencyMs : Date.now() - start;
        const outStr = res.content?.[0]?.text || JSON.stringify(res.structuredData || res);

        let passed = true;
        if (step.expectedSubstring && !outStr.toLowerCase().includes(step.expectedSubstring.toLowerCase())) {
          passed = false;
          allPassed = false;
        }

        results.push({
          stepId: step.id,
          toolName: step.toolName,
          success: passed,
          latencyMs: latency,
          output: outStr,
          error: !passed ? `Assertion failed: Output did not contain "${step.expectedSubstring}"` : undefined
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

    // Update suite lastRun
    const updated = suites.map((s) => {
      if (s.id === selectedSuite.id) {
        return {
          ...s,
          lastRun: {
            timestamp: Date.now(),
            passed: allPassed,
            totalLatencyMs,
            results
          }
        };
      }
      return s;
    });
    setSuites(updated);
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(suites, null, 2));
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
      } catch (err) {
        alert('Invalid JSON collection file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Column: Suites List */}
      <div className="w-80 border-r border-slate-800 bg-[#0c1222] flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
            <ListChecks className="h-4 w-4 text-indigo-400" />
            <span>Test Suites ({suites.length})</span>
          </span>

          <div className="flex items-center space-x-1">
            <label className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer" title="Import Collection JSON">
              <Upload className="h-3.5 w-3.5" />
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button
              onClick={handleExport}
              title="Export Collections JSON"
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleCreateSuite}
              title="Add New Suite"
              className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {suites.map((s) => {
            const isSelected = selectedSuite?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSuiteId(s.id)}
                className={`w-full text-left p-3 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-200'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs truncate max-w-[170px]">{s.name}</span>
                  <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                    {s.steps.length} steps
                  </span>
                </div>
                {s.lastRun && (
                  <div className="flex items-center space-x-1.5 text-[10px] font-mono mt-1.5">
                    {s.lastRun.passed ? (
                      <span className="text-emerald-400 flex items-center space-x-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Passed ({s.lastRun.totalLatencyMs}ms)</span>
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center space-x-1">
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

      {/* Right Column: Suite Details & Runner */}
      {selectedSuite && (
        <div className="flex-1 flex flex-col bg-[#0b0f19] overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-slate-800 bg-[#0d1424] flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-base font-bold text-slate-100">{selectedSuite.name}</h2>
                {selectedSuite.lastRun && (
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      selectedSuite.lastRun.passed
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {selectedSuite.lastRun.passed ? 'PASSED' : 'FAILED'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">{selectedSuite.description}</p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleDeleteSuite(selectedSuite.id)}
                disabled={suites.length <= 1}
                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-30"
                title="Delete Suite"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <button
                onClick={handleRunSuite}
                disabled={isRunning || selectedSuite.steps.length === 0}
                className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Executing Suite...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>Run Entire Suite</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Steps List */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Execution Steps ({selectedSuite.steps.length})
              </span>
              <button
                onClick={() => setShowAddStep(true)}
                className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Step</span>
              </button>
            </div>

            {/* Add Step Inline Form */}
            {showAddStep && (
              <div className="p-4 bg-slate-900 border border-indigo-500/30 rounded-2xl space-y-3 animate-fade-in text-xs">
                <div className="font-semibold text-slate-200">Configure New Test Step</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Target MCP Tool</label>
                    <select
                      value={newStepTool}
                      onChange={(e) => setNewStepTool(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      {tools.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">
                      Expected Substring Assertion (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder='e.g. "result" or "true"'
                      value={newStepAssert}
                      onChange={(e) => setNewStepAssert(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Arguments JSON</label>
                  <textarea
                    rows={2}
                    value={newStepArgs}
                    onChange={(e) => setNewStepArgs(e.target.value)}
                    placeholder='{"operation": "add", "a": 5, "b": 10}'
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-indigo-200 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    onClick={() => setShowAddStep(false)}
                    className="px-3 py-1.5 text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddStep}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl"
                  >
                    Save Step
                  </button>
                </div>
              </div>
            )}

            {/* Steps Feed */}
            {selectedSuite.steps.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500 font-mono">
                No steps added yet. Click "+ Add Step" above to add tools to this scenario.
              </div>
            ) : (
              selectedSuite.steps.map((st, idx) => {
                const stepResult = selectedSuite.lastRun?.results.find((r) => r.stepId === st.id);
                const isStepActive = activeStepRunning === st.id;

                return (
                  <div
                    key={st.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isStepActive
                        ? 'bg-indigo-950/20 border-indigo-500 shadow-md animate-pulse'
                        : stepResult
                        ? stepResult.success
                          ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                          : 'bg-rose-950/10 border-rose-500/30'
                        : 'bg-slate-900/40 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-xs font-bold text-slate-500">#{idx + 1}</span>
                        <div className="flex items-center space-x-2">
                          <Wrench className="h-4 w-4 text-indigo-400" />
                          <span className="font-mono text-xs font-bold text-indigo-300">
                            {st.toolName}
                          </span>
                        </div>
                        {st.expectedSubstring && (
                          <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                            asserts: "{st.expectedSubstring}"
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-3">
                        {isStepActive && (
                          <span className="text-xs font-mono text-amber-400 flex items-center space-x-1">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Running</span>
                          </span>
                        )}

                        {stepResult && !isStepActive && (
                          <div className="flex items-center space-x-2 text-xs font-mono">
                            <span className="text-emerald-400">{stepResult.latencyMs}ms</span>
                            {stepResult.success ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-rose-400" />
                            )}
                          </div>
                        )}

                        <button
                          onClick={() => handleDeleteStep(st.id)}
                          className="text-slate-600 hover:text-rose-400 p-1 rounded-lg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] font-mono text-slate-400 bg-slate-950/50 p-2 rounded-xl overflow-x-auto">
                      {JSON.stringify(st.args)}
                    </div>

                    {stepResult?.error && (
                      <div className="mt-2 text-xs font-mono text-rose-400 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
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
