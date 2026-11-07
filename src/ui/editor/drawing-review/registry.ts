import type { ControlContract } from '../../control-registry/types';
import { control, drawingTools } from './constants';
import type { DrawingCopy } from './copy';

type Label = keyof DrawingCopy;
type Control = readonly [key: string, label: Label, command: string];

function register(
  owner: ControlContract['owner'],
  prerequisite: string,
  valueSource: string,
  helpKey: Label,
  failure: string,
  entries: readonly Control[],
): ControlContract[] {
  return entries.map(([key, labelKey, command]) => ({
    id: control(key),
    labelKey,
    helpKey,
    command,
    permission: 'Authorized local project surface and unlocked account vault',
    prerequisite,
    valueSource,
    behavior: 'review',
    owner,
    composition: 'Authorized surface drawing review adapter',
    unavailable: {
      failure,
      empty:
        'Keep mode and rail discoverable. Omit data-dependent inspectors without a supported mapping reference.',
      locked: 'Unmount workspace and clear review state',
    },
  }));
}

export const drawingControls: readonly ControlContract[] = [
  ...register(
    'M-14',
    'Open an authorized surface',
    'Local workspace mode',
    'transient',
    'Keep photo review available and explain missing mapping reference in drawing mode',
    [
      ['mode.photo', 'photoMode', 'Open photo preparation and calibration review'],
      ['mode.drawing', 'drawingMode', 'Open temporary drawing review on the mapping reference'],
    ],
  ),
  ...register(
    'M-14',
    'Supported mapping reference and applicable mask/tool',
    'Selected review tool',
    'blocked',
    'Explain missing preview, hidden or locked mask, or missing committed marks',
    drawingTools.map(({ id }) => ['tool.' + id, id, 'Select ' + id + ' review tool']),
  ),
  ...register(
    'M-14',
    'Supported mapping reference',
    'In-memory viewport options',
    'unavailable',
    'Show a canvas placeholder and hide view fields when there is no decoded reference',
    [
      ['view.original', 'original', 'Toggle mask overlays and drawing availability'],
      ['view.canvas', 'reference', 'Receive preview pan, stroke and point placement input'],
      ['view.zoom', 'zoom', 'Set local reference zoom'],
      ['view.fit', 'fit', 'Reset drawing viewport zoom and pan'],
    ],
  ),
  ...register(
    'M-14',
    'Brush, master or eraser with an editable mask',
    'In-memory brush options',
    'blocked',
    'Disable drawing for hidden, locked or non-mask layers. Hide strength until enabled.',
    [
      ['brush.width', 'width', 'Set brush or eraser width relative to the reference'],
      ['brush.pressure', 'pressure', 'Toggle pressure-sensitive review strokes'],
      ['brush.stabilize', 'stabilize', 'Toggle review stroke smoothing'],
      ['brush.strength', 'strength', 'Set smoothing amount'],
      ['brush.outline', 'brushOutline', 'Toggle brush cursor outline'],
      ['brush.finger', 'finger', 'Opt into single-touch marking'],
      ['brush.dot', 'addStroke', 'Finish a single-point stroke at entered coordinates'],
    ],
  ),
  ...register(
    'M-14',
    'Active marking tool and an editable mask',
    'In-memory sketch and selected points',
    'noSketch',
    'Hide inapplicable fields and disable apply until enough valid points exist',
    [
      ['place.x', 'x', 'Set next point horizontal coordinate'],
      ['place.y', 'y', 'Set next point vertical coordinate'],
      ['shape.kind', 'shape', 'Choose rectangle, ellipse or polygon'],
      ['path.operation', 'operation', 'Choose additive, subtractive or replacement overlay'],
      ['point.mark', 'mark', 'Select a committed mark on the active mask for editing'],
      ['point.select', 'point', 'Select an editable node'],
      ['point.add', 'addPoint', 'Insert a point at the entered coordinates'],
      ['point.delete', 'deletePoint', 'Remove selected point within mark limits'],
      ['point.x', 'x', 'Move selected point horizontally'],
      ['point.y', 'y', 'Move selected point vertically'],
      ['point.curve', 'curve', 'Toggle an outgoing quadratic handle'],
      ['point.handleX', 'handleX', 'Move selected handle horizontally'],
      ['point.handleY', 'handleY', 'Move selected handle vertically'],
      ['path.close', 'closePath', 'Open or close the boundary'],
      ['path.apply', 'apply', 'Apply valid sketch or point edit in review'],
      ['path.cancel', 'cancel', 'Clear unapplied sketch or point edit'],
    ],
  ),
  ...register(
    'M-14',
    'Supported reference and applicable layer type',
    'In-memory layer tree and mask styling',
    'removeHelp',
    'Protect master mask, nonempty folders and masks with unresolved drafts',
    [
      ['layer.select', 'layers', 'Select a review layer without changing visibility'],
      ['layer.visibility', 'visibility', 'Toggle mask overlay visibility without selecting it'],
      ['layer.expand', 'expand', 'Expand or collapse a review folder'],
      ['layer.kind', 'kind', 'Choose a damage mask, work phase mask or folder'],
      ['layer.add', 'addLayer', 'Add a review layer'],
      ['layer.properties', 'properties', 'Show selected layer properties'],
      ['layer.name', 'name', 'Enter layer name'],
      ['layer.rename', 'rename', 'Apply the layer name in review'],
      ['layer.parent', 'parent', 'Move layer into an eligible folder or to the root'],
      ['layer.locked', 'locked', 'Protect a mask from mark changes'],
      ['layer.opacity', 'opacity', 'Change overlay opacity'],
      ['layer.color', 'color', 'Change overlay color'],
      ['layer.fill', 'fill', 'Change overlay fill or hatch'],
      ['layer.outline', 'outline', 'Toggle overlay outline'],
      ['layer.clone', 'clone', 'Copy committed mask marks into an independent review mask'],
      ['layer.up', 'up', 'Raise selected layer among siblings'],
      ['layer.down', 'down', 'Lower selected layer among siblings'],
      ['layer.remove', 'remove', 'Remove eligible review layer'],
    ],
  ),
  ...register(
    'M-14',
    'Supported reference and eligible draft or history entry',
    'Layer-owned drafts and bounded review history',
    'resolveHelp',
    'Show available history and affected layer; require resolution before editing points',
    [
      ['history.mode', 'modeLabel', 'Set per-stroke or manual commit mode without flushing drafts'],
      ['history.commit', 'commit', 'Commit the selected layer’s draft as one review step'],
      ['history.discard', 'discard', 'Drop selected layer’s pending and undone marks'],
      ['history.undo', 'undo', 'Undo pending mark first or undo last review commit'],
      ['history.redo', 'redo', 'Restore an undone draft mark or review commit'],
      ['resolve.commit', 'commit', 'Commit selected layer’s draft before entering point edit'],
      ['resolve.discard', 'discard', 'Discard selected layer’s draft before entering point edit'],
      ['resolve.cancel', 'cancel', 'Keep selected layer’s draft and remain in current tool'],
    ],
  ),
];
