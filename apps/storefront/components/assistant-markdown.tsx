import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
};

export function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="shopping-assistant-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
