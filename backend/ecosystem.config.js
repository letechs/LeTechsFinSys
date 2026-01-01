/**
 * PM2 Ecosystem Configuration
 * 
 * Production process management for LeTechs Copy Trading Backend
 * 
 * Usage:
 *   - Start: pm2 start ecosystem.config.js
 *   - Stop: pm2 stop letechs-backend
 *   - Restart: pm2 restart letechs-backend
 *   - Reload: pm2 reload letechs-backend (zero-downtime reload)
 *   - Delete: pm2 delete letechs-backend
 *   - Logs: pm2 logs letechs-backend
 *   - Monitor: pm2 monit
 *   - Save: pm2 save (saves current process list)
 *   - Startup: pm2 startup (generates startup script)
 */

module.exports = {
  apps: [
    {
      name: 'letechs-backend',
      script: './dist/server.js',
      instances: 1, // Start with 1 instance (can increase if needed)
      exec_mode: 'fork', // Use 'fork' mode (not 'cluster' - better for MongoDB connection pooling)
      // Note: Cluster mode can cause issues with MongoDB connections and Socket.IO
      // If you need multiple instances, consider using PM2's load balancer or Nginx upstream
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true, // Prepend timestamp to logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true, // Merge logs from all instances
      
      // Auto restart
      autorestart: true,
      watch: false, // Disable watch in production
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      
      // Restart policy
      min_uptime: '10s', // Minimum uptime to consider app stable
      max_restarts: 10, // Maximum number of restarts in a minute
      restart_delay: 4000, // Delay between restarts (ms)
      
      // Advanced
      kill_timeout: 5000, // Time to wait before force killing (ms)
      wait_ready: false, // Don't wait for 'ready' signal
      listen_timeout: 10000, // Time to wait for listen event (ms)
      
      // Instance variables
      instance_var: 'INSTANCE_ID',
      
      // Source map support (if using TypeScript source maps)
      source_map_support: true,
    },
  ],
};

