# Office Management System - Production Deployment Guide

Complete step-by-step guide for deploying the Office Management System on Ubuntu server with Nginx.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Automated Setup)](#quick-start-automated-setup)
3. [Manual Setup](#manual-setup)
4. [Configuration](#configuration)
5. [SSL/HTTPS Setup](#sslhttps-setup)
6. [Maintenance](#maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Security Checklist](#security-checklist)

---

## Prerequisites

### Server Requirements
- **OS**: Ubuntu 20.04 LTS or Ubuntu 22.04 LTS
- **RAM**: Minimum 4GB (8GB recommended for ML models)
- **Storage**: Minimum 20GB free space
- **CPU**: 2+ cores recommended
- **Network**: Static IP address or domain name

### Required Software
- Python 3.10 or higher
- Node.js 20.x
- MySQL 8.0 or higher
- Nginx
- Git

---

## Quick Start (Automated Setup)

For a quick automated setup, use the provided setup script:

```bash
# Clone or copy your project to the server
cd /path/to/your/project

# Make setup script executable
chmod +x deployment/setup.sh

# Run the setup script
./deployment/setup.sh
```

The script will:
- Install all required packages
- Create application user
- Set up MySQL database
- Install Python and Node.js dependencies
- Configure systemd service
- Set up Nginx
- Configure firewall

**Note**: You'll need to manually:
1. Set up MySQL database and user
2. Create `.env` file with your configuration
3. Import database schema

---

## Manual Setup

### Step 1: Update System

```bash
sudo apt update
sudo apt upgrade -y
```

### Step 2: Install Required Packages

```bash
# Install Python and dependencies
sudo apt install -y python3 python3-pip python3-venv python3-dev \
    build-essential libssl-dev libffi-dev default-libmysqlclient-dev

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MySQL
sudo apt install -y mysql-server

# Install Nginx
sudo apt install -y nginx

# Install additional tools
sudo apt install -y git curl tesseract-ocr libtesseract-dev
```

### Step 3: Create Application User

```bash
# Create dedicated user for the application
sudo adduser --disabled-password --gecos "" officeapp
sudo usermod -aG sudo officeapp

# Switch to application user
su - officeapp
```

### Step 4: Set Up MySQL Database

```bash
# Secure MySQL installation
sudo mysql_secure_installation

# Login to MySQL
sudo mysql -u root -p
```

In MySQL prompt:

```sql
CREATE DATABASE office_expense_dbV2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'officeapp'@'localhost' IDENTIFIED BY 'your_secure_password_here';
GRANT ALL PRIVILEGES ON office_expense_dbV2.* TO 'officeapp'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**Important**: Replace `your_secure_password_here` with a strong password.

### Step 5: Clone/Copy Project

```bash
# Create application directory
sudo mkdir -p /var/www/office-management
sudo chown -R officeapp:officeapp /var/www/office-management

# Copy your project files (adjust path as needed)
sudo cp -r /path/to/your/project/* /var/www/office-management/
```

Or if using Git:

```bash
cd /var/www
sudo git clone <your-repository-url> office-management
sudo chown -R officeapp:officeapp office-management
```

### Step 6: Set Up Backend

```bash
cd /var/www/office-management/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install PyTorch CPU version first (required for ML models)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install other dependencies
pip install -r requirements.txt
```

**Note**: Installation may take 10-15 minutes depending on server speed.

### Step 7: Configure Backend Environment

```bash
# Create .env file
nano .env
```

Add the following (adjust values as needed):

```env
# Database Configuration
DATABASE_URL=mysql+pymysql://officeapp:your_secure_password_here@localhost:3306/office_expense_dbV2

# Security
SECRET_KEY=your-very-secure-secret-key-change-this-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Application
APP_NAME=Infomanav Office Expense System
DEBUG=False
ENVIRONMENT=production

# CORS (comma-separated list of allowed origins, or * for all)
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# AI/ML Configuration
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
HUGGINGFACE_TOKEN=
HF_TOKEN=

# Server Configuration
HOST=127.0.0.1
PORT=8002
WORKERS=4
```

**Important**:
- Replace `your_secure_password_here` with your MySQL password
- Generate a strong `SECRET_KEY` (at least 32 characters)
- Update `CORS_ORIGINS` with your actual domain(s)

### Step 8: Create Required Directories

```bash
# Create uploads directory
mkdir -p uploads/gst_bills uploads/employee_assets
chmod -R 755 uploads

# Create logs directory
mkdir -p logs
chmod 755 logs
```

### Step 9: Import Database Schema

```bash
# Import initial schema
mysql -u officeapp -p office_expense_dbV2 < ../database/init.sql
```

### Step 10: Set Up Frontend

```bash
cd /var/www/office-management/frontend

# Install dependencies
npm install

# Create .env file for build
nano .env
```

Add:

```env
REACT_APP_API_URL=https://yourdomain.com/api
```

**Important**: Replace `yourdomain.com` with your actual domain or IP.

```bash
# Build production version
npm run build

# Copy build to nginx directory
sudo mkdir -p /var/www/office-management/frontend
sudo cp -r build/* /var/www/office-management/frontend/
sudo chown -R www-data:www-data /var/www/office-management/frontend
```

### Step 11: Configure Systemd Service

```bash
# Copy service file
sudo cp /var/www/office-management/deployment/office-management-backend.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable office-management-backend

# Start the service
sudo systemctl start office-management-backend

# Check status
sudo systemctl status office-management-backend
```

### Step 12: Configure Nginx

```bash
# Copy Nginx configuration
sudo cp /var/www/office-management/deployment/nginx.conf /etc/nginx/sites-available/office-management

# Edit configuration (update server_name with your domain)
sudo nano /etc/nginx/sites-available/office-management
```

Update the `server_name` directive:
```nginx
server_name yourdomain.com www.yourdomain.com;
```

Or if using IP:
```nginx
server_name _;
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/office-management /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

### Step 13: Configure Firewall

```bash
# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Configuration

### Environment Variables

#### Backend (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql+pymysql://user:pass@localhost:3306/dbname` |
| `SECRET_KEY` | JWT secret key (min 32 chars) | `your-very-secure-secret-key` |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `https://domain.com,https://www.domain.com` |
| `ENVIRONMENT` | Environment mode | `production` |
| `DEBUG` | Debug mode | `False` |
| `WORKERS` | Gunicorn workers | `4` |

#### Frontend (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `REACT_APP_API_URL` | Backend API URL | `https://yourdomain.com/api` |

### Systemd Service Configuration

Edit `/etc/systemd/system/office-management-backend.service` to adjust:
- Number of workers
- Timeout settings
- Resource limits

### Nginx Configuration

Edit `/etc/nginx/sites-available/office-management` to adjust:
- Server name
- Client body size (for file uploads)
- Rate limiting
- SSL settings

---

## SSL/HTTPS Setup

### Using Let's Encrypt (Free SSL)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

Certbot will automatically:
- Obtain SSL certificate
- Update Nginx configuration
- Set up automatic renewal

### Manual SSL Configuration

If you have your own SSL certificates:

1. Copy certificates to server:
```bash
sudo mkdir -p /etc/ssl/certs/office-management
sudo cp your-certificate.crt /etc/ssl/certs/office-management/
sudo cp your-private.key /etc/ssl/certs/office-management/
sudo chmod 600 /etc/ssl/certs/office-management/your-private.key
```

2. Update Nginx configuration:
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/ssl/certs/office-management/your-certificate.crt;
    ssl_certificate_key /etc/ssl/certs/office-management/your-private.key;
    
    # ... rest of configuration ...
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

3. Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Maintenance

### Updating the Application

Use the provided deployment script:

```bash
cd /var/www/office-management
chmod +x deployment/deploy.sh
./deployment/deploy.sh
```

Or manually:

```bash
# Stop services
sudo systemctl stop office-management-backend

# Update code (if using git)
cd /var/www/office-management
git pull origin main

# Update backend dependencies
cd backend
source venv/bin/activate
pip install -r requirements.txt --upgrade

# Rebuild frontend
cd ../frontend
npm install
npm run build
sudo cp -r build/* /var/www/office-management/frontend/
sudo chown -R www-data:www-data /var/www/office-management/frontend

# Restart services
sudo systemctl start office-management-backend
sudo systemctl reload nginx
```

### Database Backup

```bash
# Create backup
mysqldump -u officeapp -p office_expense_dbV2 > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
mysql -u officeapp -p office_expense_dbV2 < backup_file.sql
```

### Automated Backups

Create a cron job for automated backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * mysqldump -u officeapp -p'your_password' office_expense_dbV2 > /var/backups/office-management/db_$(date +\%Y\%m\%d).sql
```

### Monitoring

```bash
# Check service status
sudo systemctl status office-management-backend
sudo systemctl status nginx
sudo systemctl status mysql

# View logs
sudo journalctl -u office-management-backend -f
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/office-management-access.log

# Check resource usage
htop
df -h
free -h
```

---

## Troubleshooting

### Backend Not Starting

1. **Check service status:**
```bash
sudo systemctl status office-management-backend
```

2. **View logs:**
```bash
sudo journalctl -u office-management-backend -n 100
```

3. **Test manually:**
```bash
cd /var/www/office-management/backend
source venv/bin/activate
gunicorn app.main:app --workers 1 --bind 127.0.0.1:8002
```

4. **Check permissions:**
```bash
sudo chown -R officeapp:officeapp /var/www/office-management
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
cat /var/www/office-management/backend/.env
```

### Nginx Issues

1. **Test configuration:**
```bash
sudo nginx -t
```

2. **Check error logs:**
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/office-management-error.log
```

3. **Check Nginx status:**
```bash
sudo systemctl status nginx
```

### Frontend Not Loading

1. **Verify build directory:**
```bash
ls -la /var/www/office-management/frontend
```

2. **Check file permissions:**
```bash
sudo chown -R www-data:www-data /var/www/office-management/frontend
```

3. **Rebuild frontend:**
```bash
cd /var/www/office-management/frontend
npm run build
sudo cp -r build/* /var/www/office-management/frontend/
```

### Port Already in Use

```bash
# Find process using port 8002
sudo lsof -i :8002

# Kill the process (replace PID)
sudo kill -9 PID
```

### Permission Issues

```bash
# Fix ownership
sudo chown -R officeapp:officeapp /var/www/office-management

# Fix uploads directory
sudo chmod -R 755 /var/www/office-management/backend/uploads
```

---

## Security Checklist

- [ ] Changed all default passwords
- [ ] Generated strong SECRET_KEY (32+ characters)
- [ ] Configured CORS_ORIGINS (not using `*` in production)
- [ ] Set up SSL/HTTPS
- [ ] Configured firewall (UFW)
- [ ] Disabled root login (SSH)
- [ ] Set up SSH key authentication
- [ ] Regular system updates (`sudo apt update && sudo apt upgrade`)
- [ ] Database backups configured
- [ ] Application logs monitored
- [ ] File upload limits configured
- [ ] Rate limiting enabled in Nginx
- [ ] Security headers configured
- [ ] MySQL secure installation completed
- [ ] Application user has minimal privileges

---

## Quick Reference Commands

```bash
# Service Management
sudo systemctl start office-management-backend
sudo systemctl stop office-management-backend
sudo systemctl restart office-management-backend
sudo systemctl status office-management-backend

# View Logs
sudo journalctl -u office-management-backend -f
sudo journalctl -u office-management-backend -n 100

# Nginx
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart nginx

# Database
mysql -u officeapp -p office_expense_dbV2
mysqldump -u officeapp -p office_expense_dbV2 > backup.sql

# Application
cd /var/www/office-management/backend
source venv/bin/activate
gunicorn app.main:app --workers 4 --bind 127.0.0.1:8002
```

---

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review application logs
3. Check system logs
4. Verify all configuration files

---

**Deployment Complete!** 🎉

Your Office Management System should now be accessible at `http://your-domain.com` or `https://your-domain.com` (if SSL is configured).

