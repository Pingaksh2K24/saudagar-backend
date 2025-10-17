-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Create status table
CREATE TABLE IF NOT EXISTS status (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Insert sample data
INSERT INTO roles (name, is_active) VALUES 
('Admin', true),
('Teacher', true),
('Student', true),
('Staff', true);

INSERT INTO departments (name, is_active) VALUES 
('Computer Science', true),
('Mathematics', true),
('Physics', true),
('Chemistry', true);

INSERT INTO status (name, is_active) VALUES 
('Active', true),
('Inactive', false),
('Pending', true),
('Suspended', false);