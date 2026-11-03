import React, { useState, useEffect, useRef } from 'react';
import { ToolInputSchema } from '../../types';
import { Code, Sliders, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/primitives';

interface DynamicSchemaFormProps {
  schema: ToolInputSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export const DynamicSchemaForm: React.FC<DynamicSchemaFormProps> = ({
  schema,
  values,
  onChange,
  onSubmit,
  isLoading
}) => {
  const [mode, setMode] = useState<'form' | 'raw'>('form');
  const [rawJson, setRawJson] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  // Set while a raw-editor keystroke is propagating up through `values`, so
  // the effect below does not rewrite the textarea under the caret.
  const skipRawSyncRef = useRef(false);

  useEffect(() => {
    if (skipRawSyncRef.current) {
      skipRawSyncRef.current = false;
      return;
    }
    setRawJson(JSON.stringify(values, null, 2));
  }, [values]);

  const properties = schema.properties || {};
  const requiredList = Array.isArray(schema.required) ? schema.required : [];
  const propertyKeys = Object.keys(properties);

  const handleFieldChange = (key: string, val: any) => {
    onChange({
      ...values,
      [key]: val
    });
  };

  const handleRawJsonChange = (text: string) => {
    setRawJson(text);
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('JSON must be an object');
        return;
      }
      setJsonError(null);
      skipRawSyncRef.current = true;
      onChange(parsed);
    } catch (e: any) {
      setJsonError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div className="flex items-center justify-between pb-3 border-b border-surface-800">
        <div className="flex items-center bg-surface-900 border border-surface-800 rounded-md p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setMode('form')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              mode === 'form'
                ? 'bg-surface-800 text-slate-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3 w-3" />
            <span>Form</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('raw')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              mode === 'raw'
                ? 'bg-surface-800 text-slate-200'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="h-3 w-3" />
            <span>Raw JSON</span>
          </button>
        </div>

        {mode === 'raw' && (
          <div className="text-[11px] font-mono flex items-center gap-1">
            {jsonError ? (
              <>
                <AlertCircle className="h-3 w-3 text-rose-400" />
                <span className="text-rose-400">Invalid JSON</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Valid</span>
              </>
            )}
          </div>
        )}
      </div>

      {mode === 'raw' ? (
        <div className="space-y-2">
          <textarea
            rows={10}
            value={rawJson}
            onChange={(e) => handleRawJsonChange(e.target.value)}
            className="w-full bg-surface-900 border border-surface-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60 resize-none"
          />
          {jsonError && (
            <p className="text-[11px] font-mono text-rose-400">{jsonError}</p>
          )}
        </div>
      ) : propertyKeys.length === 0 ? (
        <div className="p-4 bg-surface-900/40 border border-surface-800 rounded-lg text-center text-xs text-slate-400">
          This tool does not take any input parameters.
        </div>
      ) : (
        <div className="space-y-4">
          {propertyKeys.map((key) => {
            const prop = properties[key];
            const isRequired = requiredList.includes(key);
            const val = values[key] !== undefined ? values[key] : '';
            const fieldId = `schema-field-${key}`;

            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={fieldId}
                    className="text-xs font-medium text-slate-300 flex items-center gap-1"
                  >
                    <span className="font-mono text-brand-300">{key}</span>
                    {isRequired && (
                      <span aria-hidden="true" className="text-rose-400 font-bold">
                        *
                      </span>
                    )}
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    {prop.type || (prop.enum ? 'enum' : 'any')}
                  </span>
                </div>

                {prop.description && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {prop.description}
                  </p>
                )}

                {prop.enum ? (
                  <select
                    id={fieldId}
                    value={val}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                  >
                    <option value="">Select an option...</option>
                    {prop.enum.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : prop.type === 'boolean' ? (
                  <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      aria-label={key}
                      checked={Boolean(val)}
                      onChange={(e) => handleFieldChange(key, e.target.checked)}
                      className="rounded bg-surface-900 border-surface-700 text-brand-600 focus:ring-brand-500/40 focus:ring-offset-0"
                    />
                    <span className="text-xs text-slate-300">
                      {val ? 'Enabled (true)' : 'Disabled (false)'}
                    </span>
                  </label>
                ) : prop.type === 'number' || prop.type === 'integer' ? (
                  <input
                    type="number"
                    id={fieldId}
                    value={val}
                    onChange={(e) =>
                      handleFieldChange(
                        key,
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    placeholder={`Enter ${key}...`}
                    className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                  />
                ) : prop.type === 'object' || prop.type === 'array' ? (
                  <textarea
                    rows={3}
                    id={fieldId}
                    value={
                      typeof val === 'object' ? JSON.stringify(val, null, 2) : val
                    }
                    onChange={(e) => {
                      try {
                        handleFieldChange(key, JSON.parse(e.target.value));
                      } catch {
                        handleFieldChange(key, e.target.value);
                      }
                    }}
                    placeholder={`JSON representation for ${key}...`}
                    className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60 resize-none"
                  />
                ) : (
                  <input
                    type="text"
                    id={fieldId}
                    value={val}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder={`Enter ${key}...`}
                    className="w-full bg-surface-900 border border-surface-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/60"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full justify-center"
        onClick={onSubmit}
        disabled={isLoading || (mode === 'raw' && Boolean(jsonError))}
      >
        {isLoading ? 'Executing Tool...' : 'Run Tool (tools/call)'}
      </Button>
    </div>
  );
};
