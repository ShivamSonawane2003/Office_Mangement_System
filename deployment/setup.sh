#!/bin/bash

# Office Management System - Production Setup Script
# This script sets up the production environment on Ubuntu server

set -e  # Exit on error

echo "=========================================="
echo "Office Management System - Production Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}Please do not run this script as root. Run as a regular user with sudo privileges.${NC}"
    exit 1
fi

# Variables
APP_USER="officeapp"
APP_DIR="/var/www/office-management"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${GREEN}Step 1: Updating system packages...${NC}"
sudo apt update
sudo apt upgrade -y

echo -e "${GREEN}Step 2: Installing required packages...${NC}"
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libssl-dev \
    libffi-dev \
    default-libmysqlclient-dev \
    mysql-server \
    nginx \
    git \
    curl \
    tesseract-ocr \
    libtesseract-dev \
    supervisor

echo -e "${GREEN}Step 3: Installing Node.js 20.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo -e "${YELLOW}Node.js is already installed. Skipping...${NC}"
fi

echo -e "${GREEN}Step 4: Creating application user...${NC}"
if ! id "$APP_USER" &>/dev/null; then
    sudo adduser --disabled-password --gecos "" "$APP_USER"
    sudo usermod -aG sudo "$APP_USER"
    echo -e "${GREEN}User '$APP_USER' created successfully.${NC}"
else
    echo -e "${YELLOW}User '$APP_USER' already exists. Skipping...${NC}"
fi

echo -e "${GREEN}Step 5: Creating application directory...${NC}"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo -e "${GREEN}Step 6: Copying project files...${NC}"
sudo -u "$APP_USER" cp -r "$PROJECT_DIR"/* "$APP_DIR/"

echo -e "${GREEN}Step 7: Setting up MySQL database...${NC}"
echo -e "${YELLOW}Please run the following commands manually to set up MySQL:${NC}"
echo "sudo mysql_secure_installation"
echo "sudo mysql -u root -p"
echo ""
echo "Then execute in MySQL:"
echo "CREATE DATABASE office_expense_dbV2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "CREATE USER 'officeapp'@'localhost' IDENTIFIED BY 'your_secure_password';"
echo "GRANT ALL PRIVILEGES ON office_expense_dbV2.* TO 'officeapp'@'localhost';"
echo "FLUSH PRIVILEGES;"
echo "EXIT;"
echo ""
read -p "Press Enter after completing MySQL setup..."

echo -e "${GREEN}Step 8: Setting up backend...${NC}"
cd "$APP_DIR/backend"

# Create virtual environment
sudo -u "$APP_USER" python3 -m venv venv

# Activate virtual environment and install dependencies
sudo -u "$APP_USER" bash -c "source venv/bin/activate && pip install --upgrade pip"
sudo -u "$APP_USER" bash -c "source venv/bin/activate && pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu"
sudo -u "$APP_USER" bash -c "source venv/bin/activate && pip install -r requirements.txt"

# Create uploads directory
sudo -u "$APP_USER" mkdir -p uploads/gst_bills uploads/employee_assets
sudo -u "$APP_USER" chmod -R 755 uploads

# Create logs directory
sudo -u "$APP_USER" mkdir -p logs
sudo -u "$APP_USER" chmod 755 logs

echo -e "${GREEN}Step 9: Setting up frontend...${NC}"
cd "$APP_DIR/frontend"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build

# Move build to nginx directory
sudo mkdir -p /var/www/office-management/frontend
sudo cp -r build/* /var/www/office-management/frontend/
sudo chown -R www-data:www-data /var/www/office-management/frontend

echo -e "${GREEN}Step 10: Setting up systemd service...${NC}"
sudo cp "$APP_DIR/deployment/office-management-backend.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable office-management-backend

echo -e "${GREEN}Step 11: Setting up Nginx...${NC}"
sudo cp "$APP_DIR/deployment/nginx.conf" /etc/nginx/sites-available/office-management
sudo ln -sf /etc/nginx/sites-available/office-management /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo -e "${GREEN}Nginx configuration is valid.${NC}"
else
    echo -e "${RED}Nginx configuration test failed. Please check the configuration.${NC}"
    exit 1
fi

echo -e "${GREEN}Step 12: Configuring firewall...${NC}"
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw --force enable

echo ""
echo -e "${GREEN}=========================================="
echo "Setup completed successfully!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Create .env file in $APP_DIR/backend/ with your configuration"
echo "2. Import database schema: mysql -u officeapp -p office_expense_dbV2 < $APP_DIR/database/init.sql"
echo "3. Update Nginx configuration with your domain name"
echo "4. Start the backend service: sudo systemctl start office-management-backend"
echo "5. Check service status: sudo systemctl status office-management-backend"
echo ""
echo "For detailed instructions, see DEPLOYMENT_README.md"

