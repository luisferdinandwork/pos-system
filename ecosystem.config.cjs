module.exports = {
  apps: [
    {
      name: "pos-system",
      cwd: __dirname,
      script: "./node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3100",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 30000,
      min_uptime: "10s",
      max_restarts: 10,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
