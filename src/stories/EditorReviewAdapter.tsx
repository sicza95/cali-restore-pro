import { EditorWorkspace } from '../ui/editor/editor-workspace/EditorWorkspace';
import type { EditorWorkspaceProps } from '../ui/editor/editor-workspace/types';

// Storybook owns the synthetic editor. Production routes render vault-backed project data.
export function EditorReviewAdapter(props: EditorWorkspaceProps) {
  return <EditorWorkspace {...props} />;
}
