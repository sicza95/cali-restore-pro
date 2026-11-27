import { expectTypeOf, it } from 'vitest';
import type * as Api from '../../api';
import type * as Bin from './types';

// Compile-time: the planner's wire values stay identical to the shared OpenAPI contract.
it('matches the OpenAPI Bin schemas', () => {
  expectTypeOf<Bin.BinEntityKind>().toEqualTypeOf<Api.BinEntityKind>();
  expectTypeOf<Bin.BinEntryState>().toEqualTypeOf<Api.BinEntryState>();
  expectTypeOf<Bin.BinLifecycleIntent>().toEqualTypeOf<Api.BinLifecycleIntent>();
  expectTypeOf<Bin.BinAction>().toEqualTypeOf<Api.BinAction>();
  expectTypeOf<Bin.BinFailureCode>().toEqualTypeOf<Api.BinFailureCode>();
  expectTypeOf<Bin.BinCapabilities>().toEqualTypeOf<Api.BinCapabilities>();
});
