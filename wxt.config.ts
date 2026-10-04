import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: {
    name: 'Likedex',
    description: 'Likedex development foundation: Options and Side Panel shell.',
    action: { default_title: 'Open Likedex' },
  },
});
