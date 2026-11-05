import { render } from 'solid-js/web';
import '@fontsource-variable/dm-sans';
import '../ui/tokens.css';
import '../ui/account-access/styles.css';
import { AccountAccess } from '../ui/account-access/AccountAccess';

render(() => <AccountAccess />, document.getElementById('app')!);
