import { useCallback, useEffect, useState } from 'react';

import { apiFetch, type PresetRecord } from '../lib/api';
import { useAccount } from '../state/account-context';

type Props = {
  tool: string;
  params: Record<string, unknown>;
  onApply: (params: Record<string, unknown>) => void;
  disabled?: boolean;
};

/** Save/load named settings for a tool; hidden when the API is offline. */
export function PresetPicker({ tool, params, onApply, disabled = false }: Props) {
  const { status } = useAccount();
  const [presets, setPresets] = useState<PresetRecord[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ presets: PresetRecord[] }>(
        `/api/presets?tool=${encodeURIComponent(tool)}`,
      );
      setPresets(response.presets);
    } catch {
      // Offline: presets simply stay empty.
    }
  }, [tool]);

  useEffect(() => {
    setPresets([]);
    setName('');
    setError(null);
    void load();
  }, [load]);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/presets', {
        method: 'POST',
        body: { tool, name: trimmed, params },
      });
      setName('');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'บันทึกพรีเซ็ตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (preset: PresetRecord) => {
    setBusy(true);
    try {
      await apiFetch(`/api/presets/${preset.id}`, { method: 'DELETE' });
      setPresets((current) => current.filter((item) => item.id !== preset.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'ลบพรีเซ็ตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'offline') {
    return (
      <section className="preset-picker">
        <p className="hint">พรีเซ็ตใช้ไม่ได้ตอนนี้ — เชื่อมต่อ API ไม่ได้</p>
      </section>
    );
  }

  return (
    <section className="preset-picker" aria-label="พรีเซ็ต">
      <div className="control-row">
        <span className="field-label">พรีเซ็ตที่บันทึกไว้</span>
        <span className="panel-note">เก็บใน PostgreSQL</span>
      </div>

      {presets.length === 0 ? (
        <p className="hint">ยังไม่มีพรีเซ็ต — ตั้งค่าแล้วกดบันทึกเพื่อใช้ซ้ำ</p>
      ) : (
        <ul className="preset-list">
          {presets.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className="chip-button"
                onClick={() => onApply(preset.params)}
                disabled={disabled || busy}
                title="ใช้พรีเซ็ตนี้"
              >
                {preset.name}
              </button>
              <button
                type="button"
                className="preset-remove"
                aria-label={`ลบพรีเซ็ต ${preset.name}`}
                onClick={() => void remove(preset)}
                disabled={busy}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="preset-save">
        <input
          className="range-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ชื่อพรีเซ็ต เช่น เอกสารบริษัท"
          maxLength={80}
          disabled={disabled || busy}
          aria-label="ชื่อพรีเซ็ต"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void save();
            }
          }}
        />
        <button
          type="button"
          className="button-secondary"
          onClick={() => void save()}
          disabled={disabled || busy || name.trim() === ''}
        >
          บันทึก
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
