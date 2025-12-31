# Office Management System - Nginx Deployment Guide

This guide provides step-by-step instructions for deploying the Office Management System on a server with Nginx as a reverse proxy.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Database Setup](#database-setup)
4. [Backend Setup](#backend-setup)
5. [Frontend Setup](#frontend-setup)
6. [Nginx Configuration](#nginx-configuration)
7. [Systemd Service Setup](#systemd-service-setup)
8. [SSL Certificate Setup (Optional)](#ssl-certificate-setup-optional)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- Ubuntu 20.04/22.04 or similar Linux distribution
- Python 3.10 or higher
- Node.js 16.x or higher and npm
- MySQL 8.0 or higher
- Nginx
- Git

### Server Requirements
- Minimum 4GB RAM (8GB recommended for ML models)
- Minimum 20GB disk space
- Root or sudo access

---

## Server Setup

### Step 1: Update System Packages

```bash
sudo apt update
sudo apt upgrade -y
```

### Step 2: Install Required Packages

```bash
# Install Python and pip
sudo apt install -y python3 python3-pip python3-venv

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MySQL
sudo apt install -y mysql-server

# Install Nginx
sudo apt install -y nginx

# Install additional dependencies
sudo apt install -y build-essential libssl-dev libffi-dev python3-dev
sudo apt install -y tesseract-ocr libtesseract-dev
sudo apt install -y git
```

### Step 3: Create Application User

```bash
# Create a dedicated user for the application
sudo adduser --disabled-password --gecos "" officeapp
sudo usermod -aG sudo officeapp

# Switch to the application user
su - officeapp
```

---

## Database Setup

### Step 1: Secure MySQL Installation

```bash
sudo mysql_secure_installation
```

Follow the prompts to set a root password and secure your MySQL installation.

### Step 2: Create Database and User

```bash
sudo mysql -u root -p
```

In MySQL prompt, execute:

```sql
CREATE DATABASE office_expense_dbV2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'officeapp'@'localhost' IDENTIFIED BY 'your_secure_password_here';
GRANT ALL PRIVILEGES ON office_expense_dbV2.* TO 'officeapp'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**Important:** Replace `your_secure_password_here` with a strong password.

### Step 3: Initialize Database Schema

```bash
# Navigate to your project directory
cd /home/officeapp
git clone <your-repository-url> "Office Management System(v2)"
cd "Office Management System(v2)"

# Import the database schema
mysql -u officeapp -p office_expense_dbV2 < database/init.sql
```

---

## Backend Setup

### Step 1: Navigate to Backend Directory

```bash
cd /home/officeapp/"Office Management System(v2)"/backend
```

### Step 2: Create Python Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Python Dependencies

```bash
# Upgrade pip
pip install --upgrade pip

# Install PyTorch CPU version first (if needed)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install other dependencies
pip install -r requirements.txt
```

**Note:** This may take 10-15 minutes depending on your server speed.

### Step 4: Create Environment File

```bash
nano .env
```

Add the following content (adjust values as needed):

```env
DATABASE_URL=mysql+pymysql://officeapp:your_secure_password_here@localhost:3306/office_expense_dbV2
SECRET_KEY=your-very-secure-secret-key-change-this-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
APP_NAME=Infomanav Office Expense System
DEBUG=False
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
```

**Important:** 
- Replace `your_secure_password_here` with your MySQL password
- Replace `your-very-secure-secret-key-change-this-in-production-min-32-chars` with a strong random string (at least 32 characters)

### Step 5: Create Uploads Directory

```bash
mkdir -p uploads/gst_bills
chmod 755 uploads
chmod 755 uploads/gst_bills
```

### Step 6: Test Backend Installation

```bash
# Make sure you're in the virtual environment
source venv/bin/activate

# Test the backend
uvicorn app.main:app --host 127.0.0.1 --port 8002
```

If successful, you should see the FastAPI startup messages. Press `Ctrl+C` to stop.

---

## Frontend Setup

### Step 1: Navigate to Frontend Directory

```bash
cd /home/officeapp/"Office Management System(v2)"/frontend
```

### Step 2: Install Node Dependencies

```bash
npm install
```

### Step 3: Create Production Build

```bash
# Create .env file for build
nano .env.production
```

Add:

```env
REACT_APP_API_URL=http://your-domain.com/api
```

**Replace `your-domain.com` with your actual domain or server IP.**

```bash
# Build the frontend
npm run build
```

This creates a `build` directory with production-ready files.

---

## Nginx Configuration

### Step 1: Create Nginx Configuration File

```bash
sudo nano /etc/nginx/sites-available/office-management
```

Add the following configuration:

```nginx
# Upstream backend server
upstream backend {
    server 127.0.0.1:8002;
}

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Increase client body size for file uploads
    client_max_body_size 50M;

    # Frontend static files
    location / {
        root /home/officeapp/Office Management System(v2)/frontend/build;
        try_files $uri $uri/ /index.html;
        index index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support - no timeout, keep alive indefinitely
    location /api/ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket - no timeout, connection stays alive as long as user is logged in
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
        
        # Disable buffering for WebSocket
        proxy_buffering off;
        
        # Keep connection alive
        proxy_set_header Connection "upgrade";
    }

    # Uploaded files
    location /uploads {
        alias /home/officeapp/Office Management System(v2)/backend/uploads;
        expires 1y;
        add_header Cache-Control "public";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Logging
    access_log /var/log/nginx/office-management-access.log;
    error_log /var/log/nginx/office-management-error.log;
}
```

**Important:** Replace `your-domain.com` with your actual domain name or use your server's IP address.

### Step 2: Enable the Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/office-management /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test is successful, reload Nginx
sudo systemctl reload nginx
```

### Step 3: Configure Firewall

```bash
# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

---

## Systemd Service Setup

### Step 1: Create Backend Service File

```bash
sudo nano /etc/systemd/system/office-management-backend.service
```

Add the following content:

```ini
[Unit]
Description=Office Management System Backend
After=network.target mysql.service

[Service]
Type=simple
User=officeapp
Group=officeapp
WorkingDirectory=/home/officeapp/Office Management System(v2)/backend
Environment="PATH=/home/officeapp/Office Management System(v2)/backend/venv/bin"
ExecStart=/home/officeapp/Office Management System(v2)/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8002 --workers 4
Restart=always
RestartSec=10

# Security settings
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=office-management-backend

[Install]
WantedBy=multi-user.target
```

### Step 2: Enable and Start the Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable office-management-backend

# Start the service
sudo systemctl start office-management-backend

# Check status
sudo systemctl status office-management-backend
```

### Step 3: View Logs

```bash
# View service logs
sudo journalctl -u office-management-backend -f

# View recent logs
sudo journalctl -u office-management-backend -n 100
```

---

## SSL Certificate Setup (Optional but Recommended)

### Using Let's Encrypt (Free SSL)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

Certbot will automatically update your Nginx configuration to use HTTPS.

### Manual SSL Certificate Configuration

If you have your own SSL certificates:

```bash
sudo nano /etc/nginx/sites-available/office-management
```

Update the server block:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # ... rest of configuration ...
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Troubleshooting

### Backend Not Starting

1. **Check service status:**
   ```bash
   sudo systemctl status office-management-backend
   ```

2. **Check logs:**
   ```bash
   sudo journalctl -u office-management-backend -n 50
   ```

3. **Verify virtual environment:**
   ```bash
   source /home/officeapp/Office Management System(v2)/backend/venv/bin/activate
   which uvicorn
   ```

4. **Test manually:**
   ```bash
   cd /home/officeapp/Office Management System(v2)/backend
   source venv/bin/activate
   uvicorn app.main:app --host 127.0.0.1 --port 8002
   ```

### Database Connection Issues

1. **Check MySQL is running:**
   ```bash
   sudo systemctl status mysql
   ```

2. **Test database connection:**
   ```bash
   mysql -u officeapp -p office_expense_dbV2
   ```

3. **Verify .env file:**
   ```bash
   cat /home/officeapp/Office Management System(v2)/backend/.env
   ```

### Nginx Issues

1. **Test Nginx configuration:**
   ```bash
   sudo nginx -t
   ```

2. **Check Nginx error logs:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   sudo tail -f /var/log/nginx/office-management-error.log
   ```

3. **Check Nginx status:**
   ```bash
   sudo systemctl status nginx
   ```

### Frontend Not Loading

1. **Verify build directory exists:**
   ```bash
   ls -la /home/officeapp/Office Management System(v2)/frontend/build
   ```

2. **Check file permissions:**
   ```bash
   sudo chown -R officeapp:officeapp /home/officeapp/Office Management System(v2)/frontend/build
   ```

3. **Rebuild frontend:**
   ```bash
   cd /home/officeapp/Office Management System(v2)/frontend
   npm run build
   ```

### Port Already in Use

If port 8002 is already in use:

```bash
# Find process using port 8002
sudo lsof -i :8002

# Kill the process (replace PID with actual process ID)
sudo kill -9 PID
```

Or change the port in:
- Systemd service file
- Nginx upstream configuration

### Permission Issues

```bash
# Fix ownership
sudo chown -R officeapp:officeapp /home/officeapp/Office Management System(v2)

# Fix uploads directory permissions
sudo chmod -R 755 /home/officeapp/Office Management System(v2)/backend/uploads
```

---

## Maintenance

### Update Application

```bash
# Pull latest changes
cd /home/officeapp/Office Management System(v2)
git pull origin main

# Update backend dependencies
cd backend
source venv/bin/activate
pip install -r requirements.txt --upgrade

# Rebuild frontend
cd ../frontend
npm install
npm run build

# Restart services
sudo systemctl restart office-management-backend
sudo systemctl reload nginx
```

### Backup Database

```bash
# Create backup
mysqldump -u officeapp -p office_expense_dbV2 > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
mysql -u officeapp -p office_expense_dbV2 < backup_file.sql
```

### Monitor Resources

```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check CPU usage
top

# Check service status
sudo systemctl status office-management-backend nginx mysql
```

---

## Security Recommendations

1. **Change default passwords** - Ensure all default passwords are changed
2. **Keep system updated** - Regularly run `sudo apt update && sudo apt upgrade`
3. **Use firewall** - Configure UFW or iptables properly
4. **Enable SSL** - Always use HTTPS in production
5. **Regular backups** - Set up automated database backups
6. **Monitor logs** - Regularly check application and system logs
7. **Limit SSH access** - Use key-based authentication for SSH
8. **Update dependencies** - Keep Python and Node.js packages updated

---

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review application logs
3. Check system logs
4. Verify all configuration files

---

## Quick Reference Commands

```bash
# Start services
sudo systemctl start office-management-backend
sudo systemctl start nginx
sudo systemctl start mysql

# Stop services
sudo systemctl stop office-management-backend
sudo systemctl stop nginx

# Restart services
sudo systemctl restart office-management-backend
sudo systemctl reload nginx

# Check status
sudo systemctl status office-management-backend
sudo systemctl status nginx
sudo systemctl status mysql

# View logs
sudo journalctl -u office-management-backend -f
sudo tail -f /var/log/nginx/error.log
```

---

**Deployment Complete!** 🎉

Your Office Management System should now be accessible at `http://your-domain.com` or `http://your-server-ip`.

