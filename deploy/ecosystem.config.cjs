// PM2 process file: `pm2 start deploy/ecosystem.config.cjs` from the project root.
module.exports = {
  apps: [{
    name: 'nexorcrm',
    cwd: './backend',
    script: 'index.js',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '512M',
  }],
};
