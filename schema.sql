-- Database Schema for DG Tracker

-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS daily_reports CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Table for User Roles
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL, -- Serves as the login username/email
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Employee', 'Manager', 'Team Lead')),
    branch VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Daily Reports
CREATE TABLE daily_reports (
    id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    opening_dg INTEGER NOT NULL CHECK (opening_dg >= 0),
    number_of_op INTEGER NOT NULL CHECK (number_of_op >= 0),
    new_dg_requests INTEGER NOT NULL CHECK (new_dg_requests >= 0),
    total_dg_completed_today INTEGER NOT NULL CHECK (total_dg_completed_today >= 0),
    new_dg_completed_today_itself INTEGER NOT NULL CHECK (new_dg_completed_today_itself >= 0),
    new_dg_moved_to_follow_up INTEGER NOT NULL CHECK (new_dg_moved_to_follow_up >= 0),
    closing_dg INTEGER NOT NULL CHECK (closing_dg >= 0),
    branch VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT daily_reports_report_date_branch_key UNIQUE (report_date, branch)
);

-- Insert Default Accounts (Passwords: tambaram123, omr123, ecr123, manager123)
-- Using pre-computed bcrypt hashes to avoid dependencies on bcrypt setup during database migration.
-- tambaram123: $2a$10$Tlsptwn3tJpppGBsU/bOle/nzlp8Q.D13HuuXwhU2j/sghg9QnDAW
-- omr123: $2a$10$MpE6an5zKUoqFSlC8nqs3udJmQoySGZka8B5.9DqY/FqT9xmc1Ona
-- ecr123: $2a$10$xcao3LoKmugJ9TM5JeYGUek34m1ZjefoOL84OwhmG7akj1mrnUwgO
-- manager123: $2a$10$czlkNcMjsfSdwNBFqRY/z.Do4WxwtsOuQ8DIVK7ZUuiDt0Kc6SNFu
INSERT INTO users (email, password_hash, role, name, branch) VALUES
('tambaram', '$2a$10$Tlsptwn3tJpppGBsU/bOle/nzlp8Q.D13HuuXwhU2j/sghg9QnDAW', 'Employee', 'Tambaram Lead', 'Tambaram'),
('omr', '$2a$10$MpE6an5zKUoqFSlC8nqs3udJmQoySGZka8B5.9DqY/FqT9xmc1Ona', 'Employee', 'OMR Lead', 'OMR'),
('ecr', '$2a$10$xcao3LoKmugJ9TM5JeYGUek34m1ZjefoOL84OwhmG7akj1mrnUwgO', 'Employee', 'ECR Lead', 'ECR'),
('manager', '$2a$10$czlkNcMjsfSdwNBFqRY/z.Do4WxwtsOuQ8DIVK7ZUuiDt0Kc6SNFu', 'Manager', 'System Manager', NULL)
ON CONFLICT (email) DO NOTHING;

