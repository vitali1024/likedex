import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: {
    name: 'Likedex',
    minimum_chrome_version: '141', // Real window-scoped sidePanel.close().
    permissions: ['identity'], // WXT adds sidePanel for its entrypoint.
    host_permissions: ['https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*'],
    oauth2: {
      client_id: '875739161327-ut8ca2iocubeq8a2a2eleu9kcdu6d1ue.apps.googleusercontent.com',
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; connect-src https://www.googleapis.com https://oauth2.googleapis.com; img-src 'self' https://i.ytimg.com",
    },
    // Public Store key pins unpacked builds to mmefiakgfhddiojfdnkfpfpbkgbfgkgj.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2Mrsf7jhzWUVvet1U8+ivTvl7skABNZU3ZmlhBchXJ383YHZqNpQju8IUPfZprfoxlBoma1W9Cf6/T+Pc08PmzJS2P1gtHBQ2dsC0FGVVGPdVoq3BpHfA7sHphlorQ59217U4dEPB7KbUFmePOvC+UtJlc1LgVaLTRh1+9Ifiv32CeuHMMg56hqj3e+5O4aBPAfmhBMMfJ5g0xvE5QeNBIuCGVw1uCyVS9HQaZpKfpKnjgNK9WnbVE1JHYjFC4yF3t5k8/qc/Fo/wcClQu8nhrZBiddjbu8dYa6CfQqyeIlc7gTk8288emrXpOLl1qYwfy1spKCaYcd1f3rqnZEpsQIDAQAB',
    description: 'Find and revisit your YouTube Liked Videos with local search, filters, and a read-only library.',
    action: {
      default_title: 'Open Likedex',
      default_icon: { 16: 'action/16.png', 24: 'action/24.png', 32: 'action/32.png' },
    },
  },
});
