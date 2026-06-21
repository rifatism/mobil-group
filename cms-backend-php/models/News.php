<?php
class News {
    private $conn;
    private $table = "news";

    public $id;
    public $title;
    public $slug;
    public $content;
    public $excerpt;
    public $image;
    public $author;
    public $published;
    public $featured;
    public $views;

    public function __construct($db) {
        $this->conn = $db;
    }

    // Получить все новости
    public function getAll($page = 1, $limit = 10, $published = null, $featured = null) {
        $offset = ($page - 1) * $limit;
        
        $query = "SELECT * FROM " . $this->table . " WHERE 1=1";
        $params = [];

        if ($published !== null) {
            $query .= " AND published = :published";
            $params[':published'] = $published;
        }

        if ($featured !== null) {
            $query .= " AND featured = :featured";
            $params[':featured'] = $featured;
        }

        $query .= " ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
        $params[':limit'] = $limit;
        $params[':offset'] = $offset;

        $stmt = $this->conn->prepare($query);
        
        foreach ($params as $key => $value) {
            if ($key === ':limit' || $key === ':offset') {
                $stmt->bindValue($key, $value, PDO::PARAM_INT);
            } else {
                $stmt->bindValue($key, $value);
            }
        }
        
        $stmt->execute();
        return $stmt;
    }

    // Получить новость по ID
    public function getById($id) {
        $query = "SELECT * FROM " . $this->table . " WHERE id = :id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetch();
    }

    // Создать новость
    public function create() {
        $this->slug = $this->generateSlug($this->title);
        
        $query = "INSERT INTO " . $this->table . " 
                  (title, slug, content, excerpt, image, author, published, featured) 
                  VALUES (:title, :slug, :content, :excerpt, :image, :author, :published, :featured)";

        $stmt = $this->conn->prepare($query);

        $stmt->bindValue(':title', $this->title);
        $stmt->bindValue(':slug', $this->slug);
        $stmt->bindValue(':content', $this->content);
        $stmt->bindValue(':excerpt', $this->excerpt);
        $stmt->bindValue(':image', $this->image);
        $stmt->bindValue(':author', $this->author);
        $stmt->bindValue(':published', $this->published, PDO::PARAM_BOOL);
        $stmt->bindValue(':featured', $this->featured, PDO::PARAM_BOOL);

        if ($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    // Обновить новость
    public function update($id) {
        $query = "UPDATE " . $this->table . " 
                  SET title = :title, content = :content, excerpt = :excerpt, 
                      image = :image, published = :published, featured = :featured 
                  WHERE id = :id";

        $stmt = $this->conn->prepare($query);

        $stmt->bindValue(':title', $this->title);
        $stmt->bindValue(':content', $this->content);
        $stmt->bindValue(':excerpt', $this->excerpt);
        $stmt->bindValue(':image', $this->image);
        $stmt->bindValue(':published', $this->published, PDO::PARAM_BOOL);
        $stmt->bindValue(':featured', $this->featured, PDO::PARAM_BOOL);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);

        return $stmt->execute();
    }

    // Удалить новость
    public function delete($id) {
        $query = "DELETE FROM " . $this->table . " WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        return $stmt->execute();
    }

    // Увеличить счетчик просмотров
    public function incrementViews($id) {
        $query = "UPDATE " . $this->table . " SET views = views + 1 WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        return $stmt->execute();
    }

    // Генерация slug
    private function generateSlug($title) {
        $slug = transliterator_transliterate('Any-Latin; Latin-ASCII', $title);
        $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $slug));
        return $slug . '-' . time();
    }
}
?>