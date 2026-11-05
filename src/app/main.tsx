import { render } from 'solid-js/web';
import '@fontsource-variable/dm-sans';
import '../ui/tokens.css';
import '../ui/account-access/styles.css';
import { AccountAccess } from '../ui/account-access/AccountAccess';

const theme = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => {
  document.body.dataset.theme = theme.matches ? 'dark' : 'light';
};
applyTheme();
theme.addEventListener('change', applyTheme);
render(() => <AccountAccess />, document.getElementById('app')!);
