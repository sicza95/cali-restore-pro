import { useApp } from '../../../app-context/AppContext';
import { SettingsItem } from '../../SettingsItem';
import { settingsCopy } from '../../settings-copy';
import { settingsHelpCopy } from '../../settings-help-copy';
import { restorationPreferenceCopy } from '../copy';
import { ChoiceButtons } from '../choice-buttons/ChoiceButtons';
import { areaUnitControls, areaUnits, measurementSystems } from './constants';

export function MeasurementSetting(props: {
  system: string;
  areaUnit: string;
  onSystem: (value: string) => void;
  onAreaUnit: (value: string) => void;
}) {
  const app = useApp();
  const c = () => restorationPreferenceCopy[app.lang()];
  const system = () => (props.system === 'imperial' ? 'imperial' : 'metric');
  const area = () => areaUnits.find((unit) => unit === props.areaUnit) ?? '';
  const areaLabel = (unit: string) =>
    unit || c().defaultAreaUnit(system() === 'imperial' ? 'ft²' : 'm²');
  return (
    <SettingsItem
      id="measurement"
      icon="measure"
      group="defaults"
      title={c().measurement}
      help={settingsHelpCopy[app.lang()].measurement}
      value={`${c()[system()]} · ${areaLabel(area())}`}
    >
      <div class="settings-measurement-field">
        <span>{c().measurementUnits}</span>
        <ChoiceButtons
          name="measurement-system"
          label={c().measurementUnits}
          options={measurementSystems}
          value={system()}
          text={(value) => c()[value]}
          control={(value) => `preferences.measurement-units.${value}`}
          pick={props.onSystem}
        />
      </div>
      <div class="settings-measurement-field">
        <span>{settingsCopy[app.lang()].units}</span>
        <ChoiceButtons
          name="area-unit"
          label={settingsCopy[app.lang()].units}
          options={areaUnits}
          value={area()}
          text={areaLabel}
          control={(value) => `preferences.units.${areaUnitControls[value]}`}
          pick={props.onAreaUnit}
        />
      </div>
    </SettingsItem>
  );
}
