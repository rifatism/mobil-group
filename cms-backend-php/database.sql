CREATE DATABASE IF NOT EXISTS cms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cms_db;

-- Таблица новостей
CREATE TABLE news (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE,
    content TEXT NOT NULL,
    excerpt VARCHAR(300),
    image VARCHAR(255) DEFAULT '',
    author VARCHAR(100) DEFAULT 'Администратор',
    published BOOLEAN DEFAULT FALSE,
    featured BOOLEAN DEFAULT FALSE,
    views INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Таблица вакансий
CREATE TABLE vacancies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE,
    department ENUM('IT', 'Маркетинг', 'Продажи', 'HR', 'Финансы', 'Другое') NOT NULL,
    employment_type ENUM('Полная', 'Частичная', 'Проектная', 'Стажировка', 'Удаленная') NOT NULL,
    salary_min INT DEFAULT 0,
    salary_max INT DEFAULT 0,
    salary_currency ENUM('RUB', 'USD', 'EUR') DEFAULT 'RUB',
    description TEXT NOT NULL,
    requirements JSON,
    responsibilities JSON,
    benefits JSON,
    active BOOLEAN DEFAULT TRUE,
    applications_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Таблица страниц
CREATE TABLE pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    meta_description VARCHAR(160),
    meta_keywords JSON,
    template ENUM('default', 'landing', 'contact', 'fullwidth') DEFAULT 'default',
    published BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    parent_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES pages(id) ON DELETE SET NULL
);

-- Таблица медиафайлов
CREATE TABLE media (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    path VARCHAR(500) NOT NULL,
    mimetype VARCHAR(100) NOT NULL,
    size INT NOT NULL,
    folder VARCHAR(100) DEFAULT 'uploads',
    alt VARCHAR(255) DEFAULT '',
    uploaded_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица пользователей (для авторизации)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'editor') DEFAULT 'editor',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Тестовый пользователь (пароль: admin123)
INSERT INTO users (username, email, password, role) VALUES 
('admin', 'admin@cms.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');