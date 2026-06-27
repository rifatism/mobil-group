CREATE DATABASE IF NOT EXISTS cms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cms_db;

CREATE TABLE IF NOT EXISTS news (
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

CREATE TABLE IF NOT EXISTS vacancies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE,
    department VARCHAR(100) NOT NULL,
    employment_type VARCHAR(50) NOT NULL,
    salary_min INT DEFAULT 0,
    salary_max INT DEFAULT 0,
    description TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    path VARCHAR(500) NOT NULL,
    mimetype VARCHAR(100) NOT NULL,
    size INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Пользователи: 3 роли — admin, employee, client
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(150) DEFAULT '',
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(30) DEFAULT '',
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'employee', 'client') NOT NULL DEFAULT 'client',
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Кандидаты с формы заявок
CREATE TABLE IF NOT EXISTS form_candidates (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    fullname VARCHAR(150) NOT NULL,
    email    VARCHAR(100) NOT NULL,
    phone    VARCHAR(50)  DEFAULT '',
    position VARCHAR(200) DEFAULT '',
    message  TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI HR-чат: одобренные кандидаты
CREATE TABLE IF NOT EXISTS ai_candidates (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    candidate_name  VARCHAR(150) NOT NULL,
    candidate_phone VARCHAR(50)  DEFAULT '',
    vacancy_title   VARCHAR(200) NOT NULL,
    ai_summary      TEXT,
    transcript      LONGTEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Администратор по умолчанию (пароль: admin123)
INSERT IGNORE INTO users (username, full_name, email, password, role)
VALUES ('admin', 'Администратор', 'admin@mobilservice.ru',
        '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');
