import { registerPlatformControls } from '../../account-access/register-platform-controls';

/** Part of the application inventory; the project workspace connects durable operations. */
export const browserControls = registerPlatformControls(
  {
    composition: 'Project browser presentation',
    owner: 'M-05',
    permission: 'Caller supplies authorised descriptors and disabled reasons',
    valueSource: 'Injected descriptors, selection, query, view and callbacks',
    behavior: 'functional',
    helpKey: 'queryHelp',
    unavailable: {
      failure: 'Keep current items; show injected diagnostics or operation error.',
      empty: 'Show the relevant New, Clear filter or Retry action.',
      locked:
        'Caller must not supply inaccessible content; directory entries expose names and owners only.',
    },
  },
  [
    ['browser.new', 'newItem', 'Request a new-name dialog', 'Creation allowed at current level'],
    ['browser.import', 'importBackup', 'Request backup import', 'Root and backup import callback'],
    ['browser.rename', 'rename', 'Request rename', 'Editable selection; no disabled reason'],
    [
      'browser.delete',
      'delete',
      'Request deletion confirmation',
      'Editable selection; no disabled reason',
    ],
    ['browser.view.grid', 'grid', 'Request grid view', 'Browser visible'],
    ['browser.view.list', 'list', 'Request list view', 'Browser visible'],
    ['browser.sort', 'sort', 'Open sort menu', 'Browser visible'],
    ['browser.sort.name', 'name', 'Sort by name', 'Sort menu open'],
    ['browser.sort.created', 'created', 'Sort by creation date', 'Sort menu open'],
    ['browser.sort.modified', 'modified', 'Sort by modification date', 'Sort menu open'],
    ['browser.sort.asc', 'asc', 'Sort ascending', 'Sort menu open'],
    ['browser.sort.desc', 'desc', 'Sort descending', 'Sort menu open'],
    ['browser.find', 'find', 'Toggle Find row', 'Browser visible'],
    ['browser.query', 'queryLabel', 'Supply query text', 'Find row open'],
    ['browser.query.clear', 'clear', 'Clear query', 'Find row open'],
    ['browser.query.help', 'help', 'Open search syntax help', 'Find row open'],
    ['browser.settings', 'projectSettings', 'Request scoped settings', 'Scope allows settings'],
    ['browser.actions.overflow', 'more', 'Open overflow actions', 'Browser visible'],
    ['browser.inspector', 'inspector', 'Toggle inspector', 'Browser visible'],
    ['browser.inspector.close', 'close', 'Close inspector', 'Inspector open'],
    ['browser.empty.new', 'newItem', 'Request new item', 'Empty level and creation allowed'],
    ['browser.empty.clear', 'clear', 'Clear filter', 'No matches'],
    ['browser.empty.retry', 'retry', 'Retry online listing', 'Remote listing unavailable'],
    ['browser.dialog.name', 'name', 'Edit a name', 'New or rename dialog open'],
    [
      'browser.dialog.confirm',
      'save',
      'Confirm injected operation',
      'Valid name or deletion allowed; not busy',
    ],
    ['browser.dialog.cancel', 'cancel', 'Cancel operation', 'Dialog open'],
    ['browser.dialog.close', 'close', 'Close dialog', 'Dialog open'],
  ],
);
