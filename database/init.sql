CREATE DATABASE IF NOT EXISTS office_expense_dbV2;
USE office_expense_dbV2;

DROP TABLE IF EXISTS embeddings;
DROP TABLE IF EXISTS gst_claims;
DROP TABLE IF EXISTS gst_rates;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  permissions VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  full_name VARCHAR(150),
  department VARCHAR(100),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  INDEX idx_username (username),
  INDEX idx_email (email)
);

CREATE TABLE expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date DATETIME NOT NULL,
  amount FLOAT NOT NULL,
  label VARCHAR(100) NOT NULL,
  item VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  gst_eligible BOOLEAN DEFAULT FALSE,
  gst_amount FLOAT DEFAULT 0,
  approved_for_gst BOOLEAN DEFAULT FALSE,
  approved_by_id INT,
  receipt_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_id) REFERENCES users(id),
  INDEX idx_user_id (user_id),
  INDEX idx_date (date),
  INDEX idx_status (status),
  INDEX idx_category (category)
);

CREATE TABLE embeddings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_id INT UNIQUE NOT NULL,
  text TEXT NOT NULL,
  embedding_vector LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES expenses(id),
  INDEX idx_expense_id (expense_id)
);

CREATE TABLE gst_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  vendor VARCHAR(255) NOT NULL,
  amount FLOAT NOT NULL,
  category VARCHAR(100) NOT NULL,
  gst_rate FLOAT NOT NULL,
  gst_amount FLOAT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'paid') DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  approved_by_id INT,
  approval_notes VARCHAR(500),
  bill_url VARCHAR(255),
  previous_status VARCHAR(50),
  last_status_change DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_id) REFERENCES users(id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_payment_status (payment_status),
  UNIQUE KEY unique_claim (user_id, id)
);

CREATE TABLE gst_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(100) UNIQUE NOT NULL,
  rate FLOAT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category)
);

INSERT INTO roles (name, permissions) VALUES
('Super Admin', 'all'),
('Admin', 'manage_team,approve_gst'),
('Employee', 'add_expenses,submit_gst');

INSERT INTO gst_rates (category, rate) VALUES
('petrol', 18),
('food', 5),
('travel', 18),
('utilities', 18),
('office_supplies', 18),
('other', 18);

INSERT INTO users (username, email, password_hash, role_id, full_name, department) VALUES
('admin', 'rohit@infomanav.com', '$2b$12$8Qv6SoJxKXy/3qRjL5.t.OvQ0Z5VY4yJ7q5L7v5F5e5D5c5b5a5N5m', 1, 'Admin User', 'Manager'),
('employee1', 'employee1@infomanav.com', '$2b$12$8Qv6SoJxKXy/3qRjL5.t.OvQ0Z5VY4yJ7q5L7v5F5e5D5c5b5a5N5m', 3, 'John Doe', 'Sales'),
('admin2', 'admin2@infomanav.com', '$2b$12$8Qv6SoJxKXy/3qRjL5.t.OvQ0Z5VY4yJ7q5L7v5F5e5D5c5b5a5N5m', 2, 'Admin Manager', 'Finance');