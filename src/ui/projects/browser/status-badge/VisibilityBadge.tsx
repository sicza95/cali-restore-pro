import { CompositeIcon } from '../../../composite-icon/CompositeIcon';
import type { ProjectVisibility } from '../../../../platform/projects/browser-contracts';
import type { Language } from '../../../../platform/i18n/language';
import { itemActionCopy } from '../item-actions/copy';
import './styles.css';

export function VisibilityBadge(props: { visibility: ProjectVisibility; language: Language }) {
  const label = () => itemActionCopy[props.language][props.visibility];
  return (
    <span class="browser-visibility" data-visibility={props.visibility} title={label()}>
      <CompositeIcon
        base="organisation"
        supplement={props.visibility === 'listed' ? 'globe' : 'lock'}
        size={20}
      />
      <span class="browser-sr-only">{label()}</span>
    </span>
  );
}
