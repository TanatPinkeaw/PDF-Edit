import type { ToolDefinition } from '../lib/tools';
import { ToolIcon } from './ToolIcon';

type Props = {
  tool: ToolDefinition;
};

export function ToolCard({ tool }: Props) {
  const isReady = tool.status === 'ready';

  const body = (
    <>
      <span className="tool-card-icon" data-icon={tool.icon}>
        <ToolIcon name={tool.icon} />
      </span>
      <h3>
        {tool.title}
        {tool.badge && <span className="tool-badge">{tool.badge}</span>}
        {!isReady && <span className="tool-badge soon">เร็ว ๆ นี้</span>}
      </h3>
      <p>{tool.description}</p>
    </>
  );

  if (isReady && tool.href) {
    return (
      <a className="tool-card" href={tool.href} data-ready="true">
        {body}
      </a>
    );
  }

  return (
    <div className="tool-card" data-ready="false" aria-disabled="true">
      {body}
    </div>
  );
}
