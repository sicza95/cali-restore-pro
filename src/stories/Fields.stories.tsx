import { createEffect, createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Field, RangeControl, Switch } from '../ui';

const meta = {
  title: 'Controls/Fields',
  decorators: [
    (Story) => (
      <main class="cr-component-stage">
        <div class="cr-form-stage">
          <Story />
        </div>
      </main>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function LengthExample(props: { invalid?: boolean }) {
  const [value, setValue] = createSignal('300');
  createEffect(() => setValue(props.invalid ? '12..5' : '300'));
  return (
    <Field
      label="Plane width"
      value={value()}
      onInput={setValue}
      suffix="cm"
      inputMode="decimal"
      hint="The known width of the assessed plane."
      error={
        props.invalid
          ? 'Enter a positive length. Your text is kept so you can correct it.'
          : undefined
      }
    />
  );
}

export const Length: Story = { render: () => <LengthExample /> };
export const InvalidTextRetained: Story = { render: () => <LengthExample invalid /> };
export const BrushWidth: Story = {
  render: () => {
    const [value, setValue] = createSignal(18);
    return (
      <RangeControl
        label="Brush width"
        min={1}
        max={60}
        value={value()}
        unit="mm"
        onChange={setValue}
      />
    );
  },
};
export const DrawingPreferences: Story = {
  render: () => {
    const [finger, setFinger] = createSignal(false);
    const [pressure, setPressure] = createSignal(false);
    const [manual, setManual] = createSignal(false);
    return (
      <section>
        <h1>Drawing preferences</h1>
        <Switch
          label="Finger drawing"
          description="Off by default. Two fingers navigate the surface."
          checked={finger()}
          onChange={setFinger}
        />
        <Switch
          label="Pressure-sensitive width"
          description="Constant surface width is the default."
          checked={pressure()}
          onChange={setPressure}
        />
        <Switch
          label="Manual Commit / Discard"
          description="Otherwise, each completed stroke commits separately."
          checked={manual()}
          onChange={setManual}
        />
      </section>
    );
  },
};
