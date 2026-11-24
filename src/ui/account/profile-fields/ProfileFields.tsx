import { createSignal, onCleanup, Show, untrack } from 'solid-js';
import type { Translate } from '../../account-access/types';
import { Icon } from '../../icon/Icon';
import { profileInitial, squarePhoto } from './photo';
import './styles.css';

/** A round photo, or the first letter of the name (or address) when there is none. */
export function ProfileAvatar(props: {
  name?: string;
  email: string;
  photo?: string;
  size?: 'nav' | 'small' | 'large';
}) {
  return (
    // The initial is drawn by CSS (data-initial), so it never becomes part of a button's text.
    <span
      class="profile-avatar"
      data-size={props.size ?? 'small'}
      data-initial={props.photo ? undefined : profileInitial(props.name, props.email) || undefined}
      aria-hidden="true"
    >
      <Show
        when={props.photo}
        fallback={
          <Show when={!profileInitial(props.name, props.email)}>
            <Icon name="account" size={20} />
          </Show>
        }
      >
        {(src) => <img src={src()} alt="" />}
      </Show>
    </span>
  );
}

/**
 * Full name and optional profile photo, for a new account and for the profile page. The photo is
 * cropped and scaled in the browser; `onPhoto` gets base64 JPEG, '' to remove it, or undefined
 * when the person has not changed it.
 */
export function ProfileFields(props: {
  t: Translate;
  controls: 'auth.register' | 'account.profile';
  email: string;
  name?: string;
  photo?: string;
  onPhoto: (photo: string | undefined) => void;
  autofocus?: boolean;
  /** Settings shows the name and the photo as separate items. */
  part?: 'name' | 'photo';
}) {
  // The page remounts this with each saved profile, so the starting values are read once.
  const [preview, setPreview] = createSignal(untrack(() => props.photo));
  const [problem, setProblem] = createSignal(false);
  const [reading, setReading] = createSignal(false);
  const [typed, setTyped] = createSignal(untrack(() => props.name) ?? '');
  let file: HTMLInputElement | undefined;
  let objectUrl: string | undefined;
  const release = () => objectUrl && URL.revokeObjectURL(objectUrl);
  onCleanup(release);
  const choose = async () => {
    const picked = file?.files?.[0];
    if (file) file.value = '';
    if (!picked) return;
    setProblem(false);
    setReading(true);
    try {
      const encoded = await squarePhoto(picked);
      release();
      objectUrl = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }),
      );
      setPreview(objectUrl);
      props.onPhoto(encoded);
    } catch {
      setProblem(true);
    } finally {
      setReading(false);
    }
  };
  return (
    <div class="profile-fields">
      <Show when={props.part !== 'photo'}>
        <label>
          {/* In Settings the row is already titled Full name. */}
          <span class={props.part === 'name' ? 'account-visually-hidden' : undefined}>
            {props.t('fullName')}
          </span>
          <input
            ref={(el) => props.autofocus && queueMicrotask(() => el.focus())}
            name="full-name"
            autocomplete="name"
            required
            maxlength={100}
            value={props.name ?? ''}
            data-control-id={`${props.controls}.name`}
            aria-describedby="full-name-help"
            onInput={(event) => setTyped(event.currentTarget.value)}
          />
        </label>
        <p id="full-name-help" class="field-help">
          {props.t('fullNameHelp')}
        </p>
      </Show>
      <Show when={props.part !== 'name'}>
        <div class="profile-photo" role="group" aria-labelledby="profile-photo-label">
          <ProfileAvatar name={typed()} email={props.email} photo={preview()} size="large" />
          <div>
            <span id="profile-photo-label" class="profile-photo-label">
              {props.t('profilePhoto')}
            </span>
            <p class="field-help">{props.t('profilePhotoHelp')}</p>
            <div class="profile-photo-actions">
              <input
                ref={(el) => (file = el)}
                class="account-visually-hidden"
                type="file"
                accept="image/*"
                tabIndex={-1}
                aria-hidden="true"
                onChange={() => void choose()}
              />
              <button
                type="button"
                data-control-id={`${props.controls}.photo`}
                disabled={reading()}
                onClick={() => file?.click()}
              >
                {props.t(preview() ? 'changePhoto' : 'addPhoto')}
              </button>
              <Show when={preview()}>
                <button
                  type="button"
                  data-control-id={`${props.controls}.photo-remove`}
                  onClick={() => {
                    release();
                    objectUrl = undefined;
                    setPreview(undefined);
                    // A photo chosen and removed before saving was never stored.
                    props.onPhoto(props.photo ? '' : undefined);
                  }}
                >
                  {props.t('removePhoto')}
                </button>
              </Show>
            </div>
            <Show when={problem()}>
              <p role="alert" class="profile-photo-problem">
                {props.t('photoUnreadable')}
              </p>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
