import { useId } from 'react';

import type { OutputName } from '../hooks/useOutputName';
import { MAX_OUTPUT_NAME_LENGTH } from '../lib/output-name';

type Props = {
  name: OutputName;
  disabled?: boolean;
  label?: string;
};

/**
 * One editable file name with a fixed extension and a live preview. The base
 * name is sanitised on blur; an empty field falls back to the suggested name.
 */
export function OutputNameField({ name, disabled = false, label = 'ชื่อไฟล์ผลลัพธ์' }: Props) {
  const inputId = useId();
  const previewId = `${inputId}-preview`;

  return (
    <div className="output-name">
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="output-name-row">
        <input
          id={inputId}
          className="output-name-input"
          value={name.value}
          onChange={(event) => name.setValue(event.target.value)}
          onBlur={name.commit}
          disabled={disabled}
          maxLength={MAX_OUTPUT_NAME_LENGTH + 8}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={previewId}
        />
        <span className="output-name-ext" aria-hidden="true">
          .{name.extension}
        </span>
        <button
          type="button"
          className="button-ghost output-name-reset"
          onClick={name.reset}
          disabled={disabled || !name.dirty}
          title="ใช้ชื่อที่ระบบแนะนำ"
        >
          ค่าเริ่มต้น
        </button>
      </div>
      <p className="output-name-preview" id={previewId}>
        จะบันทึกเป็น <code>{name.resolved}</code>
      </p>
    </div>
  );
}
