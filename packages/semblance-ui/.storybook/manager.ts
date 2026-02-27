import { addons } from '@storybook/manager-api';
import { create } from '@storybook/theming/create';

const semblanceTheme = create({
  base: 'dark',
  brandTitle: 'Semblance UI',
  brandUrl: 'https://semblance.run',

  colorPrimary: '#6ECFA3',
  colorSecondary: '#6ECFA3',

  appBg: '#0B0E11',
  appContentBg: '#111518',
  appPreviewBg: '#0B0E11',
  appBorderColor: 'rgba(255,255,255,0.09)',
  appBorderRadius: 8,

  textColor: '#CDD4DB',
  textMutedColor: '#8593A4',
  textInverseColor: '#0B0E11',

  barTextColor: '#A8B4C0',
  barSelectedColor: '#6ECFA3',
  barHoverColor: '#CDD4DB',
  barBg: '#111518',

  inputBg: '#171B1F',
  inputBorder: 'rgba(255,255,255,0.09)',
  inputTextColor: '#CDD4DB',
  inputBorderRadius: 8,
});

addons.setConfig({ theme: semblanceTheme });
