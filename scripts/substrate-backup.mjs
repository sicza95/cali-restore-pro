// M-00 recovery has no current project access/deletion ledger.
export function requireEmptyHosting(run) {
  const query = (sql) =>
    run(
      ['exec', '-T', 'db', 'psql', '-U', 'calirestore_migrator', '-d', 'calirestore', '-Atc', sql],
      { encoding: 'utf8', stdio: 'pipe' },
    ).stdout.trim();
  if (
    query("SELECT to_regclass('public.hosted_projects') IS NOT NULL") === 't' &&
    query('SELECT EXISTS (SELECT 1 FROM public.hosted_projects)') !== 'f'
  ) {
    throw new Error('Substrate backup/restore is unavailable for hosted projects');
  }
  if (
    query('SELECT EXISTS (SELECT 1 FROM public.accounts)') !== 'f' ||
    (query("SELECT to_regclass('public.account_deletions') IS NOT NULL") === 't' &&
      query('SELECT EXISTS (SELECT 1 FROM public.account_deletions)') !== 'f')
  ) {
    throw new Error('Substrate backup/restore requires an empty identity database');
  }
}
