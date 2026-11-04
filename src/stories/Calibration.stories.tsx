import { Show, createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Button } from '../ui/controls';
import { CalibrationDialog } from '../ui/CalibrationDialog';

const meta = {
  title: 'Patterns/Calibration form',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
  render: () => {
    const [open, setOpen] = createSignal(false);
    const [result, setResult] = createSignal('No dimensions applied.');
    return (
      <main class="cr-component-stage">
        <div class="cr-form-stage">
          <h1>Calibration form</h1>
          <p class="cr-note">
            Invalid text stays editable. Cancel returns focus to the opening control.
          </p>
          <Button onClick={() => setOpen(true)}>Open calibration</Button>
          <p role="status">{result()}</p>
        </div>
        <Show when={open()}>
          <CalibrationDialog
            onClose={() => setOpen(false)}
            onApply={(value) => {
              setResult(`${value.widthCm} × ${value.heightCm} cm applied to this example.`);
              setOpen(false);
            }}
          />
        </Show>
      </main>
    );
  },
};
