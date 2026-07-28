import type { Config } from 'tailwindcss';
import preset from '@prometheus/ui/tailwind-preset.cjs';

const config: Config = {
  presets: [preset],
  content: ['./src/popup/**/*.{ts,tsx,html}', '../../packages/ui/src/**/*.{ts,tsx}'],
};

export default config;
