export type CalibrationDialogProps = {
  onClose: () => void;
  onApply: (dimensions: { widthCm: number; heightCm: number }) => void;
};
