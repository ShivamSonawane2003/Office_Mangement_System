# Deployment Files

This directory contains all files needed for production deployment on Ubuntu server with Nginx.

## Files Overview

### Configuration Files

1. **nginx.conf** - Production Nginx configuration
   - Reverse proxy setup
   - WebSocket support
   - Static file serving
   - Rate limiting
   - SSL/HTTPS ready

2. **office-management-backend.service** - Systemd service file
   - Auto-start on boot
   - Automatic restarts
   - Resource limits
   - Security settings

3. **gunicorn.conf.py** - Gunicorn configuration
   - Worker processes
   - Timeouts
   - Logging settings

### Scripts

1. **setup.sh** - Automated initial setup
   - Installs all dependencies
   - Creates application user
   - Sets up directories
   - Configures services

2. **deploy.sh** - Deployment/update script
   - Backs up database and uploads
   - Updates code
   - Rebuilds frontend
   - Restarts services

## Usage

### Initial Setup

```bash
# Make scripts executable
chmod +x deployment/setup.sh deployment/deploy.sh

# Run setup
./deployment/setup.sh
```

### Updating Application

```bash
# Run deployment script
./deployment/deploy.sh
```

## Installation Locations

After setup, files will be located at:

- **Application**: `/var/www/office-management/`
- **Backend**: `/var/www/office-management/backend/`
- **Frontend**: `/var/www/office-management/frontend/`
- **Nginx config**: `/etc/nginx/sites-available/office-management`
- **Systemd service**: `/etc/systemd/system/office-management-backend.service`
- **Logs**: `/var/log/nginx/office-management-*.log`

## Manual Installation

If you prefer manual setup, follow the detailed guide in **[../DEPLOYMENT_README.md](../DEPLOYMENT_README.md)**.

## Requirements

- Ubuntu 20.04/22.04 LTS
- Python 3.10+
- Node.js 20.x
- MySQL 8.0+
- Nginx
- Root/sudo access

## Support

For detailed deployment instructions, troubleshooting, and configuration options, see **[../DEPLOYMENT_README.md](../DEPLOYMENT_README.md)**.

