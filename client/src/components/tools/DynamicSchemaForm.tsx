import React, { useState, useEffect } from 'react';
import { ToolInputSchema } from '../../types';
import { Code, Sliders, AlertCircle, Check } from 'lucide-react';

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

  useEffect(() => {
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
      setJsonError(null);
      onChange(parsed);
    } catch (e: any) {
      setJsonError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('form')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              mode === 'form'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3 w-3" />
            <span>Form</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('raw')}
            className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              mode === 'raw'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="h-3 w-3" />
            <span>Raw JSON</span>
          </button>
        </div>

        {mode === 'raw' && (
          <div className="text-[11px] font-mono">
            {jsonError ? (
              <span className="text-rose-400 flex items-center space-x-1">
                <AlertCircle className="h-3 w-3" />
                <span>Invalid JSON</span>
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center space-x-1">
                <Check className="h-3 w-3" />
                <span>Valid JSON</span>
              </span>
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
            className="w-full bg-[#0a0f1d] border border-slate-800 rounded-xl p-3 text-xs font-mono text-indigo-200 focus:outline-none focus:border-indigo-500 selection:bg-indigo-500/20"
          />
          {jsonError && (
            <p className="text-[11px] font-mono text-rose-400">{jsonError}</p>
          )}
        </div>
      ) : propertyKeys.length === 0 ? (
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
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
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={fieldId}
                    className="text-xs font-medium text-slate-300 flex items-center space-x-1"
                  >
                    <span className="font-mono text-indigo-300">{key}</span>
                    {isRequired && (
                      <span aria-hidden="true" className="text-rose-400 font-bold">
                        *
                      </span>
                    )}
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    {prop.type || (prop.enum ? 'enum' : 'any')}
                  </span>
                </div>

                {prop.description && (
                  <p className="text-[11px] text-slate-400">{prop.description}</p>
                )}

                {/* Enums */}
                {prop.enum ? (
                  <select
                    id={fieldId}
                    value={val}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select an option...</option>
                    {prop.enum.map((opt: string) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : prop.type === 'boolean' ? (
                  <label className="flex items-center space-x-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      aria-label={key}
                      checked={Boolean(val)}
                      onChange={(e) => handleFieldChange(key, e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
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
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                ) : prop.type === 'object' || prop.type === 'array' ? (
                  <textarea
                    rows={3}
                    id={fieldId}
                    value={typeof val === 'object' ? JSON.stringify(val, null, 2) : val}
                    onChange={(e) => {
                      try {
                        handleFieldChange(key, JSON.parse(e.target.value));
                      } catch {
                        handleFieldChange(key, e.target.value);
                      }
                    }}
                    placeholder={`JSON representation for ${key}...`}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-indigo-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                ) : (
                  <input
                    type="text"
                    id={fieldId}
                    value={val}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder={`Enter ${key}...`}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading || (mode === 'raw' && Boolean(jsonError))}
          className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-xs py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center justify-center space-x-2"
        >
          <span>{isLoading ? 'Executing Tool...' : 'Run Tool (tools/call)'}</span>
        </button>
      </div>
    </div>
  );
};
