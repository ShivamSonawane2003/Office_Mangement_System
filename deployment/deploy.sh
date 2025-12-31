#!/bin/bash

# Office Management System - Deployment Script
# This script updates the application with new code

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
APP_USER="officeapp"
APP_DIR="/var/www/office-management"
BACKUP_DIR="/var/backups/office-management"

echo -e "${GREEN}=========================================="
echo "Office Management System - Deployment"
echo "==========================================${NC}"

# Check if running as correct user
if [ "$USER" != "$APP_USER" ]; then
    echo -e "${YELLOW}Warning: Not running as $APP_USER. Some operations may require sudo.${NC}"
fi

# Create backup directory
sudo mkdir -p "$BACKUP_DIR"

# Backup database
echo -e "${GREEN}Step 1: Backing up database...${NC}"
BACKUP_FILE="$BACKUP_DIR/db_backup_$(date +%Y%m%d_%H%M%S).sql"
sudo mysqldump -u officeapp -p office_expense_dbV2 > "$BACKUP_FILE" || {
    echo -e "${RED}Database backup failed. Please check MySQL credentials.${NC}"
    exit 1
}
echo -e "${GREEN}Database backed up to: $BACKUP_FILE${NC}"

# Backup uploads
echo -e "${GREEN}Step 2: Backing up uploads...${NC}"
sudo tar -czf "$BACKUP_DIR/uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz" -C "$APP_DIR/backend" uploads/ || {
    echo -e "${YELLOW}Warning: Uploads backup failed or uploads directory doesn't exist.${NC}"
}

# Stop services
echo -e "${GREEN}Step 3: Stopping services...${NC}"
sudo systemctl stop office-management-backend

# Update code (if using git)
if [ -d "$APP_DIR/.git" ]; then
    echo -e "${GREEN}Step 4: Pulling latest code from git...${NC}"
    cd "$APP_DIR"
    sudo -u "$APP_USER" git pull origin main || {
        echo -e "${YELLOW}Warning: Git pull failed. Continuing with manual deployment...${NC}"
    }
else
    echo -e "${YELLOW}Step 4: Not a git repository. Skipping git pull...${NC}"
    echo -e "${YELLOW}Please manually copy your updated files to $APP_DIR${NC}"
    read -p "Press Enter after copying files..."
fi

# Update backend dependencies
echo -e "${GREEN}Step 5: Updating backend dependencies...${NC}"
cd "$APP_DIR/backend"
sudo -u "$APP_USER" bash -c "source venv/bin/activate && pip install --upgrade pip"
sudo -u "$APP_USER" bash -c "source venv/bin/activate && pip install -r requirements.txt --upgrade"

# Run database migrations (if any)
if [ -d "$APP_DIR/database" ]; then
    echo -e "${GREEN}Step 6: Checking for database migrations...${NC}"
    # Add migration scripts here if needed
    echo -e "${YELLOW}No migrations configured. Skipping...${NC}"
fi

# Rebuild frontend
echo -e "${GREEN}Step 7: Rebuilding frontend...${NC}"
cd "$APP_DIR/frontend"
sudo -u "$APP_USER" npm install
sudo -u "$APP_USER" npm run build

# Copy frontend build to nginx directory
sudo rm -rf /var/www/office-management/frontend/*
sudo cp -r build/* /var/www/office-management/frontend/
sudo chown -R www-data:www-data /var/www/office-management/frontend

# Restart services
echo -e "${GREEN}Step 8: Restarting services...${NC}"
sudo systemctl start office-management-backend
sudo systemctl reload nginx

# Wait a moment for service to start
sleep 3

# Check service status
if sudo systemctl is-active --quiet office-management-backend; then
    echo -e "${GREEN}Backend service is running.${NC}"
else
    echo -e "${RED}Backend service failed to start. Check logs: sudo journalctl -u office-management-backend -n 50${NC}"
    exit 1
fi

# Check Nginx status
if sudo systemctl is-active --quiet nginx; then
    echo -e "${GREEN}Nginx is running.${NC}"
else
    echo -e "${RED}Nginx failed to start. Check logs: sudo tail -f /var/log/nginx/error.log${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment completed successfully!"
echo "==========================================${NC}"
echo ""
echo "Service status:"
sudo systemctl status office-management-backend --no-pager -l
echo ""
echo "Backups saved in: $BACKUP_DIR"

