import { createSignal, onMount, Show, untrack } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { ProfileFields } from '../account/profile-fields/ProfileFields';
import { SecurityItems } from '../account/account-security/AccountSecurity';
import { AccountDeletion } from './profile/AccountDeletion';
import { PreferenceSections } from './preferences/PreferenceSections';
import { SettingsItem, SettingsSection } from './SettingsItem';
import { settingsCopy } from './settings-copy';
import { Icon } from '../icon/Icon';
import './settings-page.css';

/** Where each settings address opens the page. */
const anchors = { profile: 'profile', security: 'security', preferences: 'appearance' } as const;

/**
 * One Settings page: Profile, Security, Appearance, Restoration defaults, Report branding and
 * Optional diagnostics. Each section lists its settings as rows that open in place.
 */
export function SettingsPage(props: { destination: keyof typeof anchors }) {
  const app = useApp();
  const c = () => settingsCopy[app.lang()];
  onMount(() => {
    const anchor = anchors[untrack(() => props.destination)];
    if (anchor !== 'profile') document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  });
  return (
    <div class="settings-page">
      <SettingsSection id="profile" title={app.t('profileTab')} help={app.t('profileSectionHelp')}>
        <ProfileItems />
        <SettingsItem
          id="delete-account"
          icon="trash"
          group="profile"
          title={c().deletion}
          control="settings.item.delete-account"
        >
          <AccountDeletion path="/account" />
        </SettingsItem>
      </SettingsSection>
      <SettingsSection
        id="security"
        title={app.t('securityTab')}
        help={app.t('securitySectionHelp')}
      >
        <SecurityItems />
      </SettingsSection>
      <PreferenceSections />
    </div>
  );
}

/** Name and photo, each saved on its own. */
function ProfileItems() {
  const app = useApp();
  const [photo, setPhoto] = createSignal<string>();
  const save = async (name: string, change?: string) => {
    const saved = await app.run(
      'profile',
      { name, ...(change === undefined ? {} : { photo: change }) },
      'profileSaved',
    );
    if (saved) setPhoto(undefined);
  };
  return (
    // Keyed by the account, so a saved photo replaces the preview.
    <Show when={app.account()} keyed>
      {(account) => (
        <>
          {/* Not a setting of its own: Security changes it. */}
          <div class="settings-static">
            <span class="settings-static-label">
              <span class="settings-option-icon" aria-hidden="true">
                <Icon name="envelope" size={20} />
              </span>
              {app.t('signInEmail')}
            </span>
            <strong class="account-email">{account.email}</strong>
          </div>
          <SettingsItem
            id="name"
            icon="account"
            group="profile"
            title={app.t('fullName')}
            value={account.name || app.t('notSet')}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void save(String(data.get('full-name') ?? ''));
              }}
            >
              <ProfileFields
                t={app.t}
                controls="account.profile"
                part="name"
                email={account.email}
                name={account.name}
                onPhoto={() => {}}
              />
              <div class="settings-actions">
                <button
                  class="primary"
                  data-control-id="account.profile.save"
                  disabled={app.busy()}
                >
                  {app.t('saveName')}
                </button>
              </div>
            </form>
          </SettingsItem>
          <SettingsItem
            id="photo"
            icon="photo"
            group="profile"
            title={app.t('profilePhoto')}
            value={account.photo ? '' : app.t('noPhoto')}
          >
            <ProfileFields
              t={app.t}
              controls="account.profile"
              part="photo"
              email={account.email}
              name={account.name}
              photo={account.photo}
              onPhoto={setPhoto}
            />
            <div class="settings-actions">
              <button
                class="primary"
                data-control-id="account.profile.save-photo"
                disabled={app.busy() || photo() === undefined}
                onClick={() => void save(account.name ?? '', photo())}
              >
                {app.t('savePhoto')}
              </button>
            </div>
          </SettingsItem>
        </>
      )}
    </Show>
  );
}
