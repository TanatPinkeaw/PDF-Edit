import type { ReactNode } from 'react';

import { hrefFor } from '../lib/router';

type Props = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function ToolPage({ title, description, actions, children }: Props) {
  return (
    <div className="tool-page">
      <header className="tool-page-head">
        <div>
          <a className="back-link" href={hrefFor('/')}>
            ← เครื่องมือทั้งหมด
          </a>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions && <div className="tool-page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
