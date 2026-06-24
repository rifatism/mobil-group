-- Импорт для базы данных u3557148_Baze23145 на reg.ru
-- Выполнить через phpMyAdmin (база уже выбрана)

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

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

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(150) DEFAULT '',
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(30) DEFAULT '',
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'employee', 'client') NOT NULL DEFAULT 'client',
    client_type ENUM('individual','ip','selfemployed','company') DEFAULT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    folder_path VARCHAR(500) DEFAULT '',
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_size INT DEFAULT 0,
    file_type VARCHAR(100) DEFAULT '',
    uploaded_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS knowledge_tests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    questions JSON NOT NULL,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS knowledge_test_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    test_id INT NOT NULL,
    user_id INT DEFAULT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (test_id) REFERENCES knowledge_tests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_test_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    test_id INT NOT NULL,
    user_id INT NOT NULL,
    score INT DEFAULT 0,
    total INT DEFAULT 0,
    answers JSON DEFAULT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (test_id) REFERENCES knowledge_tests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT DEFAULT NULL,
    link VARCHAR(255) DEFAULT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Администратор по умолчанию (пароль: admin123)
INSERT IGNORE INTO users (username, full_name, email, password, role)
VALUES ('admin', 'Администратор', 'admin@mobilservice.ru',
        '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');
