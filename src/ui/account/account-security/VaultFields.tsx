export function VaultKeyField(props: { label: string }) {
  return (
    <label>
      {props.label}
      <input name="key" type="password" autocomplete="off" required maxLength={64} />
    </label>
  );
}

export function VaultFileField(props: { label: string }) {
  return (
    <label>
      {props.label}
      <input name="file" type="file" accept=".json,application/json" required />
    </label>
  );
}
