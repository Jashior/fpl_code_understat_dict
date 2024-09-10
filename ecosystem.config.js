module.exports = {
  apps: [
    {
      name: "fpl_code_understat_dict",
      script: "nodemon",
      args: "--ext js,csv app.js", // Watch .js and .csv files, then run app.js
      instances: 1,
      autorestart: true,
      watch: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
